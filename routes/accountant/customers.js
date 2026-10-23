const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/accountant/auth');
const {
  createCustomer,
  getCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer
} = require('../../controllers/accountant/customerController');

router.use(protect);
router.route('/').get(getCustomers).post(createCustomer);
router.route('/:id').get(getCustomer).put(updateCustomer).delete(deleteCustomer);

module.exports = router;
