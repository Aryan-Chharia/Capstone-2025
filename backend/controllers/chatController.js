/**
 * @file controllers/chatController.js
 * @description Handles per-project chat using GitHub-AI, persisting messages in MongoDB.
 */

require("dotenv").config();
const ModelClient = require("@azure-rest/ai-inference").default;
const { isUnexpected } = require("@azure-rest/ai-inference");
const { AzureKeyCredential } = require("@azure/core-auth");
const path = require("path");
const Project = require("../models/projectSchema");
const Team = require("../models/teamSchema");
const Chat = require("../models/chatSchema");
const Message = require("../models/messageSchema");
const { callFastAPIAnalyze } = require("../config/fastApiClient");
const axios = require("axios");

/** GitHub-AI / Azure REST config from .env */
const TOKEN = process.env.GITHUB_TOKEN;
const ENDPOINT = process.env.GITHUB_AI_ENDPOINT;
const MODEL = process.env.GITHUB_AI_MODEL;

/**
 * Output builders: keep them small and pure so storing/rendering can plug in later.
 */
function buildTextMessageOutput({ text, confidenceScore = null }) {
	return {
		type: "text",
		data: {
			text: String(text || ""),
			confidenceScore: confidenceScore ?? null,
		},
	};
}

function buildChartOutput({ chartType = "bar", title = "Sample Chart" } = {}) {
	// Dummy Chart.js configuration; replace data source later without changing shape
	// return {
	// 	type: "chart",
	// 	data: {
	// 		config: {
	// 			type: chartType,
	// 			data: {
	// 				labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
	// 				datasets: [
	// 					{
	// 						label: "Series A",
	// 						data: [12, 19, 3, 5, 2, 3],
	// 						backgroundColor: "rgba(59, 130, 246, 0.5)",
	// 						borderColor: "rgba(59, 130, 246, 1)",
	// 						borderWidth: 1,
	// 					},
	// 				],
	// 			},
	// 			options: {
	// 				responsive: true,
	// 				plugins: {
	// 					legend: { position: "top" },
	// 					title: { display: true, text: title },
	// 				},
	// 				scales: {
	// 					y: { beginAtZero: true },
	// 				},
	// 			},
	// 		},
	// 	},
	// };
	return {
		type: "chart",
		data: {
			config: {
				type: chartType,
				data: {
					labels: [
						"Total income",
						"Sales, government funding, grants and subsidies",
						"Interest, dividends and donations",
						"Non-operating income",
						"Total expenditure",
						"Interest and donations",
						"Indirect taxes",
						"Depreciation",
						"Salaries and wages paid",
						"Redundancy and severance",
					],
					datasets: [
						{
							label: "Value (in millions)",
							data: [
								"979594",
								"838626",
								"112188",
								"28781",
								"856960",
								"71493",
								"8540",
								"32896",
								"157616",
								"323",
							],
							backgroundColor: [
								"rgba(75, 192, 192, 0.6)",
								"rgba(75, 192, 192, 0.6)",
								"rgba(75, 192, 192, 0.6)",
								"rgba(75, 192, 192, 0.6)",
								"rgba(75, 192, 192, 0.6)",
								"rgba(75, 192, 192, 0.6)",
								"rgba(75, 192, 192, 0.6)",
								"rgba(75, 192, 192, 0.6)",
								"rgba(75, 192, 192, 0.6)",
								"rgba(75, 192, 192, 0.6)",
							],
							borderColor: [
								"rgba(75, 192, 192, 1)",
								"rgba(75, 192, 192, 1)",
								"rgba(75, 192, 192, 1)",
								"rgba(75, 192, 192, 1)",
								"rgba(75, 192, 192, 1)",
								"rgba(75, 192, 192, 1)",
								"rgba(75, 192, 192, 1)",
								"rgba(75, 192, 192, 1)",
								"rgba(75, 192, 192, 1)",
								"rgba(75, 192, 192, 1)",
							],
							borderWidth: 1,
						},
					],
				},
				options: {
					responsive: true,
					plugins: {
						legend: {
							position: "top",
						},
						title: {
							display: true,
							text: "Financial Variables vs Values (2024)",
						},
					},
					scales: {
						y: {
							beginAtZero: true,
							title: {
								display: true,
								text: "Value (Dollars in Millions)",
							},
						},
						x: {
							title: {
								display: true,
								text: "Financial Variables",
							},
						},
					},
				},
			},
		},
	};
}

