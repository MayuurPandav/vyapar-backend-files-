const express = require('express');
const router = express.Router();
const { protect, adminOnly, checkPermission } = require('../../middleware/staff/authMiddleware');
const {
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
} = require('../../controllers/staff/productController');

// Main CRUD routes
router.route('/').get(protect, getProducts).post(protect, checkPermission('canEditInventory'), addProduct);

// Get categories
router.route('/categories').get(protect, getCategories);

// Search and filter routes
router.route('/barcode/search').get(protect, searchByBarcode);
router.route('/barcode/:barcode').get(protect, getProductByBarcode);

// Low stock and summary
router.route('/low-stock').get(protect, lowStockProducts);
router.route('/summary/stock').get(protect, getStockSummary);

// Update specific fields
router.route('/:id/price').put(protect, checkPermission('canEditInventory'), updatePrice);
router.route('/:id/stock').put(protect, checkPermission('canEditInventory'), updateStock);

// Individual product operations
router.route('/:id').put(protect, checkPermission('canEditInventory'), updateProduct).delete(protect, checkPermission('canEditInventory'), deleteProduct);


module.exports = router;
