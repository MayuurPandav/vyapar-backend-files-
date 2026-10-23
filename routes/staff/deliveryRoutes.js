const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../../middleware/staff/authMiddleware');
const { getDeliveries, getDeliveryById, createDelivery, updateDelivery } = require('../../controllers/staff/deliveryController');

router.route('/')
  .get(protect, checkPermission('canManageDelivery'), getDeliveries)
  .post(protect, checkPermission('canManageDelivery'), createDelivery);

router.route('/:id')
  .get(protect, checkPermission('canManageDelivery'), getDeliveryById)
  .put(protect, checkPermission('canManageDelivery'), updateDelivery);

module.exports = router;
