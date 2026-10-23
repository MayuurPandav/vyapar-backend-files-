const mongoose = require('mongoose');

const orderSchema = mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    customerName: { type: String, required: true },
    amount: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ['Pending', 'Processing', 'Completed'], default: 'Pending' },
    deliveryStatus: {
      type: String,
      enum: ['Pending', 'Assigned', 'Out for delivery', 'Delivered', 'Canceled'],
      default: 'Pending',
    },
    orderDate: { type: Date, default: Date.now },
  },
  { timestamps: true, strict: false }
);

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
