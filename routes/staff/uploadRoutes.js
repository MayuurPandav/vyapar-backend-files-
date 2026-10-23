const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect } = require('../../middleware/staff/authMiddleware');
const { uploadFile } = require('../../controllers/staff/uploadController');

const uploadsDir = process.env.UPLOADS_DIR || 'uploads';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', uploadsDir));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({ storage });

router.post('/', protect, upload.single('file'), uploadFile);

module.exports = router;
