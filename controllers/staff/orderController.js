const asyncHandler = require('express-async-handler');
const Order = require('../../models/staff/Order');

const getOrders = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 15;
  const keyword = req.query.search
    ? {
        $or: [
          { orderId: { $regex: req.query.search, $options: 'i' } },
          { customerName: { $regex: req.query.search, $options: 'i' } },
          { status: { $regex: req.query.search, $options: 'i' } },
        ],
      }
    : {};

  const count = await Order.countDocuments({ ...keyword });
  const orders = await Order.find({ ...keyword })
    .sort({ orderDate: -1 })
    .skip(limit * (page - 1))
    .limit(limit);

  res.json({ orders, page, pages: Math.ceil(count / limit), total: count });
});

const addOrder = asyncHandler(async (req, res) => {
  const { orderId, customerName, amount, status, deliveryStatus } = req.body;
  const order = new Order({ orderId, customerName, amount, status, deliveryStatus });
  const createdOrder = await order.save();
  res.status(201).json(createdOrder);
});

const updateOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (order) {
    order.customerName = req.body.customerName || order.customerName;
    order.amount = req.body.amount ?? order.amount;
    order.status = req.body.status || order.status;
    order.deliveryStatus = req.body.deliveryStatus || order.deliveryStatus;
    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } else {
    res.status(404);
    throw new Error('Order not found');
  }
});

module.exports = { getOrders, addOrder, updateOrder };
