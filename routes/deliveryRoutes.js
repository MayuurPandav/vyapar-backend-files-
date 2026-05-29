const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/deliveryController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Deliveries
router.get('/deliveries', ctrl.listDeliveries);
router.post('/deliveries', ctrl.createDelivery);
router.get('/deliveries/:id', ctrl.getDelivery);
router.put('/deliveries/:id', ctrl.updateDelivery);
router.post('/deliveries/:id/assign', ctrl.assignDelivery);
router.post('/deliveries/:id/proof', upload.single('file'), ctrl.uploadProof);
router.post('/deliveries/:id/return', ctrl.markReturn);

// Delivery boys
router.get('/delivery-boys', ctrl.listDeliveryBoys);
router.post('/delivery-boys', ctrl.createDeliveryBoy);

// Barcodes
router.post('/barcodes/generate', ctrl.generateBarcode);
router.get('/barcodes', ctrl.listBarcodes);
router.get('/barcodes/:productId', ctrl.getBarcodeByProduct);
router.get('/barcodes/pdf', ctrl.generateBarcodesPDF);

module.exports = router;
