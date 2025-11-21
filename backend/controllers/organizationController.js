/**
 * @file controllers/organizationController.js
 * @description Controller functions for Organization-related routes.
 */

const Organization = require("../models/organizationSchema");
const User = require("../models/userSchema");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

/**
 * @function
 * @name createOrganization
 * @description Register a new organization. Requires { name, domain, email, password } in body.
 */
const createOrganization = async (req, res, next) => {
	try {
		const { name, domain, email, password } = req.body;

		// Validate required fields
		if (!name || !domain || !email || !password) {
			return res.status(400).json({ error: "All fields are required." });
		}

		// Check if email or domain already exists
		const existingOrg = await Organization.findOne({
			$or: [{ email: email.toLowerCase() }, { domain: domain.toLowerCase() }],
		});
		if (existingOrg) {
			const takenField =
				existingOrg.email === email.toLowerCase() ? "email" : "domain";
			return res.status(400).json({
				error: `An organization with that ${takenField} already exists.`,
			});
		}

		// Check if a user with this email already exists
		const existingUser = await User.findOne({ email: email.toLowerCase() });
		if (existingUser) {
			return res.status(400).json({
				error: "A user with this email already exists. Please use a different email for the organization owner.",
			});
		}

		// Create the organization
		const organization = await Organization.create({
			name: name.trim(),
			domain: domain.toLowerCase().trim(),
			email: email.toLowerCase().trim(),
			password,
		});

		// Create the Organization Owner as a User
		// This ensures they have a valid userId for chat/team functionality
		const user = await User.create({
			name: name.trim(), // Use Org name as initial User name
			email: email.toLowerCase().trim(),
			password: password, // Same password
			organization: organization._id,
			role: "organization_owner",
			isVerified: true, // Auto-verify the owner
		});

		const token = jwt.sign(
			{
				userId: user._id,
				organization: organization._id,
				email: user.email,
				role: user.role,
			},
			process.env.JWT_SECRET,
			{ expiresIn: "1d" }
		);

		res.status(201).json({
			success: true,
			message: "Organization registered successfully.",
			token,
			data: {
				id: organization._id,
				name: organization.name,
				email: organization.email,
				userId: user._id,
			},
		});
	} catch (error) {
		next(error);
	}
};

/**
 * @function
 * @name loginOrganization
 * @description Log in an organization. Authenticates the owner User to ensure system compatibility.
 */
const loginOrganization = async (req, res, next) => {
	try {
		const { email, password } = req.body;

		// 1. Try to find the User (Owner) first
		const user = await User.findOne({ email: email.toLowerCase() });
		
		if (user) {
			// Verify password
			const isMatch = await bcrypt.compare(password, user.password);
			if (!isMatch) {
				return res.status(400).json({ error: "Invalid credentials." });
			}

			// Generate User Token (Compatible with Chat/Teams)
			const token = jwt.sign(
				{
					userId: user._id,
					organization: user.organization,
					email: user.email,
					role: user.role,
				},
				process.env.JWT_SECRET,
				{ expiresIn: "1d" }
			);

			return res.json({
				success: true,
				token,
				data: {
					id: user.organization, // Return Org ID as 'id' for backward compat if needed, or clarify
					userId: user._id,
					name: user.name,
					email: user.email,
					role: user.role
				},
			});
		}

		// 2. Fallback: Find Organization directly (Legacy/Edge case)
		// This token will NOT work for Chat/Teams but allows Org management
		const org = await Organization.findOne({ email: email.toLowerCase() });
		if (!org) {
			return res.status(400).json({ error: "Invalid credentials." });
		}

		const isMatch = await bcrypt.compare(password, org.password);
		if (!isMatch) {
			return res.status(400).json({ error: "Invalid credentials." });
		}

		const token = jwt.sign(
			{
				orgId: org._id,
				name: org.name,
				email: org.email,
				role: "organization_owner",
			},
			process.env.JWT_SECRET,
			{ expiresIn: "1d" }
		);

		res.json({
			success: true,
			token,
			data: {
				id: org._id,
				name: org.name,
				email: org.email,
				warning: "Logged in as Organization entity. Some features (Chat) may not work. Please contact support to migrate to User account."
			},
		});
	} catch (error) {
		next(error);
	}
};

