const express = require('express');
const router = express.Router();
const { getDeliveryLogs, getAnalyticsSummary } = require('../controllers/notificationsAnalyticsController');

router.get('/logs', getDeliveryLogs);
router.get('/summary', getAnalyticsSummary);

module.exports = router;
