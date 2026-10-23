const mongoose = require('mongoose');

const ProductDetailSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true }, // price per unit
  },
  { _id: false }
);

const SaleSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true }, // total amount of the sale (incl. GST)
    gstCollected: { type: Number, default: 0 },
    paymentMode: {
      type: String,
      enum: ['Cash', 'UPI', 'Card', 'BankTransfer', 'Other'],
      required: true,
    },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who made the sale
    products: { type: [ProductDetailSchema], required: true },
    billDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['Completed', 'Pending', 'Refunded'], default: 'Completed' },
  },
  { timestamps: true, strict: false }
);

const Sale = mongoose.model('Sale', SaleSchema);
module.exports = Sale;
