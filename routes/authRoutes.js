const express = require('express');
const router = express.Router();
const { register, login, sendOTP, verifyOTP } = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.post('/subscribe', require('../controllers/authController').subscribe);
router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/verify-gstin', require('../controllers/authController').verifyGSTIN);
router.post('/user/refund-request', require('../controllers/billingController').requestRefund);
router.get('/user/refund-requests', require('../controllers/billingController').getUserRefundRequests);


module.exports = router;
