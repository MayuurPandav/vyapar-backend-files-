const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../../middleware/staff/authMiddleware');
const { getOrders, addOrder, updateOrder } = require('../../controllers/staff/orderController');

router.route('/')
  .get(protect, checkPermission('canViewAllInvoices'), getOrders)
  .post(protect, checkPermission('canAcceptPayment'), addOrder);

router.route('/:id')
  .put(protect, checkPermission('canEditRate'), updateOrder);

module.exports = router;

