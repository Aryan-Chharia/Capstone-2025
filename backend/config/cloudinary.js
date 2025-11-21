const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
});

const datasetStorage = new CloudinaryStorage({
	cloudinary,
	params: async (req, file) => ({
		folder: "caps-datasets",
		resource_type: "raw",
		format: file.originalname.split(".").pop(), // keep original extension
		public_id: file.originalname.replace(/\.[^/.]+$/, ""),
	}),
});

const chatTempStorage = new CloudinaryStorage({
	cloudinary,
	params: {
		folder: "chat-temp",
		resource_type: "raw",
	},
});

module.exports = { cloudinary, datasetStorage, chatTempStorage };