/**
 * Build a chart output from a FastAPI /analyze response.
 * Expects response containing { chartjs, insights, summary }.
 * Ensures Chart.js config has responsive + title/legend options.
 */
function buildChartOutputFromAnalysis(analysis, { userQuery }) {
	try {
		const base = analysis?.chartjs || {};
		const type = base.type || "bar";
		const data = base.data || { labels: [], datasets: [] };
		// Merge provided options with sensible defaults
		const options = {
			responsive: true,
			plugins: {
				legend: { position: "top" },
				title: {
					display: true,
					text: (userQuery || "Analysis Chart").slice(0, 80),
				},
			},
			scales: {
				y: { beginAtZero: true },
			},
			...(base.options || {}),
		};
		return {
			type: "chart",
			data: {
				config: { type, data, options },
			},
			meta: {
				insights: analysis?.insights || null,
				summary: analysis?.summary || null,
				code: analysis?.code || null,
			},
		};
	} catch (e) {
		console.error("Failed to build chart output from analysis", e);
		// Fallback to dummy chart
		return buildChartOutput({ chartType: "bar", title: "Chart Error" });
	}
}

/**
 * @function
 * @name chatHandler
 * @description
 *   - Validates the requester belongs to the project’s team (or is team_admin/superadmin)
 *   - Saves the user’s message (text or image)
 *   - Sends it to GitHub-AI only if text exists
 *   - Saves bot reply (text only)
 *   - Returns the bot’s text + confidenceScore (if any)
 */
// async function chatHandler(req, res) {
// 	try {
// 		const { chatId, projectId, content } = req.body;
// 		const imageUrl = req.file?.path || null;

// 		if (!projectId || (!content?.trim() && !imageUrl)) {
// 			return res
// 				.status(400)
// 				.json({
// 					error:
// 						"projectId and at least one of content or imageUrl are required.",
// 				});
// 		}

// 		// 1) Load project + team + members
// 		const project = await Project.findById(projectId).populate({
// 			path: "team",
// 			populate: { path: "members.user", select: "_id role" },
// 		});
// 		if (!project) return res.status(404).json({ error: "Project not found." });

// 		const team = project.team;
// 		const { userId, organization, role: globalRole } = req.user;

// 		// 2) Access validation
// 		if (globalRole !== "superadmin") {
// 			if (team.organization.toString() !== organization.toString()) {
// 				return res.status(403).json({ error: "Not in this organization." });
// 			}
// 			const memberEntry = team.members.find(
// 				(m) => m.user._id.toString() === userId.toString()
// 			);
// 			if (!memberEntry) {
// 				return res.status(403).json({ error: "Not a member of this team." });
// 			}
// 		}

// 		// 3) Get or create chat
// 		let chat = null;
// 		if (chatId) {
// 			chat = await Chat.findOne({ _id: chatId, project: projectId });
// 		} else {
// 			chat = await Chat.findOne({ project: projectId });
// 			if (!chat) {
// 				chat = await Chat.create({ project: projectId, messages: [] });
// 				project.chats.push(chat._id);
// 				await project.save();
// 			}
// 		}
// 		if (!chat) {
// 			return res
// 				.status(404)
// 				.json({ error: "Chat not found or could not be created." });
// 		}

// 		// 4) Save user message
// 		const userMsg = await Message.create({
// 			chat: chat._id,
// 			sender: "user",
// 			content: content?.trim() || null,
// 			imageUrl: imageUrl,
// 		});
// 		chat.messages.push(userMsg._id);
// 		await chat.save();

