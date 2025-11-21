/**
 * @file config/expressConfig.js
 * @description Configures express middleware: body parser, session, cookies, CORS, etc.
 */

const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const methodOverride = require("method-override");
const session = require("express-session");

/**
 * Applies core middleware to the express app.
 *
 * @param {Object} app - The express app instance
 */
const expressConfig = (app) => {
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({ extended: true }));
	// CORS configuration for local and Vercel deployments
	app.use(cors({
		origin: (origin, callback) => {
			if (!origin) return callback(null, true); // allow non-browser requests
			const allowList = [
				/^http:\/\/localhost:(3001|5173)$/,
				/^http:\/\/127\.0\.0\.1:(3001|5173)$/,
				/^https?:\/\/[a-z0-9-]+\.(?:[a-z0-9-]+\.)*vercel\.app$/i,
			];
			const allowed = allowList.some((re) => re.test(origin));
			return callback(null, allowed);
		},
		credentials: true,
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
	}));
	app.use(cookieParser());
	app.use(methodOverride("_method"));

	const path = require("path");
	app.use(express.static(path.join(__dirname, "../public")));
	app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
	app.set("view engine", "ejs");

	app.use(
		session({
			secret: process.env.SESSION_SECRET || "default_secret",
			resave: false,
			saveUninitialized: false,
		})
	);

	// Passport setup (uncomment if using Google Auth)
	// app.use(passport.initialize());
	// app.use(passport.session());
};

module.exports = expressConfig;
