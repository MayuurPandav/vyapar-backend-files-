const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  title: { type: String },
  description: { type: String },
  amount: { type: Number, required: true },
  category: { type: String },
  date: { type: Date, default: Date.now },
  approved: { type: Boolean, default: false },
  notes: { type: String }
});


module.exports = mongoose.model('Expense', expenseSchema);
