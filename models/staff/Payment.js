const mongoose = require('mongoose');

const paymentSchema = mongoose.Schema(
  {
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amount: { type: Number, required: true },
    mode: { type: String, enum: ['Cash', 'Card', 'UPI', 'Wallet', 'Other'], default: 'Cash' },
    status: { type: String, enum: ['Pending', 'Completed', 'Failed'], default: 'Completed' },
    transactionId: { type: String },
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;
