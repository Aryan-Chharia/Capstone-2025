/**
 * @file middleware/isOrgOwner.js
 * @description Middleware to check if the authenticated user is the owner of the organization (by email match).
 */

const Organization = require("../models/organizationSchema");

/**
 * Ensure the requester is the organization owner.
 */
const isOrgOwner = async (req, res, next) => {
	try {
		const orgId = req.params.id || req.params.orgId;
		const org = await Organization.findById(orgId);
		if (!org) return res.status(404).json({ error: "Organization not found." });

		if (org.email !== req.user.email) {
			return res
				.status(403)
				.json({ error: "Access denied. Not organization owner." });
		}

		next();
	} catch (err) {
		console.error(err);
		res
			.status(500)
			.json({ error: "Server error in organization access check." });
	}
};

module.exports = isOrgOwner;
