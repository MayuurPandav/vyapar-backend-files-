const mongoose = require('mongoose');

const deliverySchema = mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    customerName: { type: String, required: true },
    address: { type: String, required: true },
    phone: { type: String, required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['Pending', 'Assigned', 'Out for delivery', 'Delivered', 'Canceled'],
      default: 'Pending',
    },
    trackingCode: { type: String, default: '' },
    estimatedDelivery: { type: Date },
    notes: { type: String, default: '' },
  },
  { timestamps: true, strict: false }
);

const Delivery = mongoose.model('Delivery', deliverySchema);
module.exports = Delivery;
