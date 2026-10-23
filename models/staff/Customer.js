const mongoose = require('mongoose');

const customerSchema = mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },

    address: { type: String, default: '' },
    company: { type: String, default: '' },
    outstandingBalance: { type: Number, default: 0 },
    purchaseHistory: [
      {
        billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
        amount: { type: Number, default: 0 },
        paidAt: { type: Date },
      },
    ],
  },
  { timestamps: true, strict: false, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// customerSchema.virtual('address').get(function () {
//   return this.get('address') || this.get('billingAddress') || '';
// });

// customerSchema.virtual('outstandingBalance').get(function () {
//   return this.get('outstandingBalance') ?? this.get('balance') ?? 0;
// });

const Customer = mongoose.model('Customer', customerSchema, 'parties');
module.exports = Customer;
