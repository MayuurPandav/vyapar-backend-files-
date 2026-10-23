const Expense = require('../../models/accountant/Expense');
const asyncHandler = require('../../middleware/accountant/asyncHandler');

exports.createExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.create(req.body);
  res.status(201).json({ success: true, data: expense });
});

exports.getExpenses = asyncHandler(async (req, res) => {
  const expenses = await Expense.find().sort({ date: -1 }).limit(200);
  res.json({ success: true, data: expenses });
});

exports.approveExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findByIdAndUpdate(req.params.id, { approved: true }, { new: true });
  res.json({ success: true, data: expense });
});
