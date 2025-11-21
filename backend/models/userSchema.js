/**
 * @file models/user.js
 * @description Mongoose schema and model for User.
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// User schema structure
const UserSchema = new mongoose.Schema(
	{
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
			minlength: 6,
		},
		isVerified: {
			type: Boolean,
			default: false,
		},
		role: {
			type: String,
			enum: ["user", "team_creator", "organization_owner", "superadmin"],
			default: "user",
		},
		permissions: {
			type: [String],
			default: [],
		},
		organization: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Organization",
			required: true,
		},
		teams: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "Team",
			},
		],
	},
	{ timestamps: true }
);

// Hash password before saving (if modified)
UserSchema.pre("save", async function (next) {
	if (this.$locals.skipHashing) return next();
	if (!this.isModified("password")) return next();
	try {
		const salt = await bcrypt.genSalt(10);
		this.password = await bcrypt.hash(this.password, salt);
		next();
	} catch (err) {
		next(err);
	}
});

// Compare raw password with hashed one
UserSchema.methods.comparePassword = async function (candidatePass) {
	if (!this.password) return false;
	return await bcrypt.compare(candidatePass, this.password);
};

// Create and export User model
const User = mongoose.models.User || mongoose.model("User", UserSchema);
module.exports = User;
