/**
 * @file models/project.js
 * @description Mongoose schema and model for Project.
 */
const mongoose = require("mongoose");

// Project schema structure
const ProjectSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		team: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Team",
			required: true,
		},
		description: {
			type: String,
			trim: true,
			default: "",
		},
		chats: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "Chat",
			},
		],
		datasets: [
			{
				name: { type: String, required: true },
				url: { type: String, required: true },
				uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
				uploadedAt: { type: Date, default: Date.now },
			},
		],
	},
	{
		timestamps: true,
	}
);

// Index for team-based project queries
ProjectSchema.index({ team: 1 });

// Create and export Project model
const Project =
	mongoose.models.Project || mongoose.model("Project", ProjectSchema);
module.exports = Project;
