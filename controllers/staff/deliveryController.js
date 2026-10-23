const asyncHandler = require('express-async-handler');
const Delivery = require('../../models/staff/Delivery');

const getDeliveries = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 15;
  const keyword = req.query.search
    ? {
        $or: [
          { customerName: { $regex: req.query.search, $options: 'i' } },
          { address: { $regex: req.query.search, $options: 'i' } },
          { trackingCode: { $regex: req.query.search, $options: 'i' } },
        ],
      }
    : {};

  let filter = { ...keyword };
  if (!req.user.isAdmin && !req.user.permissions?.canManageDelivery) {
    filter.assignedTo = req.user._id;
  }

  const count = await Delivery.countDocuments(filter);
  const deliveries = await Delivery.find(filter)
    .populate('assignedTo', 'name email role')
    .sort({ createdAt: -1 })
    .skip(limit * (page - 1))
    .limit(limit);

  res.json({ deliveries, page, pages: Math.ceil(count / limit), total: count });
});

const getDeliveryById = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findById(req.params.id).populate('assignedTo', 'name email role');
  if (delivery) {
    res.json(delivery);
  } else {
    res.status(404);
    throw new Error('Delivery not found');
  }
});

const createDelivery = asyncHandler(async (req, res) => {
  const { orderId, customerName, address, phone, assignedTo, estimatedDelivery, notes } = req.body;
  const delivery = await Delivery.create({
    orderId,
    customerName,
    address,
    phone,
    assignedTo,
    estimatedDelivery,
    notes,
    trackingCode: `DLV-${Date.now().toString().slice(-6)}`,
  });
  res.status(201).json(delivery);
});

const updateDelivery = asyncHandler(async (req, res) => {
  const delivery = await Delivery.findById(req.params.id);
  if (delivery) {
    const isManager = req.user.isAdmin || req.user.permissions?.canManageDelivery;
    const isAssignee = delivery.assignedTo && delivery.assignedTo.toString() === req.user._id.toString();

    if (!isManager && !isAssignee) {
      res.status(403);
      throw new Error('Not authorized to update this delivery');
    }

    if (isManager) {
      delivery.customerName = req.body.customerName || delivery.customerName;
      delivery.address = req.body.address || delivery.address;
      delivery.phone = req.body.phone || delivery.phone;
      delivery.status = req.body.status || delivery.status;
      delivery.assignedTo = req.body.assignedTo || delivery.assignedTo;
      delivery.estimatedDelivery = req.body.estimatedDelivery || delivery.estimatedDelivery;
      delivery.notes = req.body.notes || delivery.notes;
    } else {
      if (req.body.status) {
        delivery.status = req.body.status;
      }
    }

    const updatedDelivery = await delivery.save();
    res.json(updatedDelivery);
  } else {
    res.status(404);
    throw new Error('Delivery not found');
  }
});


module.exports = { getDeliveries, getDeliveryById, createDelivery, updateDelivery };
