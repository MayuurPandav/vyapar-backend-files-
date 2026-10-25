const express = require('express');
const router = express.Router();
const { getDB } = require('../config/db');

router.get('/health', async (req, res) => {
  try {
    const db = getDB();
    // Ping the database to ensure connectivity
    await db.command({ ping: 1 });
    return res.json({
      status: 'ok',
      db: 'connected',
      services: {
        sendgrid: Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM),
        twilio: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM),
        razorpay: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
      }
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
