/**
 * @file middleware/authMiddleware.js
 * @description JWT authentication middleware. Verifies the token and attaches `req.user = { userId, organization, email, role }` if valid.
 */

const jwt = require("jsonwebtoken");

/**
 * Verify JWT token from Authorization header and attach user details to request.
 */
const verifyToken = async (req, res, next) => {
	let token;
	if (
		req.headers.authorization &&
		req.headers.authorization.startsWith("Bearer")
	) {
		try {
			token = req.headers.authorization.split(" ")[1];
			const decoded = jwt.verify(token, process.env.JWT_SECRET);
			req.user = {
				userId: decoded.userId,
				organization: decoded.organization,
				email: decoded.email,
				role: decoded.role,
			};
			return next();
		} catch (error) {
			return res.status(401).json({ error: "Not authorized, token failed." });
		}
	}
	if (!token) {
		return res
			.status(401)
			.json({ error: "Not authorized, no token provided." });
	}
};

module.exports = { verifyToken };
