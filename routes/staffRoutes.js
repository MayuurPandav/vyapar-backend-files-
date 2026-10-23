const express = require('express');
const router = express.Router();

router.use('/auth', require('./staff/authRoutes'));
router.use('/dashboard', require('./staff/dashboardRoutes'));
router.use('/bills', require('./staff/billRoutes'));
router.use('/products', require('./staff/productRoutes'));
router.use('/orders', require('./staff/orderRoutes'));
router.use('/customers', require('./staff/customerRoutes'));
router.use('/deliveries', require('./staff/deliveryRoutes'));
router.use('/profile', require('./staff/profileRoutes'));
router.use('/payments', require('./staff/paymentRoutes'));
router.use('/revenue', require('./staff/revenueRoutes'));
router.use('/uploads', require('./staff/uploadRoutes'));

module.exports = router;
