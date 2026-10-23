const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
    customerName: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    paymentMode: { type: String, enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Other'], required: true },
    status: { type: String, enum: ['Pending', 'Paid', 'Refunded'], default: 'Pending' },
    billDate: { type: Date, default: Date.now },
  },
  { timestamps: true, strict: false }
);

const Invoice = mongoose.model('StaffInvoice', InvoiceSchema);
module.exports = Invoice;