// 		// 5) AI interaction
// 		if (content?.trim()) {
// 			const client = ModelClient(ENDPOINT, new AzureKeyCredential(TOKEN));
// 			const messagesPayload = [
// 				{ role: "system", content: "You are a helpful assistant." },
// 				{ role: "user", content: content.trim() },
// 			];

// 			const response = await client
// 				.path("/chat/completions")
// 				.post({ body: { model: MODEL, messages: messagesPayload } });

// 			if (isUnexpected(response)) {
// 				throw new Error(response.body.error?.message || "AI error");
// 			}

// 			const botText = response.body.choices[0].message.content;
// 			const confidence =
// 				response.body.choices[0].message.confidenceScore ?? null;

// 			const botMsg = await Message.create({
// 				chat: chat._id,
// 				sender: "chatbot",
// 				content: botText,
// 				confidenceScore: confidence,
// 			});
// 			chat.messages.push(botMsg._id);
// 			await chat.save();

// 			return res.json({ botReply: botText, confidenceScore: confidence });
// 		}

// 		// 6) Image-only message, no AI
// 		return res.json({ success: true, message: "Image-only message saved." });
// 	} catch (err) {
// 		console.error("Chat handler error:", err);
// 		return res.status(500).json({ error: "Internal server error." });
// 	}
// }
/**
 * Helper to normalize selectedDatasets input into an array of strings.
 * Handles JSON strings, comma-separated strings, single values, or arrays.
 */
function parseSelectedDatasets(input) {
	if (!input) return [];
	if (Array.isArray(input)) return input;

	if (typeof input === "string") {
		try {
			// Try parsing as JSON (e.g. "['id1', 'id2']")
			const parsed = JSON.parse(input);
			if (Array.isArray(parsed)) return parsed;
			return [parsed];
		} catch (_) {
			// Fallback: comma-separated (e.g. "id1,id2")
			return input.includes(",")
				? input.split(",").map((s) => s.trim()).filter(Boolean)
				: [input.trim()];
		}
	}
	return [input];
}

