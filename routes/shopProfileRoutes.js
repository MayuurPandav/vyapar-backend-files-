const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
  getShopProfile,
  upsertShopProfile,
  uploadShopLogo,
  getBranches,
  addBranch,
  editBranch,
  deleteBranch,
  updateBusinessSettings,
  updateSocialMedia,
  getAnalytics,
  getAnalyticsInvoices,
  getAnalyticsEmployees,
  getReceiptSettings,
  updateReceiptSettings
} = require('../controllers/shopProfileController');

// Multer setup for Shop Logo upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `shop-logo-${Date.now()}${ext}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

// Profile Routes
router.get('/', getShopProfile);
router.post('/', upsertShopProfile);
router.put('/', upsertShopProfile);
router.post('/logo', upload.single('logo'), uploadShopLogo);

// Branches Routes
router.get('/branches', getBranches);
router.post('/branches', addBranch);
router.put('/branches/:id', editBranch);
router.delete('/branches/:id', deleteBranch);

// Settings Routes
router.get('/receipt-settings', getReceiptSettings);
router.put('/receipt-settings', updateReceiptSettings);
router.post('/receipt-settings', updateReceiptSettings);
router.put('/business-settings', updateBusinessSettings);
router.put('/social-media', updateSocialMedia);

// Analytics
router.get('/analytics', getAnalytics);
router.get('/analytics/invoices', getAnalyticsInvoices);
router.get('/analytics/employees', getAnalyticsEmployees);

module.exports = router;
