const { getDB } = require('../config/db');
const { logAudit } = require('./authController');

// Get alert configuration (from settings)
async function getAlertsConfig(req, res) {
  try {
    const db = getDB();
    const { username } = req.query;
    if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
    const settings = await db.collection('settings').findOne({ username }) || {};
    const cfg = {
      lowStockThreshold: settings.lowStockThreshold || 5,
      expiryReminders: settings.expiryReminders || { enabled: true, days: [7,3,1] },
      notifyVia: settings.notifyVia || { email: true, whatsapp: false, sms: false }
    };
    return res.json({ status: 'success', config: cfg });
  } catch (err) {
    console.error('getAlertsConfig', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function updateAlertsConfig(req, res) {
  try {
    const db = getDB();
    const { username, config } = req.body;
    if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
    await db.collection('settings').updateOne({ username }, { $set: { ...config } }, { upsert: true });
    return res.json({ status: 'success' });
  } catch (err) {
    console.error('updateAlertsConfig', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Trigger expiry reminders (wrap existing superController logic if needed)
async function triggerExpiryReminders(req, res) {
  try {
    const db = getDB();
    // reuse simple scan
    const users = await db.collection('settings').find({ subscriptionExpiry: { $exists: true, $ne: null } }).toArray();
    const today = new Date();
    const reminders = [];
    for (const s of users) {
      const expiry = new Date(s.subscriptionExpiry);
      const diff = Math.ceil((expiry - today) / (1000*60*60*24));
      if ([7,3,1].includes(diff)) reminders.push({ username: s.username, daysLeft: diff, expiry: s.subscriptionExpiry });
    }
    return res.json({ status: 'success', reminders });
  } catch (err) {
    console.error('triggerExpiryReminders', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { getAlertsConfig, updateAlertsConfig, triggerExpiryReminders };

// Send notification via configured providers (email/sms/whatsapp)
async function sendNotification(req, res) {
  try {
    const { to, subject, message, via } = req.body || {};
    if (!to || !message) return res.status(400).json({ status: 'error', message: 'to and message required' });

    const results = { email: null, sms: null, whatsapp: null };

    // helper retry
    async function retry(fn, attempts = 3, backoff = 300) {
      let a = 0; let lastErr = null;
      while (a < attempts) {
        try { return await fn(); } catch (e) { lastErr = e; a++; await new Promise(r => setTimeout(r, backoff * a)); }
      }
      throw lastErr;
    }

    // SendGrid email
    const { SENDGRID_API_KEY, SENDGRID_FROM } = process.env;
    if (via && via.email && SENDGRID_API_KEY && SENDGRID_FROM) {
      try {
        await retry(() => fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SENDGRID_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: SENDGRID_FROM },
            subject: subject || 'Notification',
            content: [{ type: 'text/plain', value: message }]
          })
        }), 3, 300);
        results.email = 'sent';
      } catch (e) {
        console.error('sendNotification.sendgrid', e);
        results.email = 'error';
      }
    }

    // Twilio SMS / WhatsApp
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
    if ((via && (via.sms || via.whatsapp)) && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM) {
      try {
        const isWhats = via.whatsapp;
        const toNumber = isWhats ? `whatsapp:${to}` : to;
        const fromNumber = isWhats ? `whatsapp:${TWILIO_FROM}` : TWILIO_FROM;
        const body = new URLSearchParams();
        body.append('To', toNumber);
        body.append('From', fromNumber);
        body.append('Body', message);

        const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
        await retry(() => fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        }), 3, 300);
        if (via.whatsapp) results.whatsapp = 'sent'; else results.sms = 'sent';
      } catch (e) {
        console.error('sendNotification.twilio', e);
        if (via.whatsapp) results.whatsapp = 'error'; else results.sms = 'error';
      }
    }

    // Audit log
    try { await logAudit('SYSTEM', 'NOTIFICATION_SENT', JSON.stringify({ to, via, results })); } catch (e) {}

    return res.json({ status: 'success', results });
  } catch (err) {
    console.error('sendNotification', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports.sendNotification = sendNotification;
