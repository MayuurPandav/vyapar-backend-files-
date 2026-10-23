const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/staff/authMiddleware');
const { getProfile, updateProfile, changePassword } = require('../../controllers/staff/profileController');

router.route('/').get(protect, getProfile).put(protect, updateProfile);
router.put('/change-password', protect, changePassword);

module.exports = router;