// POST /chat
async function chatHandler(req, res) {
	try {
		const { chatId, projectId, content } = req.body;
		
		// 1. Process Files: Only CSVs, store as Base64
		const incomingFiles = req.files || [];
		const tempFiles = incomingFiles
			.filter((f) => {
				const ext = path.extname(f.originalname || "").toLowerCase();
				return ext === ".csv" || f.mimetype === "text/csv";
			})
			.map((f) => ({
				originalname: f.originalname,
				mimetype: f.mimetype,
				size: f.size,
				headText: "", 
				bufferBase64: f.buffer?.toString("base64") || null,
			}));

		// 2. Normalize Datasets
		const selectedDatasets = parseSelectedDatasets(req.body.selectedDatasets);

		// 3. Validation: Must have ProjectID and at least one form of content
		const hasContent = content?.trim();
		const hasFiles = tempFiles.length > 0;
		const hasDatasets = selectedDatasets.length > 0;

		if (!projectId || (!hasContent && !hasFiles && !hasDatasets)) {
			return res.status(400).json({
				error: "projectId and at least one of content, selectedDatasets, or files are required.",
			});
		}

		// 4. Load Project & Check Access
		const project = await Project.findById(projectId).populate({
			path: "team",
			populate: { path: "members.user", select: "_id role" },
		});
		if (!project) return res.status(404).json({ error: "Project not found." });

		const team = project.team;
		if (!team) return res.status(404).json({ error: "Team not found." });

		const { userId, organization, role: globalRole } = req.user;

		if (globalRole !== "superadmin") {
			if (team.organization.toString() !== organization.toString()) {
				return res.status(403).json({ error: "Not in this organization." });
			}
			const memberEntry = team.members.find(
				(m) => m.user._id.toString() === userId.toString()
			);
			if (!memberEntry) {
				return res.status(403).json({ error: "Not a member of this team." });
			}
		}

		// 5. Get or Create Chat
		let chat;
		if (chatId) {
			chat = await Chat.findOne({ _id: chatId, project: projectId });
		} else {
			// Fallback: find any chat for project or create new
			chat = await Chat.findOne({ project: projectId });
			if (!chat) {
				chat = await Chat.create({
					project: projectId,
					title: "New chat",
					messages: [],
				});
				project.chats.push(chat._id);
				await project.save();
			}
		}

		if (!chat) {
			return res.status(404).json({ error: "Chat not found or could not be created." });
		}

		// 6. Save User Message
		const userMsg = await Message.create({
			chat: chat._id,
			sender: "user",
			content: content?.trim() || null,
			selectedDatasets,
			tempFiles,
		});

		chat.messages.push(userMsg._id);
		await chat.save();

		return res.json({
			message: "User message saved.",
			chatId: chat._id,
		});
	} catch (err) {
		console.error("Chat handler error:", err);
		return res.status(500).json({ error: "Internal server error." });
	}
}
// POST /chat/ai
async function aiReplyHandler(req, res) {
	try {
		const { chatId, projectId, content } = req.body;

		// 1. Validation
		if (!projectId || !chatId || !content?.trim()) {
			return res
				.status(400)
				.json({ error: "projectId, chatId, and content required." });
		}

		// 2. Load Context (Project, Team, Chat)
		const project = await Project.findById(projectId).populate({
			path: "team",
			populate: { path: "members.user", select: "_id role" },
		});
		if (!project) return res.status(404).json({ error: "Project not found." });

		const chat = await Chat.findById(chatId).populate("messages");
		if (!chat) return res.status(404).json({ error: "Chat not found." });

		const team = project.team;
		if (!team) return res.status(404).json({ error: "Team not found." });

		// 3. Access Control
		const { userId, organization, role: globalRole } = req.user;
		if (globalRole !== "superadmin") {
			if (team.organization.toString() !== organization.toString()) {
				return res.status(403).json({ error: "Not in this organization." });
			}
			const memberEntry = team.members.find(
				(m) => m.user._id.toString() === userId.toString()
			);
			if (!memberEntry) {
				return res.status(403).json({ error: "Not a member of this team." });
			}
		}

		// 4. Context Retrieval:
		//    a) Collect ALL datasets ever selected in this chat history
		//    b) Collect last 5 messages (User + AI) for conversation memory
		const allMessages = chat.messages || [];

		// a) Unique Dataset IDs from entire history
		const allDatasetIds = new Set();
		allMessages.forEach((msg) => {
			if (msg.selectedDatasets && msg.selectedDatasets.length > 0) {
				msg.selectedDatasets.forEach((dsId) => allDatasetIds.add(String(dsId)));
			}
		});

		// b) Last 5 messages (excluding the one we are about to generate)
		const recentHistory = allMessages.slice(-5).map((msg) => ({
			role: msg.sender === "user" ? "user" : "assistant",
			content: msg.content,
		}));

		// 5. Prepare Data for FastAPI
		// Find the latest user message to check for a just-uploaded file
		const lastUserMsg = [...allMessages].reverse().find((m) => m.sender === "user");
		const tempFiles = lastUserMsg?.tempFiles || [];
		const latestFile = tempFiles.find((f) => f.bufferBase64); // Prefer one with buffer

		// Resolve Dataset IDs to actual Dataset Objects (Name, URL)
		const datasetsContext = project.datasets
			.filter((d) => allDatasetIds.has(String(d._id)))
			.map((d) => ({
				name: d.name,
				url: d.url,
			}));
        
        // Include current uploaded file in datasets context if present
        if (latestFile) {
            datasetsContext.push({
                name: latestFile.originalname,
                url: "Current Upload",
            });
        }

		// 6. Call FastAPI (Single Source of Truth)
		let fileBuffer = null;
		let fileName = "dataset.csv";

		if (latestFile) {
			fileBuffer = Buffer.from(latestFile.bufferBase64, "base64");
			fileName = latestFile.originalname;
		}

		const analysisContext = {
			history: recentHistory,
			datasets: datasetsContext,
		};
		const contextString = JSON.stringify(analysisContext);
        
        // Use axios directly to send FormData with context in body
        const FormData = require("form-data");
        const form = new FormData();
        form.append("user_query", content.trim());
        form.append("context", contextString);
        
        if (fileBuffer) {
            form.append("file", fileBuffer, { filename: fileName, contentType: "text/csv" });
        }

        const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";
        // Normalize URL
        let urlObj;
        try {
            urlObj = new URL(FASTAPI_URL);
        } catch (e) {
            urlObj = new URL(`http://${FASTAPI_URL}`);
        }
        urlObj.pathname = urlObj.pathname.replace(/\/+$/, "") + "/analyze";
        const apiUrl = urlObj.toString();

		const response = await axios.post(apiUrl, form, {
            headers: {
                ...form.getHeaders(),
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        });
        
        const analysis = response.data;

		// 7. Process Response (Raw Display)
		// const outputs = [];
		// const wantsChart = /\b(chart|graph|plot|visualize)\b/i.test(content || "");

		// // Always add chart if available
		// const chartOut = buildChartOutputFromAnalysis(analysis, {
		// 	userQuery: content.trim(),
		// });
		// outputs.push(chartOut);

		// // Add text insight
		// if (!wantsChart && analysis?.insights) {
		// 	outputs.push(buildTextMessageOutput({ text: analysis.insights }));
		// }

		// 8. Save Bot Message
		const botMsg = await Message.create({
			chat: chat._id,
			sender: "chatbot",
			content: JSON.stringify(analysis), // Save raw response for now
		});
		chat.messages.push(botMsg._id);
		await chat.save();

		return res.json(analysis);
	} catch (err) {
		console.error("AI Reply Error:", err);
		return res.status(500).json({ error: "Internal server error." });
	}
}

// async function aiReplyHandler(req, res) {
// 	try {
// 		const { chatId, projectId, content } = req.body;
// 		if (!projectId || !chatId || !content?.trim()) {
// 			return res
// 				.status(400)
// 				.json({ error: "projectId, chatId, and content required." });
// 		}

// 		const project = await Project.findById(projectId).populate({
// 			path: "team",
// 			populate: { path: "members.user", select: "_id role" },
// 		});
// 		if (!project) return res.status(404).json({ error: "Project not found." });

// 		const chat = await Chat.findById(chatId);
// 		if (!chat) return res.status(404).json({ error: "Chat not found." });

// 		// Access check
// 		const { userId, organization, role: globalRole } = req.user;
// 		const team = project.team;
// 		if (globalRole !== "superadmin") {
// 			if (team.organization.toString() !== organization.toString())
// 				return res.status(403).json({ error: "Not in this organization." });

// 			const memberEntry = team.members.find(
// 				(m) => m.user._id.toString() === userId.toString()
// 			);
// 			if (!memberEntry)
// 				return res.status(403).json({ error: "Not a member of this team." });
// 		}

// 		// Call FastAPI
// 		const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000/chat";
// 		const response = await axios.post(FASTAPI_URL, {
// 			user_query: content.trim(),
// 		});

// 		const botText = response.data.reply || "No reply received from AI.";
// 		const confidence = response.data.confidenceScore || null;

// 		const botMsg = await Message.create({
// 			chat: chat._id,
// 			sender: "chatbot",
// 			content: botText,
// 			confidenceScore: confidence,
// 		});
// 		chat.messages.push(botMsg._id);
// 		await chat.save();

// 		return res.json({
// 			botReply: botText,
// 			confidenceScore: confidence,
// 			outputs: [buildTextMessageOutput({ text: botText })],
// 		});
// 	} catch (err) {
// 		console.error("AI Reply Error:", err);
// 		return res.status(500).json({ error: "Internal server error." });
// 	}
// }

// PATCH /chat/rename
async function renameChat(req, res) {
	try {
		const { chatId, projectId, title } = req.body;
		if (!chatId || !projectId || !title || !title.trim()) {
			return res
				.status(400)
				.json({ error: "chatId, projectId and title are required." });
		}

		// Load project and verify access (same checks as other handlers)
		const project = await Project.findById(projectId).populate({
			path: "team",
			populate: { path: "members.user", select: "_id role" },
		});
		if (!project) return res.status(404).json({ error: "Project not found." });

		const team = project.team;
		if (!team) {
			return res.status(404).json({ error: "Team not found." });
		}

		const { userId, organization, role: globalRole } = req.user;
		if (globalRole !== "superadmin") {
			if (team.organization.toString() !== organization.toString()) {
				return res.status(403).json({ error: "Not in this organization." });
			}
			const memberEntry = team.members.find(
				(m) => m.user._id.toString() === userId.toString()
			);
			if (!memberEntry) {
				return res.status(403).json({ error: "Not a member of this team." });
			}
		}

		const updated = await Chat.findOneAndUpdate(
			{ _id: chatId, project: projectId },
			{ title: title.trim() },
			{ new: true }
		);
		if (!updated) return res.status(404).json({ error: "Chat not found." });

		return res.json({ success: true, chat: updated });
	} catch (err) {
		console.error("Rename Chat Error:", err);
		return res.status(500).json({ error: "Internal server error." });
	}
}

/**
 * @function
 * @name getChatHistory
 * @description Returns full chat history for a project
 */
const getChatHistory = async (req, res) => {
	try {
		const { projectId, chatId } = req.params;
		const { userId, organization, role: globalRole } = req.user;

		const project = await Project.findById(projectId).populate({
			path: "team",
			populate: { path: "members.user", select: "_id role" },
		});
		if (!project) return res.status(404).json({ error: "Project not found." });

		const team = project.team;
		if (!team) {
			return res.status(404).json({ error: "Team not found." });
		}

		if (globalRole !== "superadmin") {
			if (team.organization.toString() !== organization.toString()) {
				return res.status(403).json({ error: "Not in this organization." });
			}
			const memberEntry = team.members.find(
				(m) => m.user._id.toString() === userId.toString()
			);
			if (!memberEntry)
				return res.status(403).json({ error: "Not a member of this team." });
		}

		const chat = await Chat.findOne({
			_id: chatId,
			project: project._id,
		}).populate({
			path: "messages",
			options: { sort: { createdAt: 1 } },
		});
		if (!chat) return res.status(404).json({ error: "Chat not found." });

		return res.json({ chat });
	} catch (err) {
		console.error("Get Chat History Error:", err);
		return res.status(500).json({ error: "Server error." });
	}
};

/**
 * @function
 * @name createChatManually
 * @description Creates a new empty chat for a project (manual endpoint)
 */
const createChatManually = async (req, res) => {
	try {
		const { projectId } = req.body;
		if (!projectId)
			return res.status(400).json({ error: "projectId is required." });

		// Load project with team population for access check
		const project = await Project.findById(projectId).populate({
			path: "team",
			populate: { path: "members.user", select: "_id role" },
		});
		if (!project) return res.status(404).json({ error: "Project not found." });

		const team = project.team;
		if (!team) {
			return res.status(404).json({ error: "Team not found." });
		}

		// Access check
		const { userId, organization, role: globalRole } = req.user;
		if (globalRole !== "superadmin") {
			if (team.organization.toString() !== organization.toString()) {
				return res.status(403).json({ error: "Not in this organization." });
			}
			const memberEntry = team.members.find(
				(m) => m.user._id.toString() === userId.toString()
			);
			if (!memberEntry) {
				return res.status(403).json({ error: "Not a member of this team." });
			}
		}

		const newChat = await Chat.create({
			project: project._id,
			title: "New chat",
			messages: [],
		});
		project.chats.push(newChat._id);
		await project.save();

		return res
			.status(201)
			.json({ message: "New chat created for project.", chat: newChat });
	} catch (err) {
		console.error("Manual Chat Creation Error:", err);
		return res.status(500).json({ error: "Server error while creating chat." });
	}
};

module.exports = {
	chatHandler,
	aiReplyHandler,
	buildTextMessageOutput,
	buildChartOutput,
	getChatHistory,
	createChatManually,
	renameChat,
};