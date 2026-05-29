const express = require('express');
const router = express.Router();
const { getAlertsConfig, updateAlertsConfig, triggerExpiryReminders } = require('../controllers/notificationController');

router.get('/config', getAlertsConfig);
router.post('/config', updateAlertsConfig);
router.post('/trigger/expiry-reminders', triggerExpiryReminders);
router.post('/send', require('../controllers/notificationController').sendNotification);

module.exports = router;