/**
 * @function
 * @name getOrganization
 * @description Get organization details along with its members.
 */
const getOrganization = async (req, res, next) => {
	try {
		const { id } = req.params;

		// Fetch organization and populate members
		const organization = await Organization.findById(id)
			.select("-password")
			.populate("members", "name email role");

		if (!organization) {
			return res.status(404).json({ error: "Organization not found." });
		}

		res.json({ success: true, data: organization });
	} catch (error) {
		next(error);
	}
};

/**
 * @function
 * @name getAllMembers
 * @description Fetch all members of a specific organization.
 */
const getAllMembers = async (req, res, next) => {
	try {
		const { id } = req.params;

		// Lookup organization and populate its members
		const organization = await Organization.findById(id).populate(
			"members",
			"name email role"
		);
		if (!organization) {
			return res.status(404).json({ error: "Organization not found." });
		}

		res.json({ success: true, members: organization.members });
	} catch (error) {
		next(error);
	}
};

/**
 * @function
 * @name makeCreator
 * @description Promote a user to team creator within an organization.
 */
const makeCreator = async (req, res, next) => {
	try {
		const { id, userId } = req.params;

		// Ensure organization exists
		const organization = await Organization.findById(id);
		if (!organization) {
			return res.status(404).json({ error: "Organization not found." });
		}

		// Find the user inside the organization
		const user = await User.findOne({ _id: userId, organization: id });
		if (!user) {
			return res
				.status(404)
				.json({ error: "User not found in this organization." });
		}

		// Promote the user
		user.role = "team_creator";
		await user.save();

		res.json({ success: true, message: "User is now a team admin." });
	} catch (error) {
		next(error);
	}
};

/**
 * @function
 * @name updateOrganization
 * @description Update organization details (like name, email, domain).
 */
const updateOrganization = async (req, res, next) => {
	try {
		const { id } = req.params;
		const updates = req.body;

		const organization = await Organization.findById(id);
		if (!organization) {
			return res.status(404).json({ error: "Organization not found." });
		}

		// Apply updates
		if (updates.name) organization.name = updates.name.trim();
		if (updates.domain) organization.domain = updates.domain.toLowerCase().trim();
		if (updates.email) organization.email = updates.email.toLowerCase().trim();
		if (updates.password) organization.password = updates.password; // Will be hashed by pre-save hook

		await organization.save();

		res.json({ success: true, data: organization });
	} catch (error) {
		// Handle duplicate email/domain error
		if (error.code === 11000) {
			const field = Object.keys(error.keyPattern)[0];
			return res.status(400).json({
				error: `An organization with that ${field} already exists.`,
			});
		}
		next(error);
	}
};

/**
 * @function
 * @name deleteOrganization
 * @description Delete a specific organization and its associated users.
 */
const deleteOrganization = async (req, res, next) => {
	try {
		const { id } = req.params;

		// Delete organization
		const organization = await Organization.findByIdAndDelete(id);
		if (!organization) {
			return res.status(404).json({ error: "Organization not found." });
		}

		// Delete associated users
		await User.deleteMany({ organization: id });

		res.json({
			success: true,
			message: "Organization and associated users deleted.",
		});
	} catch (error) {
		next(error);
	}
};

/**
 * @function
 * @name listOrganizations
 * @description Return a list of all organizations (minimal details).
 */
const listOrganizations = async (req, res, next) => {
	try {
		// Fetch all organizations with selected fields
		const orgs = await Organization.find().select("name domain email");

		res.json({ success: true, organizations: orgs });
	} catch (error) {
		next(error);
	}
};

module.exports = {
	createOrganization,
	loginOrganization,
	getOrganization,
	getAllMembers,
	makeCreator,
	updateOrganization,
	deleteOrganization,
	listOrganizations,
};
