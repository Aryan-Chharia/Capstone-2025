/**
 * @file models/organization.js
 * @description Mongoose schema and model for Organization.
 */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Organization schema structure
const OrganizationSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: true,
			unique: true,
			trim: true,
		},
		domain: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			lowercase: true,
		},
		email: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			lowercase: true,
		},
		password: {
			type: String,
			required: true,
		},
	},
	{ timestamps: true }
);

// Virtual to populate organization users
OrganizationSchema.virtual("members", {
	ref: "User",
	localField: "_id",
	foreignField: "organization",
});

// Hash password before saving
OrganizationSchema.pre("save", async function (next) {
	if (!this.isModified("password")) return next();
	try {
		const salt = await bcrypt.genSalt(10);
		this.password = await bcrypt.hash(this.password, salt);
		next();
	} catch (err) {
		next(err);
	}
});

// Create and export Organization model
const Organization =
	mongoose.models.Organization ||
	mongoose.model("Organization", OrganizationSchema);
module.exports = Organization;
