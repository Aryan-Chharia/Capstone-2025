/**
 * @file routes/index.js
 * @description Main router: combines all sub-routers for chat, user, organization, team, and project.
 */

const express = require("express");
const chatRouter = require("./chatRoutes");
const userRouter = require("./userRoutes");
const organizationRouter = require("./organizationRoutes");
const teamRouter = require("./teamRoutes");
const projectRouter = require("./projectRoutes");

const router = express.Router();

/**
 * @route   /api/chat
 * @desc    Chatbot messaging routes
 */
router.use("/api/chat", chatRouter);

/**
 * @route   /api/users
 * @desc    User signup, verification, login, logout
 */
router.use("/api/users", userRouter);

/**
 * @route   /api/organizations
 * @desc    Organization signup, login, management
 */
router.use("/api/organizations", organizationRouter);

/**
 * @route   /api/teams
 * @desc    Team creation and membership management
 */
router.use("/api/teams", teamRouter);

/**
 * @route   /api/projects
 * @desc    Project CRUD and chat linkage
 */
router.use("/api/projects", projectRouter);

/**
 * @route   /api/*
 * @desc    Handle 404 for undefined API routes
 */
router.use("/api/*", (req, res) => {
	res.status(404).json({ error: "API route not found" });
});

module.exports = router;
