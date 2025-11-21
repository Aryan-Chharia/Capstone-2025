/**
 * @file routes/userRoutes.js
 * @description Routes for user registration, email verification, login, and logout.
 */

const express = require("express");
const {
	registerUser,
	verifyUser,
	loginUser,
	logoutUser,
	listUsers,
	getUserById,
	updateUser,
	deleteUser,
} = require("../controllers/userController");
const { verifyToken } = require("../middlewares/auth");

const router = express.Router();

/**
 * @route   GET /
 * @desc    List all users in your organization
 * @access  Private
 */
router.get("/", verifyToken, listUsers);

/**
 * @route   GET /:id
 * @desc    Get a single user by ID
 * @access  Private
 */
router.get("/:id", verifyToken, getUserById);

/**
 * @route   PUT /:id
 * @desc    Update user details
 * @access  Private
 */
router.put("/:id", verifyToken, updateUser);

/**
 * @route   DELETE /:id
 * @desc    Delete a user
 * @access  Private
 */
router.delete("/:id", verifyToken, deleteUser);

/**
 * @route   POST /register
 * @desc    Register a new user (sends verification code)
 * @access  Public
 */
router.post("/register", registerUser);

/**
 * @route   POST /verify-email
 * @desc    Verify a pending user’s email with code
 * @access  Public
 */
router.post("/verify-email", verifyUser);

/**
 * @route   POST /login
 * @desc    Authenticate user and return JWT
 * @access  Public
 */
router.post("/login", loginUser);

/**
 * @route   POST /logout
 * @desc    Log out user (client should discard token)
 * @access  Private
 */
router.post("/logout", verifyToken, logoutUser);

module.exports = router;
