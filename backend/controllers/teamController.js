/**
 * @file controllers/teamController.js
 * @description Controller functions for Team-related routes.
 */

const Team = require("../models/teamSchema");
const User = require("../models/userSchema");
const Project = require("../models/projectSchema");
const Chat = require("../models/chatSchema");
const Message = require("../models/messageSchema");

/**
 * @function
 * @name loadTeam
 * @description Middleware: loads a Team document by ID, verifies it belongs to the same organization.
 */
async function loadTeam(req, res, next, teamId) {
	try {
		const team = await Team.findById(teamId); // Find team by ID
		if (!team) {
			return res.status(404).json({ error: "Team not found!" });
		}

		// Check if the team belongs to the same organization as the user
		if (team.organization.toString() !== req.user.organization.toString()) {
			return res
				.status(403)
				.json({ error: "Not authorized to access this team." });
		}

		req.team = team; // Attach team to request object
		next(); // Proceed to the next middleware/handler
	} catch (err) {
		next(err); // Forward any errors
	}
}

/**
 * @function
 * @name createTeam
 * @description Creates a new team with the current user as the admin.
 */
const createTeam = async (req, res) => {
	try {
		const { name } = req.body;

		// Validate name
		if (!name || !name.trim()) {
			return res.status(400).json({ error: "Team name is required." });
		}

		const orgId = req.user.organization;

		// Check if team with same name exists in this org
		const existingTeam = await Team.findOne({
			name: name.trim(),
			organization: orgId,
		});
		if (existingTeam) {
			return res.status(400).json({ error: "Team name already exists!" });
		}

		// Create the team with the creator as admin
		const team = new Team({
			name: name.trim(),
			organization: orgId,
			members: [
				{
					user: req.user.userId,
					role: "team_admin",
					accessLevel: "admin",
				},
			],
		});
		await team.save(); // Save team to DB

		// Add this team to the creator’s user profile
		await User.findByIdAndUpdate(req.user.userId, {
			$push: { teams: team._id },
		});

		res.status(201).json({ message: "Team created successfully!", team });
	} catch (error) {
		console.error("Create Team Error:", error);
		res.status(500).json({ error: "Server error!" });
	}
};

/**
 * @function
 * @name addMember
 * @description Adds a user to a team with optional role and accessLevel.
 * Admin can specify access level (read/write) when adding a member.
 */
const addMember = async (req, res) => {
	try {
		const { userId, role = "member", accessLevel } = req.body; // accessLevel comes from input
		const team = req.team;

		// Check if user exists in same organization
		const userExists = await User.findOne({
			_id: userId,
			organization: req.user.organization,
		});
		if (!userExists) {
			return res
				.status(404)
				.json({ error: "User not found in this organization!" });
		}

		// Check if user already in team
		if (team.members.some((member) => member.user && member.user.toString() === userId)) {
			return res.status(400).json({ error: "User is already in the team!" });
		}

		// Default accessLevel if not provided
		const assignedAccess =
			accessLevel && ["read", "write"].includes(accessLevel.toLowerCase())
				? accessLevel.toLowerCase()
				: "read";

		// Add user to team
		team.members.push({ user: userId, role, accessLevel: assignedAccess });
		await team.save();

		// Add team to user's team list
		await User.findByIdAndUpdate(userId, {
			$push: { teams: team._id },
		});

		res.json({ message: "Member added successfully!", team });
	} catch (error) {
		console.error("Add Member Error:", error);
		res.status(500).json({ error: "Server error!" });
	}
};

/**
 * @function
 * @name removeMember
 * @description Removes a user from a team, ensuring at least one admin remains.
 */
const removeMember = async (req, res) => {
	try {
		const { userId } = req.body;
		const team = req.team;

		// Find member index in team
		const memberIndex = team.members.findIndex(
			(member) => member.user && member.user.toString() === userId
		);
		if (memberIndex === -1) {
			return res.status(400).json({ error: "User is not in the team!" });
		}

		// Count remaining team_admins
		const adminCount = team.members.filter(
			(member) => member.role === "team_admin"
		).length;

		// Prevent removing the last admin
		if (team.members[memberIndex].role === "team_admin" && adminCount === 1) {
			return res
				.status(400)
				.json({ error: "Cannot remove the last team admin!" });
		}

		// Remove member from team
		team.members.splice(memberIndex, 1);
		await team.save();

		// Remove team from user's team list
		await User.findByIdAndUpdate(userId, {
			$pull: { teams: team._id },
		});

		res.json({ message: "Member removed successfully!", team });
	} catch (error) {
		console.error("Remove Member Error:", error);
		res.status(500).json({ error: "Server error!" });
	}
};

/**
 * @function
 * @name getTeam
 * @description Returns details of a team and populates member info.
 */
const getTeam = async (req, res) => {
	try {
		const team = await Team.findById(req.params.id)
			.populate("members.user", "name email role") // Populate user fields
			.where({ organization: req.user.organization });

		if (!team) {
			return res.status(404).json({ error: "Team not found!" });
		}

		res.json({ team });
	} catch (error) {
		console.error("Get Team Error:", error);
		res.status(500).json({ error: "Server error!" });
	}
};

