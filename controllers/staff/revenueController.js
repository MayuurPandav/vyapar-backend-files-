const asyncHandler = require('express-async-handler');
const Sale = require('../../models/staff/Sale');
const Invoice = require('../../models/staff/Invoice');
const Product = require('../../models/staff/Product');

// Helper to get start/end of a day
const getDayBounds = (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

// GET /api/revenue/today
const getTodayRevenue = asyncHandler(async (req, res) => {
  const { start, end } = getDayBounds();
  const sales = await Sale.find({ billDate: { $gte: start, $lt: end } });
  const totalRevenue = sales.reduce((sum, s) => sum + s.amount, 0);
  const totalOrders = sales.length;
  const avgOrder = totalOrders ? totalRevenue / totalOrders : 0;
  const gstCollected = sales.reduce((sum, s) => sum + (s.gstCollected || 0), 0);
  const pendingPayments = await Sale.countDocuments({ status: 'Pending', billDate: { $gte: start, $lt: end } });
  const refunds = await Sale.aggregate([
    { $match: { status: 'Refunded', billDate: { $gte: start, $lt: end } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const refundAmount = refunds[0] ? refunds[0].total : 0;

  res.json({ totalRevenue, totalOrders, avgOrder, gstCollected, pendingPayments, refundAmount });
});

// GET /api/revenue/weekly (hourly for today + daily for last 7 days)
const getWeeklyRevenue = asyncHandler(async (req, res) => {
  const today = new Date();
  const startWeek = new Date();
  startWeek.setDate(today.getDate() - 6);
  startWeek.setHours(0, 0, 0, 0);

  // Hourly revenue for today
  const { start: dayStart, end: dayEnd } = getDayBounds();
  const hourly = await Sale.aggregate([
    { $match: { billDate: { $gte: dayStart, $lt: dayEnd } } },
    {
      $group: {
        _id: { $hour: '$billDate' },
        total: { $sum: '$amount' },
      },
    },
    { $sort: { '_id': 1 } },
  ]);

  // Daily revenue for last 7 days
  const daily = await Sale.aggregate([
    { $match: { billDate: { $gte: startWeek, $lt: dayEnd } } },
    {
      $group: {
        _id: { $dayOfMonth: '$billDate' },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id': 1 } },
  ]);

  res.json({ hourly, daily });
});

// GET /api/revenue/payment-modes
const getPaymentModeDistribution = asyncHandler(async (req, res) => {
  const { start, end } = getDayBounds();
  const result = await Sale.aggregate([
    { $match: { billDate: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: '$paymentMode',
        amount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);
  const formatted = result.map((r) => ({ mode: r._id, amount: r.amount, count: r.count }));
  res.json(formatted);
});

// GET /api/revenue/top-products
const getTopProducts = asyncHandler(async (req, res) => {
  const { start, end } = getDayBounds();
  const pipeline = [
    { $match: { billDate: { $gte: start, $lt: end } } },
    { $unwind: '$products' },
    {
      $group: {
        _id: '$products.productId',
        name: { $first: '$products.name' },
        quantity: { $sum: '$products.quantity' },
        revenue: { $sum: { $multiply: ['$products.price', '$products.quantity'] } },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 10 },
  ];
  const top = await Sale.aggregate(pipeline);
  res.json(top);
});

// GET /api/revenue/invoices (with optional date filters)
const getInvoices = asyncHandler(async (req, res) => {
  const { start, end, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (start && end) {
    filter.billDate = { $gte: new Date(start), $lt: new Date(end) };
  }
  const total = await Invoice.countDocuments(filter);
  const invoices = await Invoice.find(filter)
    .sort({ billDate: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  res.json({ total, page: Number(page), limit: Number(limit), invoices });
});

module.exports = {
  getTodayRevenue,
  getWeeklyRevenue,
  getPaymentModeDistribution,
  getTopProducts,
  getInvoices,
};
