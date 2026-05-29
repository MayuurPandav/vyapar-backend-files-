const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reportController');

router.get('/reports/sales', ctrl.salesReport);
router.get('/reports/inventory/low-stock', ctrl.inventoryLowStock);
router.get('/reports/delivery', ctrl.deliveryReport);
router.get('/reports/financial', ctrl.financialSummary);
router.get('/reports/gst', ctrl.gstSummary);
router.get('/reports/ageing', ctrl.ageingReport);
router.get('/reports/party-ledger', ctrl.partyLedger);
router.get('/reports/purchase', ctrl.purchaseReport);
router.get('/reports/inventory/advanced', ctrl.inventoryAdvancedReport);

module.exports = router;
