const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../../middleware/staff/authMiddleware');
const {
  getTodaySales,
  getTodayRevenue,
  getMonthlySales,
  getPendingOrders,
  getRecentBills,
  getLowStockProducts,
  getTodaySalesDetails,
  getTodayRevenueDetails,
} = require('../../controllers/staff/dashboardController');

router.get('/today-sales', protect, checkPermission('canViewReports'), getTodaySales);
router.get('/today-sales/details', protect, checkPermission('canViewReports'), getTodaySalesDetails);
router.get('/today-revenue', protect, checkPermission('canViewReports'), getTodayRevenue);
router.get('/today-revenue/details', protect, checkPermission('canViewReports'), getTodayRevenueDetails);
router.get('/monthly-sales', protect, checkPermission('canViewReports'), getMonthlySales);
router.get('/pending-orders', protect, checkPermission('canViewReports'), getPendingOrders);
router.get('/recent-bills', protect, checkPermission('canViewReports'), getRecentBills);
router.get('/low-stock', protect, checkPermission('canViewReports'), getLowStockProducts);

module.exports = router;
