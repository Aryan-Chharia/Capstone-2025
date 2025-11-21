/**
 * @file routes/projectRoutes.js
 * @description Routes for creating, reading, updating, and deleting projects.
 */

const express = require("express");
const { verifyToken } = require("../middlewares/auth");
const { datasetUpload } = require("../middlewares/upload");
const { verifyTeamAdminForProject } = require("../middlewares/teamAuth");
const {
	loadProject,
	createProject,
	getProject,
	updateProject,
	deleteProject,
	listProjects,
	createChatForProject,
	uploadDataset,
	listDatasets,
} = require("../controllers/projectController");

const router = express.Router();
router.use(verifyToken);

// Auto-load project object on routes with :projectId
router.param("projectId", loadProject);

/**
 * @route   POST /
 * @desc    Create a new project under a specified team
 * @access  Private
 */
router.post("/", createProject);

/**
 * @route   GET /
 * @desc    List all projects in your organization
 * @access  Private
 */
router.get("/", listProjects);

/**
 * @route   GET /:projectId
 * @desc    Get a project’s details (includes chat history)
 * @access  Private
 */
router.get("/:projectId", getProject);

/**
 * @route   POST /:projectId/chat
 * @desc    Create a new chat for a project
 * @access  Private
 */
router.post("/:projectId/chat", createChatForProject);

/**
 * @route   PATCH /:projectId
 * @desc    Update a project’s name or description
 * @access  Private
 */
router.patch("/:projectId", verifyTeamAdminForProject, updateProject);

/**
 * @route   DELETE /:projectId
 * @desc    Delete a project and its associated chat/messages
 * @access  Private
 */
router.delete("/:projectId", verifyTeamAdminForProject, deleteProject);

// Wrap multer to return JSON on validation errors (e.g., invalid file type)
router.post(
	"/:projectId/datasets",
	(req, res, next) => {
		datasetUpload.array("files", 10)(req, res, (err) => {
			if (err) {
				const msg = err.message || "Upload failed";
				const invalid = /invalid|unsupported|format|extension/i.test(msg || "");
				const status = Number(err?.http_code) || 400;
				return res.status(status).json({
					error: invalid
						? "Unsupported file type. Allowed: csv, xls, xlsx."
						: msg,
					code: err?.code || undefined,
				});
			}
			next();
		});
	},
	uploadDataset
);

router.get("/:projectId/datasets", listDatasets);

module.exports = router;
