const express = require('express');
const router = express.Router();
const { getAlertsConfig, updateAlertsConfig, triggerExpiryReminders, sendNotification, ackRead, listTemplates, createTemplate, previewRecipients, getActiveAlerts, sendReminder, getMyNotifications } = require('../controllers/notificationController');
// prefer redis-based limiter when available
let rateLimiter;
try { rateLimiter = require('../middleware/redisRateLimiter'); } catch (e) { rateLimiter = require('../middleware/rateLimiter'); }

router.get('/config', getAlertsConfig);
router.post('/config', updateAlertsConfig);
router.post('/trigger/expiry-reminders', triggerExpiryReminders);
router.post('/send', rateLimiter, sendNotification);
router.post('/preview', previewRecipients);
router.post('/ack/read', ackRead);
router.get('/my', getMyNotifications);
router.get('/dryruns', async (req, res) => {
  try {
    const { getDB } = require('../config/db');
    const db = getDB();
    const dryruns = await db.collection('sa_dryrun_notifications').find({}).sort({ createdAt: -1 }).limit(100).toArray();
    return res.json({ status: 'success', dryruns });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// Active alerts and notifications
router.get('/active', getActiveAlerts);
router.post('/remind', sendReminder);

// templates
router.get('/templates', listTemplates);
router.post('/templates', createTemplate);

module.exports = router;
