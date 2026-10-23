const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../../middleware/staff/authMiddleware');
const { getPayments, getPaymentById, createPayment } = require('../../controllers/staff/paymentController');

router.route('/')
  .get(protect, checkPermission('canViewAllInvoices'), getPayments)
  .post(protect, checkPermission('canAcceptPayment'), createPayment);

router.route('/:id')
  .get(protect, checkPermission('canViewAllInvoices'), getPaymentById);

module.exports = router;
