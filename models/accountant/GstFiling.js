const mongoose = require('mongoose');

const gstFilingSchema = new mongoose.Schema({
  period: { type: String, required: true },
  filedAt: { type: Date, default: Date.now },
  status: { type: String, default: 'Filed' },
  cgst: { type: Number, required: true },
  sgst: { type: Number, required: true },
  igst: { type: Number, default: 0 },
  totalGstPaid: { type: Number, required: true }
});

module.exports = mongoose.model('GstFiling', gstFilingSchema);
