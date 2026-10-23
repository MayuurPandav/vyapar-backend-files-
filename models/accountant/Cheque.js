const mongoose = require('mongoose');

const chequeSchema = new mongoose.Schema({
  chequeNumber: { type: String, required: true },
  partyName: { type: String, required: true },
  amount: { type: Number, required: true },
  issueDate: { type: Date, required: true },
  type: { type: String, enum: ['received', 'issued'], required: true },
  status: { type: String, enum: ['pending', 'cleared', 'bounced'], default: 'pending' },
  bankName: { type: String },
  notes: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cheque', chequeSchema);
