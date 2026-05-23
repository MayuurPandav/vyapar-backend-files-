const express = require('express');
const router = express.Router();
const { getFullDB, saveFullDB, verifyGST } = require('../controllers/dbController');

router.get('/db', getFullDB);
router.post('/save', saveFullDB);
router.post('/verify-gst', verifyGST);

module.exports = router;
