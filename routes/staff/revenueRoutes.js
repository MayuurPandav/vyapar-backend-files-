const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../../middleware/staff/authMiddleware');
const {
  getTodayRevenue,
  getWeeklyRevenue,
  getPaymentModeDistribution,
  getTopProducts,
  getInvoices,
} = require('../../controllers/staff/revenueController');

router.get('/today', protect, checkPermission('canViewReports'), getTodayRevenue);
router.get('/weekly', protect, checkPermission('canViewReports'), getWeeklyRevenue);
router.get('/payment-modes', protect, checkPermission('canViewReports'), getPaymentModeDistribution);
router.get('/top-products', protect, checkPermission('canViewReports'), getTopProducts);
router.get('/invoices', protect, checkPermission('canViewReports'), getInvoices);

module.exports = router;
