const mongoose = require('mongoose');

const billSchema = mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      default: () => `INV-${Date.now().toString().slice(-8)}`,
    },
    type: { type: String, enum: ['sale', 'credit', 'purchase'], default: 'sale' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String, required: true },
    customerPhone: { type: String, default: '' },
    customerEmail: { type: String, default: '' },
    customerAddress: { type: String, default: '' },
    customerGSTIN: { type: String, default: '' },
    products: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: { type: String, required: true },
        sku: { type: String, default: '' },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true },
        discount: { type: Number, default: 0 }, // Line-level discount %
        gstRate: { type: Number, default: 18 }, // GST rate %
        taxAmount: { type: Number, default: 0 },
        amount: { type: Number, required: true }, // (price * qty * (1 - discount/100))
      },
    ],
    subtotal: { type: Number, default: 0 }, // Sum of all line amounts
    itemLevelDiscountTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 }, // Overall flat discount
    discountPercent: { type: Number, default: 0 }, // Overall discount %
    taxableTotal: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 }, // Central GST 9%
    sgst: { type: Number, default: 0 }, // State GST 9%
    igst: { type: Number, default: 0 }, // Integrated GST (if interstate)
    totalTax: { type: Number, default: 0 },
    additionalCharges: { type: Number, default: 0 }, // Delivery, packaging, etc.
    chargeLabel: { type: String, default: 'Delivery' },
    roundOff: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    dueAmount: { type: Number, default: 0 }, // totalAmount - paidAmount
    paymentMode: { type: String, enum: ['Cash', 'Card', 'UPI', 'Split', 'Other'], default: 'Cash' },
    cashAmount: { type: Number, default: 0 },
    cardAmount: { type: Number, default: 0 },
    upiAmount: { type: Number, default: 0 },
    upiRef: { type: String, default: '' },
    changeDue: { type: Number, default: 0 },
    billDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    status: { type: String, enum: ['Pending', 'Processing', 'Completed'], default: 'Completed' },
    notes: { type: String, default: '' },
    originalInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' }, // For credit notes
    creditNotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bill' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, strict: false }
);

const Bill = mongoose.model('Bill', billSchema);
module.exports = Bill;
