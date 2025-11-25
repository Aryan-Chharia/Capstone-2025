/**
 * @file controllers/projectController.js
 * @description Controller functions for Project-related routes.
 */

const Project = require("../models/projectSchema");
const Team = require("../models/teamSchema");
const Chat = require("../models/chatSchema");
const Message = require("../models/messageSchema");

/**
 * @function
 * @name loadProject
 * @description Middleware: loads a Project by ID, verifies access, attaches to req.
 */
async function loadProject(req, res, next, projectId) {
	try {
		// Load project and populate team and team members
		const project = await Project.findById(projectId).populate({
			path: "team",
			populate: { path: "members.user", select: "_id" },
		});
		if (!project) {
			return res.status(404).json({ error: "Project not found." });
		}

		const team = project.team;
		const { userId, organization, role: globalRole } = req.user;

		// Superadmin can access all
		if (globalRole === "superadmin") {
			req.project = project;
			return next();
		}

		// Ensure team is in same organization
		if (team.organization.toString() !== organization.toString()) {
			return res.status(403).json({ error: "Not in this organization." });
		}

		// Find if the user is a team member
		const memberEntry = team.members.find(
			(m) => m.user && m.user._id.toString() === userId.toString()
		);
		if (!memberEntry) {
			return res.status(403).json({
				error: "You must be a member of this team to access the project.",
			});
		}

		// Allow if team admin or has admin-level access
		if (
			memberEntry.role === "team_admin" ||
			memberEntry.accessLevel === "admin"
		) {
			req.project = project;
			return next();
		}

		// Regular member: grant read-only access
		req.project = project;
		return next();
	} catch (err) {
		next(err);
	}
}

/**
 * @function
 * @name createProject
 * @description Creates a project and its chat under the specified team.
 */
const createProject = async (req, res) => {
	try {
		const { name, description = "", team: teamId } = req.body;

		if (!name || !teamId) {
			return res
				.status(400)
				.json({ error: "Project name and team are required." });
		}

		const team = await Team.findOne({
			_id: teamId,
			organization: req.user.organization,
		});
		if (!team) {
			return res.status(404).json({ error: "Team not found." });
		}

		// Check if user has permission to create project (team_admin or write/admin access)
		const member = team.members.find(
			(m) => m.user.toString() === req.user.userId
		);
		if (
			!member ||
			(member.role !== "team_admin" &&
				member.accessLevel !== "admin" &&
				member.accessLevel !== "write")
		) {
			return res
				.status(403)
				.json({ error: "Insufficient permissions to create a project." });
		}

		const project = await Project.create({
			name: name.trim(),
			team: teamId,
			description: description.trim(),
			chats: [], // multiple chats later
		});

		res.status(201).json({ message: "Project created successfully!", project });
	} catch (error) {
		console.error("Create Project Error:", error);
		res.status(500).json({ error: "Server error!" });
	}
};

/**
 * @function
 * @name getProject
 * @description Returns details of a project including chat messages.
 */
const getProject = async (req, res) => {
	try {
		// Populate project with team and chat messages
		const project = await Project.findById(req.project._id)
			.populate("team", "name")
			.populate({
				path: "chats",
				populate: {
					path: "messages",
					options: { sort: { _id: 1 } },
				},
			});

		res.json({ project });
	} catch (error) {
		console.error("Get Project Error:", error);
		res.status(500).json({ error: "Server error!" });
	}
};

/**
 * @function
 * @name updateProject
 * @description Updates name or description of a project (team cannot be changed).
 */
const updateProject = async (req, res) => {
	try {
		const { name, description } = req.body;
		const updates = {};

		// Prepare update fields if provided
		if (name) updates.name = name.trim();
		if (description !== undefined) updates.description = description.trim();

		// Find and update project
		const project = await Project.findOneAndUpdate(
			{ _id: req.project._id },
			updates,
			{ new: true, runValidators: true }
		);
		if (!project) {
			return res.status(404).json({ error: "Project not found." });
		}

		res.json({ success: true, project });
	} catch (error) {
		console.error("Update Project Error:", error);
		res.status(500).json({ error: "Server error!" });
	}
};

/**
 * @function
 * @name deleteProject
 * @description Deletes a project and its associated chat and messages.
 */
