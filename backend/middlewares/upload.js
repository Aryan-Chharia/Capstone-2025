const multer = require("multer");
const path = require("path");
const { datasetStorage } = require("../config/cloudinary");

const dsAllowedExts = ["csv", "xls", "xlsx"];
const dsAllowedMimes = [
	"text/csv",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/octet-stream",
];

const datasetFileFilter = (req, file, cb) => {
	const ext = path.extname(file.originalname).slice(1).toLowerCase();
	const mime = file.mimetype;

	if (dsAllowedExts.includes(ext) || dsAllowedMimes.includes(mime)) {
		return cb(null, true);
	}
	return cb(new Error("Unsupported file type. Allowed: csv, xls, xlsx."));
};

const chatFileFilter = datasetFileFilter;

// Dataset upload — Cloudinary storage

const datasetUpload = multer({
	storage: datasetStorage,
	fileFilter: datasetFileFilter,
	limits: { files: 10, fileSize: 10 * 1024 * 1024 },
});

// Chat upload — in-memory
const chatUpload = multer({
	storage: multer.memoryStorage(),
	fileFilter: chatFileFilter,
	limits: { files: 100 },
});

module.exports = { datasetUpload, chatUpload };
