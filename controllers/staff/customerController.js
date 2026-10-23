const asyncHandler = require('express-async-handler');
const Customer = require('../../models/staff/Customer');

const getCustomers = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 15;
  const keyword = req.query.search
    ? {
        $or: [
          { name: { $regex: req.query.search, $options: 'i' } },
          { email: { $regex: req.query.search, $options: 'i' } },
          { phone: { $regex: req.query.search, $options: 'i' } },
        ],
      }
    : {};

  const count = await Customer.countDocuments({ ...keyword });
  const customers = await Customer.find({ ...keyword })
    .sort({ createdAt: -1 })
    .skip(limit * (page - 1))
    .limit(limit);

  res.json({ customers, page, pages: Math.ceil(count / limit), total: count });
});

const getCustomerById = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id).populate('purchaseHistory.billId', 'totalAmount billDate');
  if (customer) {
    res.json(customer);
  } else {
    res.status(404);
    throw new Error('Customer not found');
  }
});

const createCustomer = asyncHandler(async (req, res) => {
  const { name, email, phone, address, company } = req.body;

  if (email && email.trim() !== '') {
    const exists = await Customer.findOne({ email: email.trim() });
    if (exists) {
      res.status(400);
      throw new Error('Customer already exists');
    }
  }

  const customer = await Customer.create({ name, email, phone, address, company });
  res.status(201).json(customer);
});

const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (customer) {
    customer.name = req.body.name || customer.name;
    customer.email = req.body.email || customer.email;
    customer.phone = req.body.phone || customer.phone;
    customer.address = req.body.address || customer.address;
    customer.company = req.body.company || customer.company;
    customer.outstandingBalance = req.body.outstandingBalance ?? customer.outstandingBalance;

    const updatedCustomer = await customer.save();
    res.json(updatedCustomer);
  } else {
    res.status(404);
    throw new Error('Customer not found');
  }
});

const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (customer) {
    await customer.remove();
    res.json({ message: 'Customer removed successfully' });
  } else {
    res.status(404);
    throw new Error('Customer not found');
  }
});

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