/**
 * @function
 * @name getUserTeams
 * @description Lists all teams that the authenticated user is a part of.
 */
const getUserTeams = async (req, res) => {
	try {
		const userId = req.user.userId;
		const orgId = req.user.organization;

		// Find all teams where user is a member
		const teams = await Team.find({
			"members.user": userId,
			organization: orgId,
		}).select("name members"); // Select only necessary fields

		res.json({ teams });
	} catch (error) {
		console.error("Fetch User Teams Error:", error);
		res.status(500).json({ error: "Server error!" });
	}
};

/**
 * @function
 * @name deleteTeam
 * @description Deletes a team and removes it from users' records.
 *              Also deletes all projects, chats, and messages associated with the team.
 */
const deleteTeam = async (req, res) => {
	try {
		const teamId = req.team._id;

		// 1. Find all projects associated with this team
		const projects = await Project.find({ team: teamId });
		const projectIds = projects.map((p) => p._id);

		// 2. Find all chats associated with these projects
		// Projects have an array of chat IDs
		const chatIds = projects.flatMap((p) => p.chats);

		// 3. Delete all messages in those chats
		if (chatIds.length > 0) {
			await Message.deleteMany({ chat: { $in: chatIds } });
			await Chat.deleteMany({ _id: { $in: chatIds } });
		}

		// 4. Delete the projects
		if (projectIds.length > 0) {
			await Project.deleteMany({ _id: { $in: projectIds } });
		}

		// 5. Delete the team document
		await Team.findByIdAndDelete(teamId);

		// 6. Remove team from all users who are part of it
		await User.updateMany({ teams: teamId }, { $pull: { teams: teamId } });

		res.json({
			message: "Team and all associated projects/chats deleted successfully!",
		});
	} catch (error) {
		console.error("Delete Team Error:", error);
		res.status(500).json({ error: "Server error!" });
	}
};

/**
 * @function
 * @name listTeams
 * @description Lists all teams in the user's organization.
 */
const listTeams = async (req, res) => {
	try {
		const teams = await Team.find({ organization: req.user.organization })
			.select("name members") // Select basic fields
			.lean(); // Return plain JS objects

		res.json({ success: true, teams });
	} catch (error) {
		res.status(500).json({ error: "Server error" });
	}
};

/**
 * @function
 * @name changeAdmin
 * @description Change the team admin to another existing member.
 * Ensures at least one admin always remains.
 */
const changeAdmin = async (req, res) => {
	try {
		const { newAdminId } = req.body;
		const team = req.team;

		// Check if the new admin is a member of the team
		const newAdmin = team.members.find(
			(member) => member.user && member.user.toString() === newAdminId
		);
		if (!newAdmin) {
			return res
				.status(400)
				.json({ error: "User is not a member of the team!" });
		}

		// If the user is already an admin, do nothing
		if (newAdmin.role === "team_admin") {
			return res.status(400).json({ error: "User is already a team admin!" });
		}

		// Demote current admins
		team.members.forEach((member) => {
			if (member.role === "team_admin") {
				member.role = "member";
				// Reset access level to read unless they were explicitly something else?
				// Safer to default to 'read' or 'write' depending on policy.
				// Let's set to 'write' so they don't lose all privileges, or 'read' for safety.
				// Given the previous code set it to 'read', we'll stick to 'read' but maybe 'write' is friendlier.
				member.accessLevel = "write"; 
			}
		});

		// Promote new admin
		newAdmin.role = "team_admin";
		newAdmin.accessLevel = "admin";

		await team.save();

		res.json({ message: "Team admin changed successfully!", team });
	} catch (error) {
		console.error("Change Admin Error:", error);
		res.status(500).json({ error: "Server error!" });
	}
};
/**
 * @function
 * @name changeAccessLevel
 * @description Change a member's access level within a team. Only team_admin can do this.
 */
const changeAccessLevel = async (req, res) => {
	try {
		const { userId, accessLevel } = req.body;
		const team = req.team;

		// Validate input
		if (!userId || !accessLevel) {
			return res
				.status(400)
				.json({ error: "userId and accessLevel are required!" });
		}

		const validAccessLevels = ["read", "write", "admin"];
		if (!validAccessLevels.includes(accessLevel.toLowerCase())) {
			return res.status(400).json({
				error: `accessLevel must be one of ${validAccessLevels.join(", ")}`,
			});
		}

		// Find the member in the team
		const member = team.members.find((m) => m.user && m.user.toString() === userId);
		if (!member) {
			return res
				.status(404)
				.json({ error: "User is not a member of the team!" });
		}

		// Update access level
		member.accessLevel = accessLevel.toLowerCase();
		await team.save();

		res.json({ message: "Access level updated successfully!", team });
	} catch (error) {
		console.error("Change Access Level Error:", error);
		res.status(500).json({ error: "Server error!" });
	}
};

module.exports = {
	loadTeam,
	createTeam,
	addMember,
	removeMember,
	getTeam,
	getUserTeams,
	deleteTeam,
	listTeams,
	changeAdmin,
	changeAccessLevel,
};
