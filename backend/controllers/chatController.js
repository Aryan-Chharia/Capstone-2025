require("dotenv").config();
const path = require("path");
const Project = require("../models/projectSchema");
const Team = require("../models/teamSchema");
const Chat = require("../models/chatSchema");
const Message = require("../models/messageSchema");
const axios = require("axios");
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
	const hasDatasets = selectedDatasets.length > 0;		if (!projectId || (!hasContent && !hasFiles && !hasDatasets)) {
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
	await chat.save();		return res.json({
			message: "User message saved.",
			chatId: chat._id,
		});
	} catch (err) {
		console.error("Chat handler error:", err);
		return res.status(500).json({ error: "Internal server error." });
	}
}
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
	});		// b) Last 5 messages (excluding the one we are about to generate)
		const recentHistory = allMessages.slice(-5).map((msg) => ({
			role: msg.sender === "user" ? "user" : "assistant",
			content: msg.content,
		}));

		// 5. Prepare Data for FastAPI
		// Collect all uploaded CSV files from every user message in the chat
		const allUploadedFiles = [];
		allMessages.forEach((msg) => {
			if (msg.sender === "user" && Array.isArray(msg.tempFiles)) {
				msg.tempFiles.forEach((f) => {
					if (f && f.bufferBase64) {
						allUploadedFiles.push(f);
					}
				});
			}
		});

	// Resolve Dataset IDs to actual Dataset Objects (Name, URL)
	const datasetsContext = project.datasets
		.filter((d) => allDatasetIds.has(String(d._id)))
		.map((d) => ({
			name: d.name,
			url: d.url,
		}));
	
	// Include all uploaded files in datasets context with a descriptive label
	allUploadedFiles.forEach((file, index) => {
		datasetsContext.push({
			name: file.originalname || `Upload ${index + 1}`,
			url: "Current Upload",
		});
	});

	// 6. Call FastAPI (Single Source of Truth)
	const analysisContext = {
		// Rename 'history' to 'messages' to match analyzer expectation
		messages: recentHistory,
		datasets: datasetsContext,
	};
	const contextString = JSON.stringify(analysisContext);

	console.log('[aiReplyHandler] Sending to FastAPI:');
	console.log('  - user_text:', content.trim().substring(0, 100));
	console.log('  - context:', contextString);
	console.log('  - datasets in context:', datasetsContext);

	const FormData = require("form-data");
	const form = new FormData();
	form.append("user_text", content.trim());
	form.append("context", contextString);		// Attach all uploaded CSV files to the form
		allUploadedFiles.forEach((file) => {
			const buffer = Buffer.from(file.bufferBase64, "base64");
			const filename = file.originalname || "dataset.csv";
			// Use 'files' field name to match FastAPI list parameter
			form.append("files", buffer, { filename, contentType: "text/csv" });
		});

		const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";
		let urlObj;
		try {
			urlObj = new URL(FASTAPI_URL);
		} catch (e) {
			urlObj = new URL(`http://${FASTAPI_URL}`);
		}
		
		// Ensure we don't double-append /analyze if it's already in the env var
		if (!urlObj.pathname.endsWith("/analyze")) {
			urlObj.pathname = urlObj.pathname.replace(/\/+$/, "") + "/analyze";
		}
		const apiUrl = urlObj.toString();

		const response = await axios.post(apiUrl, form, {
			headers: {
				...form.getHeaders(),
			},
			maxBodyLength: Infinity,
			maxContentLength: Infinity,
		});

		const analysis = response.data;

		// Log a concise summary of the FastAPI analysis response
		try {
			const previewValues = analysis?.values && Array.isArray(analysis.values.data)
				? analysis.values.data.slice(0, 10)
				: (Array.isArray(analysis?.values) ? analysis.values.slice(0, 10) : undefined);
			const previewLabels = analysis?.values && analysis.values.labels ? analysis.values.labels.slice(0, 10) : undefined;
			const insightsPreview = typeof analysis?.insights === 'string' ? analysis.insights.slice(0, 150) : undefined;
			console.info('FastAPI /analyze response', {
				intent: analysis?.intent,
				graph_type: analysis?.graph_type,
				values_labels_preview: previewLabels,
				values_data_preview: previewValues,
				insights_preview: insightsPreview,
				chartjs_present: !!analysis?.chartjs,
			});
		} catch (logErr) {
			console.warn('Failed to log analysis response summary', logErr);
		}

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
	getChatHistory,
	createChatManually,
	renameChat,
};