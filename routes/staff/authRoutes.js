const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/staff/authMiddleware');
const {
  registerUser,
  loginUser,
  logoutUser,
  forgotPassword,
  getLoginHistory,
} = require('../../controllers/staff/authController');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.post('/forgot-password', forgotPassword);
router.get('/login-history', protect, getLoginHistory);

module.exports = router;
