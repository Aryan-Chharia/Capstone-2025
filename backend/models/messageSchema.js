/**
 * @file models/message.js
 * @description Mongoose schema and model for Message.
 */
const mongoose = require("mongoose");
// Message schema structure
const MessageSchema = new mongoose.Schema(
	{
		chat: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Chat",
			required: true,
		},
		sender: {
			type: String,
			enum: ["user", "chatbot"],
			required: true,
		},
		content: {
			type: String,
			trim: true,
		},
		// Optional: store selected datasets for this user message
		selectedDatasets: [
			{
				type: mongoose.Schema.Types.ObjectId,
			},
		],
		// Optional: store temporary uploaded file metadata for this message (as saved by multer)
		tempFiles: {
			type: Array,
			default: [],
		},
		imageUrl: {
			type: String,
			default: null,
		},
		messageType: {
			type: String,
			enum: ["text", "image", "both"],
			default: "text",
		},
		confidenceScore: {
			type: Number,
			min: 0,
			max: 1,
			default: null,
		},
		references: [
			{
				type: String,
				trim: true,
			},
		],
	},
	{ timestamps: true }
);

// Index for efficient message retrieval by chat and timestamp
MessageSchema.index({ chat: 1, createdAt: 1 });

// Create and export Message model
const Message =
	mongoose.models.Message || mongoose.model("Message", MessageSchema);
module.exports = Message;
