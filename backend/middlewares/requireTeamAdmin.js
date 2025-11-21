/**
 * @file middleware/requireTeamAdmin.js
 * @description Middleware to ensure user has 'team_creator' or 'superadmin' role.
 */

/**
 * Block access unless role is team_creator or superadmin.
 */
const requireTeamAdmin = (req, res, next) => {
	const { role } = req.user;
	if (role !== "team_creator" && role !== "superadmin") {
		return res
			.status(403)
			.json({ error: "Only creators may perform this action." });
	}
	next();
};

module.exports = requireTeamAdmin;
