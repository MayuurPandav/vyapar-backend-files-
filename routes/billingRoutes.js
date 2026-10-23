const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');

// Define routes for super admin billing features
router.get('/coupons', billingController.getCoupons);
router.post('/coupons', billingController.createCoupon);
router.delete('/coupons/:id', billingController.deleteCoupon);

router.get('/refunds', billingController.getRefunds);
router.post('/refunds', billingController.processRefund);
router.get('/refund-requests', billingController.getRefundRequests);
router.post('/refund-requests/:id/action', billingController.handleRefundRequestAction);

router.post('/manual-override', billingController.manualOverride);

router.get('/revenue-reports', billingController.getRevenueReports);

router.get('/gateway-config', billingController.getGatewayConfig);
router.post('/gateway-config', billingController.updateGatewayConfig);

module.exports = router;
