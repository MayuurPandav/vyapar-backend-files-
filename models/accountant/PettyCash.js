const mongoose = require('mongoose');

const pettyCashSchema = new mongoose.Schema({
  voucherNumber: { type: String, required: true },
  title: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  category: { type: String, default: 'General' },
  approved: { type: Boolean, default: false },
  paidTo: { type: String },
  notes: { type: String }
});

module.exports = mongoose.model('PettyCash', pettyCashSchema);
