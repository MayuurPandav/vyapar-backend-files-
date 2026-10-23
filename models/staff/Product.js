const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  productName: { type: String },
  category: { type: String, default: '' },
  price: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  minimumStock: { type: Number, default: 0 },
  barcode: { type: String, default: '' },
  totalSold: { type: Number, default: 0 },
}, { timestamps: true, strict: false, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Map legacy 'productName' and 'name' for backward compatibility
ProductSchema.virtual('name').get(function () {
  return (this._doc && this._doc.name) || this.productName;
});

ProductSchema.virtual('productName_fallback').get(function () {
  return this.productName || this.get('name');
});

const Product = mongoose.model('Product', ProductSchema);
module.exports = Product;
