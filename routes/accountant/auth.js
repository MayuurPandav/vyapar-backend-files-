const express = require('express');
const router = express.Router();
const { register, login, getProfile, changePassword, updateProfile } = require('../../controllers/accountant/authController');
const { protect } = require('../../middleware/accountant/auth');

router.post('/register',        register);
router.post('/login',           login);
router.get('/me',               protect, getProfile);
router.put('/profile',          protect, updateProfile);
router.post('/change-password', protect, changePassword);

module.exports = router;
