/**
 * @file index.js
 * @description Entry point of the application. Initializes server, DB connection, and middleware.
 */

require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const expressConfig = require("./config/expressConfig");
const routes = require("./routes/index");
const { verifyToken } = require("./middlewares/auth");

const app = express();

// Connect to MongoDB
connectDB();

// Apply express middleware and config
expressConfig(app);

// Mount routes
app.use("/", routes);

/**
 * @route   GET /
 * @desc    Render index page after token verification
 * @access  Private
 */
app.get("/", verifyToken, (req, res) => {
	res.render("index", { user: req.user || null });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
