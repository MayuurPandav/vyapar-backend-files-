const express = require('express');
const router = express.Router();
const { protect, adminOnly, checkPermission } = require('../../middleware/staff/authMiddleware');
const {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} = require('../../controllers/staff/customerController');

router.route('/')
  .get(protect, checkPermission('canManageParties'), getCustomers)
  .post(protect, checkPermission('canManageParties'), createCustomer);

router.route('/:id')
  .get(protect, checkPermission('canManageParties'), getCustomerById)
  .put(protect, checkPermission('canManageParties'), updateCustomer)
  .delete(protect, adminOnly, deleteCustomer);

module.exports = router;
