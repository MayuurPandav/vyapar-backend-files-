const asyncHandler = require('express-async-handler');
const Payment = require('../../models/staff/Payment');

const getPayments = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 15;
  const keyword = req.query.search
    ? {
        $or: [
          { transactionId: { $regex: req.query.search, $options: 'i' } },
          { mode: { $regex: req.query.search, $options: 'i' } },
        ],
      }
    : {};

  const count = await Payment.countDocuments({ ...keyword });
  const payments = await Payment.find({ ...keyword })
    .populate('billId', 'customerName totalAmount')
    .populate('userId', 'name email')
    .sort({ createdAt: -1 })
    .skip(limit * (page - 1))
    .limit(limit);

  res.json({ payments, page, pages: Math.ceil(count / limit), total: count });
});

const getPaymentById = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id).populate('billId', 'customerName totalAmount');
  if (payment) {
    res.json(payment);
  } else {
    res.status(404);
    throw new Error('Payment record not found');
  }
});

const createPayment = asyncHandler(async (req, res) => {
  const { billId, amount, mode, status, transactionId } = req.body;
  const payment = await Payment.create({ billId, amount, mode, status, transactionId, userId: req.user._id });
  res.status(201).json(payment);
});

module.exports = { getPayments, getPaymentById, createPayment };
