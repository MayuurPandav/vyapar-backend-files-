const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ctrl = require('../controllers/driverController');

// Ensure upload directories exist
const uploadRoot = path.join(__dirname, '..', 'uploads');
const proofUploadPath = path.join(uploadRoot, 'proofs');
const profileUploadPath = path.join(uploadRoot, 'profiles');
fs.mkdirSync(proofUploadPath, { recursive: true });
fs.mkdirSync(profileUploadPath, { recursive: true });

// Setup multer storage configurations
const proofStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, proofUploadPath);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "-");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const uploadProof = multer({
  storage: proofStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  }
});

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, profileUploadPath);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "-");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const uploadProfile = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  }
});

// Authentication endpoints
router.post('/auth/register', ctrl.registerDriver);
router.post('/auth/login', ctrl.loginDriver);

// Options & Maps & Public Tracking endpoints
router.get('/options', ctrl.getOptions);
router.get('/maps/provider', ctrl.getMapProvider);
router.get('/maps/search', ctrl.searchMap);
router.get('/maps/navigation-url', ctrl.getNavigationUrl);
router.get('/track/order/:orderId', ctrl.getPublicOrderTracking);

// Profile endpoints (require driver authentication middleware)
router.get('/profile', ctrl.driverAuthMiddleware, ctrl.getProfile);
router.put('/profile', ctrl.driverAuthMiddleware, ctrl.updateProfile);
router.patch('/profile/password', ctrl.driverAuthMiddleware, ctrl.changePassword);
router.post('/profile/photo', ctrl.driverAuthMiddleware, uploadProfile.single('profilePhoto'), ctrl.uploadProfilePhoto);
router.get('/profile/delivery-history', ctrl.driverAuthMiddleware, ctrl.getDeliveryHistory);
router.get('/profile/earnings-history', ctrl.driverAuthMiddleware, ctrl.getEarningsHistory);

// Dashboard aggregate endpoint
router.get('/driver/dashboard', ctrl.driverAuthMiddleware, ctrl.getDriverDashboard);

// Deliveries endpoints (require driver authentication middleware)
router.get('/deliveries', ctrl.driverAuthMiddleware, ctrl.listDriverDeliveries);
router.post('/deliveries', ctrl.driverAuthMiddleware, ctrl.createDriverDelivery);
router.get('/deliveries/:id', ctrl.driverAuthMiddleware, ctrl.getDriverDeliveryDetail);
router.put('/deliveries/:id', ctrl.driverAuthMiddleware, ctrl.updateDriverDelivery);
router.delete('/deliveries/:id', ctrl.driverAuthMiddleware, ctrl.deleteDriverDelivery);

// Delivery Action endpoints (require driver authentication middleware)
router.patch('/deliveries/:id/status', ctrl.driverAuthMiddleware, ctrl.updateDeliveryStatus);
router.patch('/deliveries/:id/payment', ctrl.driverAuthMiddleware, ctrl.collectPayment);
router.post('/deliveries/:id/proof', ctrl.driverAuthMiddleware, uploadProof.single('proofPhoto'), ctrl.uploadProofPhoto);
router.post('/deliveries/:id/return', ctrl.driverAuthMiddleware, ctrl.initiateReturn);

// Live GPS Driver Streaming
router.post('/location/update', ctrl.driverAuthMiddleware, ctrl.updateDriverLocation);

// Seeding endpoint
router.post('/seed', ctrl.driverAuthMiddleware, ctrl.seedDeliveries);

module.exports = router;
