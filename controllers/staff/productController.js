const asyncHandler = require('express-async-handler');
const Product = require('../../models/staff/Product');

// Get all products with advanced search and filters
const getProducts = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const search = req.query.search || '';
  const category = req.query.category || '';
  const inStock = req.query.inStock === 'true';
  const lowStock = req.query.lowStock === 'true';

  let filter = {};

  // Search filter
  if (search) {
    filter.$or = [
      { productName: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
      { barcode: { $regex: search, $options: 'i' } },
    ];
  }

  // Category filter
  if (category) {
    filter.category = category;
  }

  // Stock filters
  if (inStock) {
    filter.stock = { $gt: 0 };
  }

  if (lowStock) {
    filter.$expr = { $lte: ['$stock', '$minimumStock'] };
  }

  const count = await Product.countDocuments(filter);
  const products = await Product.find(filter)
    .sort({ productName: 1 })
    .skip(limit * (page - 1))
    .limit(limit);

  res.json({ products, page, pages: Math.ceil(count / limit), total: count });
});

// Get product by barcode
const getProductByBarcode = asyncHandler(async (req, res) => {
  const { barcode } = req.params;

  if (!barcode) {
    res.status(400);
    throw new Error('Barcode is required');
  }

  const product = await Product.findOne({ barcode });

  if (!product) {
    res.status(404);
    throw new Error(`Product with barcode ${barcode} not found`);
  }

  res.json(product);
});

// Search products by barcode (supports partial match)
const searchByBarcode = asyncHandler(async (req, res) => {
  const { barcode } = req.query;

  if (!barcode) {
    res.status(400);
    throw new Error('Barcode search term is required');
  }

  const products = await Product.find({
    barcode: { $regex: barcode, $options: 'i' },
  }).limit(10);

  res.json(products);
});

// Get categories
const getCategories = asyncHandler(async (req, res) => {
  const categories = await Product.distinct('category');
  res.json(categories.filter(Boolean));
});

// Add product
const addProduct = asyncHandler(async (req, res) => {
  const { productName, category, price, stock, minimumStock, barcode, sku, hsn } = req.body;

  // Check if barcode already exists (if provided)
  if (barcode) {
    const existing = await Product.findOne({ barcode });
    if (existing) {
      res.status(400);
      throw new Error('Product with this barcode already exists');
    }
  }

  if (!productName || !price) {
    res.status(400);
    throw new Error('Product name and price are required');
  }

  const product = new Product({
    productName,
    category,
    price,
    stock: stock || 0,
    minimumStock: minimumStock || 0,
    barcode,
    sku,
    hsn,
  });

  const createdProduct = await product.save();
  res.status(201).json(createdProduct);
});

// Update product
const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Check permission
  if (!req.user.isAdmin && !req.user.permissions?.canEditInventory && !req.user.permissions?.canEditRate) {
    res.status(403);
    throw new Error('Not authorized to update products');
  }

  // Check if new barcode already exists
  if (req.body.barcode && req.body.barcode !== product.barcode) {
    const existing = await Product.findOne({ barcode: req.body.barcode });
    if (existing) {
      res.status(400);
      throw new Error('Product with this barcode already exists');
    }
  }

  product.productName = req.body.productName || product.productName;
  product.category = req.body.category || product.category;
  product.price = req.body.price ?? product.price;
  product.stock = req.body.stock ?? product.stock;
  product.minimumStock = req.body.minimumStock ?? product.minimumStock;
  product.barcode = req.body.barcode || product.barcode;
  product.sku = req.body.sku || product.sku;
  product.hsn = req.body.hsn || product.hsn;

  const updatedProduct = await product.save();
  res.json(updatedProduct);
});

// Update product price
const updatePrice = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Check permission
  if (!req.user.isAdmin && !req.user.permissions?.canEditRate) {
    res.status(403);
    throw new Error('Not authorized to update prices');
  }

  if (!req.body.price || req.body.price <= 0) {
    res.status(400);
    throw new Error('Valid price is required');
  }

  product.price = req.body.price;
  const updatedProduct = await product.save();
  res.json(updatedProduct);
});

// Update product stock
const updateStock = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Check permission
  if (!req.user.isAdmin && !req.user.permissions?.canEditInventory) {
    res.status(403);
    throw new Error('Not authorized to update inventory');
  }

  const { quantity, type } = req.body;

  if (!quantity || quantity <= 0) {
    res.status(400);
    throw new Error('Valid quantity is required');
  }

  if (type === 'increment') {
    product.stock += Number(quantity);
  } else if (type === 'decrement') {
    if (product.stock < quantity) {
      res.status(400);
      throw new Error('Insufficient stock');
    }
    product.stock -= Number(quantity);
  } else if (type === 'set') {
    product.stock = Number(quantity);
  } else {
    res.status(400);
    throw new Error('Invalid stock update type');
  }

  const updatedProduct = await product.save();
  res.json(updatedProduct);
});

// Delete product
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Check permission
  if (!req.user.isAdmin && !req.user.permissions?.canEditInventory) {
    res.status(403);
    throw new Error('Not authorized to delete products');
  }

  await Product.findByIdAndDelete(req.params.id);
  res.json({ message: 'Product removed successfully' });
});

// Get low stock products
const lowStockProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({
    $expr: { $lte: ['$stock', '$minimumStock'] },
  }).sort({ stock: 1 });

  res.json(products);
});

// Get stock summary
const getStockSummary = asyncHandler(async (req, res) => {
  const totalProducts = await Product.countDocuments();
  const lowStockCount = await Product.countDocuments({
    $expr: { $lte: ['$stock', '$minimumStock'] },
  });
  const outOfStock = await Product.countDocuments({ stock: 0 });
  const totalStockValue = await Product.aggregate([
    {
      $group: {
        _id: null,
        totalValue: { $sum: { $multiply: ['$price', '$stock'] } },
        totalQuantity: { $sum: '$stock' },
      },
    },
  ]);

  res.json({
    totalProducts,
    lowStockCount,
    outOfStock,
    totalStockValue: totalStockValue[0]?.totalValue || 0,
    totalQuantity: totalStockValue[0]?.totalQuantity || 0,
  });
});

module.exports = {
  getProducts,
  getProductByBarcode,
  searchByBarcode,
  getCategories,
  addProduct,
  updateProduct,
  updatePrice,
  updateStock,
  deleteProduct,
  lowStockProducts,
  getStockSummary,
};
