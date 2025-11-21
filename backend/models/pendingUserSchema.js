/**
 * @file models/pendingUser.js
 * @description Mongoose schema and model for PendingUser.
 */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
// PendingUser schema structure
const PendingUserSchema = new mongoose.Schema({
	name: {
		type: String,
		required: true,
		trim: true,
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
	organization: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Organization",
		required: true,
	},
	verificationCode: {
		type: String,
		required: true,
	},
	expiresAt: {
		type: Date,
		required: true,
	},
});

// Hash password before saving
PendingUserSchema.pre("save", async function (next) {
	if (!this.isModified("password")) return next();
	try {
		const salt = await bcrypt.genSalt(10);
		this.password = await bcrypt.hash(this.password, salt);
		next();
	} catch (err) {
		next(err);
	}
});

// TTL index for auto-deletion
PendingUserSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Create and export PendingUser model
const PendingUser =
	mongoose.models.PendingUser ||
	mongoose.model("PendingUser", PendingUserSchema);
module.exports = PendingUser;
