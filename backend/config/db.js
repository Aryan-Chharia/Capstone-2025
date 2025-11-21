/**
 * @file config/db.js
 * @description MongoDB connection logic using mongoose.
 */

const mongoose = require("mongoose");

/**
 * Connects to the MongoDB database using connection string from environment.
 */
const connectDB = async () => {
	try {
		const connect = await mongoose.connect(process.env.CONNECTION_STRING);
		console.log(
			"DATABASE CONNECTED:",
			connect.connection.host,
			connect.connection.name
		);
	} catch (err) {
		console.error("DB CONNECTION ERROR:", err.message);
	}
};

module.exports = connectDB;
