const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountantCustomer' },
  customerName: { type: String },
  amount: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ['paid', 'unpaid', 'overdue'], default: 'unpaid' }
});

module.exports = mongoose.model('AccountantInvoice', invoiceSchema);
