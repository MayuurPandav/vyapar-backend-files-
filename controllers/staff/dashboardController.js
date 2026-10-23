const asyncHandler = require('express-async-handler');
const Bill = require('../../models/staff/Bill');
const Order = require('../../models/staff/Order');
const Product = require('../../models/staff/Product');

const getTodaySales = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const salesCount = await Bill.countDocuments({ billDate: { $gte: startOfDay } });
  res.json({ salesCount, percentageChange: 12.6 });
});

const getTodayRevenue = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const revenue = await Bill.aggregate([
    { $match: { billDate: { $gte: startOfDay } } },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } },
  ]);

  const monthlyRevenue = await Bill.aggregate([
    {
      $group: {
        _id: { $month: '$billDate' },
        total: { $sum: '$totalAmount' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    revenue: revenue[0] ? revenue[0].total : 0,
    monthlyRevenue,
    percentageChange: 9.4,
  });
});

const getMonthlySales = asyncHandler(async (req, res) => {
  const monthlyRevenue = await Bill.aggregate([
    {
      $group: {
        _id: { $month: '$billDate' },
        totalAmount: { $sum: '$totalAmount' },
        invoices: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json(monthlyRevenue.map((item) => ({ month: item._id, revenue: item.totalAmount, invoices: item.invoices })));
});

const getPendingOrders = asyncHandler(async (req, res) => {
  const pendingCount = await Order.countDocuments({ status: 'Pending' });
  const processingCount = await Order.countDocuments({ status: 'Processing' });
  const completedCount = await Order.countDocuments({ status: 'Completed' });

  res.json({ pendingCount, processingCount, completedCount });
});

const getRecentBills = asyncHandler(async (req, res) => {
  const bills = await Bill.find({})
    .sort({ billDate: -1 })
    .limit(10)
    .select('invoiceNumber customerName totalAmount paymentMode billDate status');

  res.json(bills);
});

const getLowStockProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ $expr: { $lte: ['$stock', '$minimumStock'] } }).select(
    'productName stock minimumStock'
  );

  const alerts = products.map((product) => ({
    productName: product.productName,
    currentStock: product.stock,
    minimumStock: product.minimumStock,
    message: 'Stock is low, reorder soon.',
  }));

  res.json(alerts);
});

const getTodaySalesDetails = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Fetch all bills from today
  const bills = await Bill.find({ billDate: { $gte: startOfDay } }).sort({ billDate: -1 });

  // Calculate product sales breakdown
  const productMap = {};
  let totalRevenue = 0;

  bills.forEach((bill) => {
    totalRevenue += bill.totalAmount;
    bill.products.forEach((p) => {
      const name = p.name;
      if (!productMap[name]) {
        productMap[name] = {
          name: name,
          quantity: 0,
          revenue: 0,
          price: p.price,
        };
      }
      productMap[name].quantity += p.quantity;
      productMap[name].revenue += p.price * p.quantity;
    });
  });

  const soldProducts = Object.values(productMap).sort((a, b) => b.quantity - a.quantity);

  // Calculate payment mode breakdown
  const paymentBreakdown = { Cash: 0, Card: 0, UPI: 0, Other: 0 };
  bills.forEach((bill) => {
    const mode = bill.paymentMode || 'Cash';
    paymentBreakdown[mode] = (paymentBreakdown[mode] || 0) + bill.totalAmount;
  });

  res.json({
    salesCount: bills.length,
    totalRevenue,
    bills,
    soldProducts,
    paymentBreakdown,
  });
});

const getTodayRevenueDetails = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Today's bills
  const bills = await Bill.find({ billDate: { $gte: startOfDay } }).sort({ billDate: -1 });

  let totalRevenue = 0;
  const paymentBreakdown = { Cash: 0, Card: 0, UPI: 0, Other: 0 };
  const hourlyRevenue = {};

  bills.forEach((bill) => {
    totalRevenue += bill.totalAmount;
    const mode = bill.paymentMode || 'Cash';
    paymentBreakdown[mode] = (paymentBreakdown[mode] || 0) + bill.totalAmount;

    // Hourly breakdown
    const hour = new Date(bill.billDate).getHours();
    const label = `${hour}:00`;
    hourlyRevenue[label] = (hourlyRevenue[label] || 0) + bill.totalAmount;
  });

  // Monthly revenue trend
  const monthlyRevenue = await Bill.aggregate([
    {
      $group: {
        _id: { $month: '$billDate' },
        total: { $sum: '$totalAmount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Top revenue bills today
  const topBills = [...bills]
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 10)
    .map((b) => ({
      _id: b._id,
      invoiceNumber: b.invoiceNumber,
      customerName: b.customerName,
      totalAmount: b.totalAmount,
      paymentMode: b.paymentMode,
      billDate: b.billDate,
      status: b.status,
    }));

  res.json({
    totalRevenue,
    billCount: bills.length,
    paymentBreakdown,
    hourlyRevenue,
    monthlyRevenue,
    topBills,
  });
});

module.exports = {
  getTodaySales,
  getTodayRevenue,
  getMonthlySales,
  getPendingOrders,
  getRecentBills,
  getLowStockProducts,
  getTodaySalesDetails,
  getTodayRevenueDetails,
};
