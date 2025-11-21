/**
 * @file routes/chatRoutes.js
 * @description Routes for interacting with per-project LLM chatbot.
 */

const express = require("express");
const {
	chatHandler,
	aiReplyHandler,
	getChatHistory,
	createChatManually,
	renameChat,
} = require("../controllers/chatController");
const { chatUpload } = require("../middlewares/upload");
const { verifyToken } = require("../middlewares/auth");

const router = express.Router();

// 1. Specific Routes (Place these before parameterized routes)

/**
 * @route   POST /api/chat/create
 * @desc    Manually create a new empty chat for a project
 * @access  Private
 */
router.post("/create", verifyToken, createChatManually);

/**
 * @route   PATCH /api/chat/rename
 * @desc    Rename a chat
 * @access  Private
 */
router.patch("/rename", verifyToken, renameChat);

/**
 * @route   POST /api/chat/ai
 * @desc    Send text to AI using last message context
 * @access  Private
 */
router.post("/ai", verifyToken, aiReplyHandler);

// 2. Main Chat Message Handler

/**
 * @route   POST /api/chat
 * @desc    Save message + datasets + temp files
 * @access  Private
 */
router.post(
	"/",
	verifyToken,
	(req, res, next) => {
		chatUpload.array("files", 100)(req, res, (err) => {
			if (err) {
				const msg = err.message || "Upload failed";
				const invalid = /invalid|unsupported|format|extension/i.test(msg || "");
				const status = Number(err?.http_code) || 400;
				return res.status(status).json({
					error: invalid ? "Unsupported file type. Allowed: csv, xls, xlsx." : msg,
					code: err?.code || undefined,
				});
			}
			next();
		});
	},
	chatHandler
);

// 3. Parameterized Routes (Place these last)

/**
 * @route   GET /api/chat/:projectId/:chatId
 * @desc    Get full chat history for a specific chat in a project
 * @access  Private
 */
router.get("/:projectId/:chatId", verifyToken, getChatHistory);

module.exports = router;