const deleteProject = async (req, res) => {
	try {
		const project = req.project;

		// Delete all messages and chats efficiently
		if (project.chats && project.chats.length > 0) {
			await Message.deleteMany({ chat: { $in: project.chats } });
			await Chat.deleteMany({ _id: { $in: project.chats } });
		}

		// Delete the project itself
		await Project.findByIdAndDelete(project._id);

		res.json({ message: "Project (and its chat) deleted." });
	} catch (error) {
		console.error("Delete Project Error:", error);
		res.status(500).json({ error: "Server error!" });
	}
};

/**
 * @function
 * @name listProjects
 * @description Lists all projects within the user's organization.
 */
const listProjects = async (req, res) => {
	try {
		const { userId, organization, role } = req.user;

		// Find all teams in the organization
		let query = { organization };

		// If not superadmin, filter teams where user is a member
		if (role !== "superadmin") {
			const userTeams = await Team.find({
				organization,
				"members.user": userId,
			}).select("_id");
			const teamIds = userTeams.map((t) => t._id);
			
			// Find projects belonging to those teams
			const projects = await Project.find({ team: { $in: teamIds } })
				.populate("team", "name")
				.populate("chats", "messages") // Be careful populating all messages for list view, might be heavy
				.lean();
				
			return res.json({ success: true, projects });
		}

		// Superadmin sees all projects in organization
		const teams = await Team.find({ organization }).select("_id");
		const teamIds = teams.map((t) => t._id);

		const projects = await Project.find({ team: { $in: teamIds } })
			.populate("team", "name")
			.populate("chats", "messages")
			.lean();

		res.json({ success: true, projects });
	} catch (error) {
		console.error("List Projects Error:", error);
		res.status(500).json({ error: "Server error" });
	}
};
const createChatForProject = async (req, res) => {
	try {
		// Use req.project from loadProject middleware
		const project = req.project;
		
		// Access is already verified by loadProject, but we might want to enforce write access
		const team = project.team;
		const member = team.members.find(
			(m) => m.user && m.user._id.toString() === req.user.userId
		);

		if (
			member.role !== "team_admin" && 
			member.accessLevel !== "admin" && 
			member.accessLevel !== "write"
		) {
			return res.status(403).json({ error: "Insufficient permissions to create chat." });
		}

		const chat = await Chat.create({ project: project._id, messages: [] });

		project.chats.push(chat._id);
		await project.save();

		res.status(201).json({ message: "New chat created for project.", chat });
	} catch (err) {
		console.error("Create Chat Error:", err);
		res.status(500).json({ error: "Server error." });
	}
};

const uploadDataset = async (req, res) => {
	try {
		// req.project is already loaded and access verified by loadProject middleware
		const project = req.project;
		const files = req.files;

		if (!files || files.length === 0)
			return res.status(400).json({ error: "No files uploaded." });

		// We can double check write permissions if needed, but loadProject allows read-only members too.
		// If we want to restrict upload to admin/write access, we should check here.
		// loadProject allows: team_admin, admin, write, read.
		// Let's restrict upload to team_admin, admin, or write.
		
		const team = project.team;
		const member = team.members.find(
			(m) => m.user && m.user._id.toString() === req.user.userId
		);

		// Although loadProject checks membership, we might want to enforce 'write' access for uploads
		if (
			member.role !== "team_admin" && 
			member.accessLevel !== "admin" && 
			member.accessLevel !== "write"
		) {
			return res.status(403).json({ error: "Insufficient permissions to upload datasets." });
		}

		for (const file of files) {
			project.datasets.push({
				name: file.originalname,
				url: file.path, // multer-storage-cloudinary provides the hosted URL in path
				uploadedBy: req.user.userId,
			});
		}

		await project.save();
		res
			.status(201)
			.json({ message: "Datasets uploaded successfully", project });
	} catch (err) {
		console.error("Upload Dataset Error:", err);
		res.status(500).json({ error: err?.message || "Server error" });
	}
};

const listDatasets = async (req, res) => {
	try {
		// req.project is loaded by loadProject middleware
		// We need to populate uploadedBy field which isn't populated by loadProject
		await req.project.populate("datasets.uploadedBy", "name email");
		
		res.json({ success: true, datasets: req.project.datasets });
	} catch (err) {
		console.error("List Datasets Error:", err);
		res.status(500).json({ error: "Server error" });
	}
};

module.exports = {
	loadProject,
	createProject,
	getProject,
	updateProject,
	deleteProject,
	listProjects,
	createChatForProject,
	uploadDataset,
	listDatasets,
};
