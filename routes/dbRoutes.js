const express = require('express');
const router = express.Router();
const { getFullDB, saveFullDB, verifyGST, getDashboardSummary } = require('../controllers/dbController');
const { createSale, createPurchase, addProduct, addParty, getList, revenueTimeseries, getPurchaseById, editPurchase, deletePurchase, getProductById, editProduct, deleteProduct, bulkImportProducts, exportProductsCSV, getProductAlerts } = require('../controllers/dbController');
const { addStaff, editStaff, deleteStaff, getStaffList, toggleStaffActive, logStaffActivity, getStaffActivities, addAttendance, getAttendance, setSalary, getStaffPerformance, createInvoice, editInvoice, deleteInvoice, getInvoices, getInvoiceById, duplicateInvoice, convertToInvoice, setupRecurring, invoiceAgingReport } = require('../controllers/dbController');
const { adjustStock, transferStock, purchaseReport } = require('../controllers/dbController');
const { body, validationResult, query } = require('express-validator');

const validate = (checks) => async (req, res, next) => {
	await Promise.all(checks.map(c => c.run(req)));
	const errors = validationResult(req);
	if (!errors.isEmpty()) return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
	return next();
};

router.get('/db', getFullDB);
router.get('/dashboard', getDashboardSummary);
router.post('/save', saveFullDB);
router.post('/verify-gst', verifyGST);
router.post('/sales', validate([
	body('username').exists(),
	body('amount').exists().isNumeric().withMessage('amount must be numeric')
]), createSale);

router.post('/purchases', validate([
	body('username').exists(),
	body('amount').exists().isNumeric().withMessage('amount must be numeric')
]), createPurchase);
router.get('/purchases/:id', getPurchaseById);
router.put('/purchases/:id', validate([ body('username').exists(), body('amount').optional().isNumeric() ]), editPurchase);
router.delete('/purchases/:id', deletePurchase);

router.post('/products', validate([
	body('username').exists(),
	body('name').exists().trim().isLength({ min: 1 }),
	body('price').optional().isNumeric()
]), addProduct);
router.get('/products/:id', getProductById);
router.put('/products/:id', validate([ body('username').exists() ]), editProduct);
router.delete('/products/:id', deleteProduct);
router.post('/products/bulk', bulkImportProducts);
router.get('/products/export', exportProductsCSV);
router.get('/products/alerts', getProductAlerts);

router.post('/parties', validate([
	body('username').exists(),
	body('name').exists().trim().isLength({ min: 1 })
]), addParty);
router.get('/list', getList); // ?username=&type=sales|purchases|products|parties&page=1&limit=20
router.get('/revenue-timeseries', revenueTimeseries); // ?username=&period=daily|weekly|monthly

// Staff management routes
router.post('/staff', validate([
	body('username').exists(),
	body('name').exists().trim().isLength({ min: 1 })
]), addStaff);

router.put('/staff/:id', validate([ body('username').exists() ]), editStaff);
router.delete('/staff/:id', deleteStaff);
router.get('/staff', getStaffList); // ?username=
router.post('/staff/:id/active', toggleStaffActive);
router.post('/staff/activity', logStaffActivity);
router.get('/staff/activity', getStaffActivities); // ?username=&staffId&limit=50
router.post('/staff/attendance', addAttendance);
router.get('/staff/attendance', getAttendance);
router.post('/staff/:id/salary', setSalary);
router.get('/staff/performance', getStaffPerformance);

// Invoice routes
router.post('/invoices', validate([ body('username').exists(), body('type').exists() ]), createInvoice);
router.put('/invoices/:id', editInvoice);
router.delete('/invoices/:id', deleteInvoice);
router.get('/invoices', getInvoices); // ?username=&page=&limit=&type=&status=&search=
router.get('/invoices/:id', getInvoiceById);
router.post('/invoices/:id/duplicate', duplicateInvoice);
router.post('/invoices/:id/convert', convertToInvoice);
router.post('/invoices/:id/recurring', setupRecurring);
router.get('/invoices-aging', invoiceAgingReport);
router.get('/invoices/:id/pdf', require('../controllers/dbController').getInvoicePDF);

// Stock management routes
router.post('/products/:id/adjust', adjustStock);
router.post('/products/:id/transfer', transferStock);

// Purchase report
router.get('/purchase-report', purchaseReport);

module.exports = router;

