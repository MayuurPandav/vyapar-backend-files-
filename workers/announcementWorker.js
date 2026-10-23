const { announcementQueue } = require('../queue/announcementQueue');
const { sendEmail, sendSMS, sendWhatsApp } = require('../utils/notifyAdapters');
const { getDB } = require('../config/db');

let loggedRedisError = false;

// Handle Bull Redis/Queue errors gracefully without cluttering console in dev
announcementQueue.on('error', (err) => {
  if (err.message && err.message.includes('ECONNREFUSED')) {
    // Redis is optional in development; stay clean and silent
    return;
  }
  console.warn('[WORKER] Announcement Queue notice:', err.message);
});

announcementQueue.process('deliver', async (job) => {
  const { announcementId, channel, recipient, payload } = job.data;
  
  console.log(`[WORKER] Processing announcement job ${job.id} on channel "${channel}" to "${recipient.username}"`);
  
  const db = getDB();
  let toField = null;
  let result = null;
  
  try {
    if (channel === 'email') {
      toField = recipient.email;
      if (toField) {
        result = await sendEmail(toField, payload.title, `<p>${payload.message}</p>`);
      }
    } else if (channel === 'sms') {
      toField = recipient.phone;
      if (toField) {
        result = await sendSMS(toField, payload.message);
      }
    } else if (channel === 'whatsapp') {
      toField = recipient.phone || recipient.whatsappNumber;
      if (toField) {
        result = await sendWhatsApp(toField, payload.message);
      }
    }
    
    // Log success delivery trace
    await db.collection('sa_delivery_logs').insertOne({
      announcementId,
      channel,
      username: recipient.username,
      to: toField,
      status: 'sent',
      ts: new Date(),
      result: result ? JSON.stringify(result) : null
    });
    
    console.log(`[WORKER] Successfully processed job ${job.id} for "${recipient.username}"`);
    return { status: 'sent', recipient: recipient.username };
    
  } catch (err) {
    console.error(`[WORKER] Error executing job ${job.id}:`, err.message);
    
    // Log failure trace
    try {
      await db.collection('sa_delivery_logs').insertOne({
        announcementId,
        channel,
        username: recipient.username,
        to: toField || recipient.email || recipient.phone || null,
        status: 'error',
        error: err.message,
        ts: new Date()
      });
    } catch (dbErr) {
      console.error('[WORKER] Failed to log failure trace to MongoDB:', dbErr.message);
    }
    
    throw err; // bubble up so Bull knows the job failed
  }
});

console.log('[WORKER] Announcement worker initialized and waiting for jobs.');

module.exports = announcementQueue;
