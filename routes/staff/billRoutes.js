const express = require('express');
const router = express.Router();
const { protect, adminOnly, checkPermission } = require('../../middleware/staff/authMiddleware');
const {
  getAllBills,
  getBillById,
  createBill,
  updateBill,
  updatePayment,
  deleteBill,
  issueCreditNote,
  getCreditNotes,
  getBillAsText,
  getBillAsJSON,
  getBillAsCSV,
} = require('../../controllers/staff/billController');

// Main CRUD routes
router.route('/')
  .get(protect, checkPermission('canViewAllInvoices'), getAllBills)
  .post(protect, checkPermission('canAcceptPayment'), createBill);

router.route('/:id')
  .get(protect, checkPermission('canViewAllInvoices'), getBillById)
  .put(protect, checkPermission('canEditRate'), updateBill)
  .delete(protect, checkPermission('canIssueCredit'), deleteBill);

// Payment update route
router.route('/:id/payment').put(protect, checkPermission('canAcceptPayment'), updatePayment);

// Credit note routes
router.route('/:id/credit-note').post(protect, checkPermission('canIssueCredit'), issueCreditNote);
router.route('/:id/credit-notes').get(protect, checkPermission('canViewAllInvoices'), getCreditNotes);

// Export routes
router.route('/:id/export/text').get(protect, checkPermission('canViewAllInvoices'), getBillAsText);
router.route('/:id/export/json').get(protect, checkPermission('canViewAllInvoices'), getBillAsJSON);
router.route('/:id/export/csv').get(protect, checkPermission('canViewAllInvoices'), getBillAsCSV);

module.exports = router;
