const Customer = require('../../models/accountant/Customer');
const asyncHandler = require('../../middleware/accountant/asyncHandler');

exports.createCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.create(req.body);
  res.status(201).json({ success: true, data: customer });
});

exports.getCustomers = asyncHandler(async (req, res) => {
  const customers = await Customer.find().limit(100);
  res.json({ success: true, data: customers });
});

exports.getCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: customer });
});

exports.updateCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: customer });
});

exports.deleteCustomer = asyncHandler(async (req, res) => {
  await Customer.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Deleted' });
});
