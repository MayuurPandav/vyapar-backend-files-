const nodemailer = require('nodemailer');
const { getDB } = require('../config/db');

// Attempt to create a transport if SMTP env is present
let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

const emailService = require('../services/emailService');
const communicationService = require('../services/communicationService');

async function sendEmail(to, subject, html, attachments = [], options = {}) {
  try {
    return await emailService.sendEmail({
      to,
      subject,
      html,
      attachments,
      fromName: options.fromName
    });
  } catch (err) {
    console.error('[EMAIL-ADAPTER-ERROR]', err.message);
    return { ok: false, error: err.message };
  }
}

async function sendSMS(to, body, options = {}) {
  try {
    return await communicationService.sendSMS({ to, message: body, otp: options.otp });
  } catch (err) {
    console.error('[SMS-ADAPTER-ERROR]', err.message);
    return { ok: false, error: err.message };
  }
}

async function sendWhatsApp(to, body, options = {}) {
  try {
    return await communicationService.sendWhatsApp({
      to,
      text: body,
      mediaUrl: options.mediaUrl,
      mediaType: options.mediaType,
      fileName: options.fileName
    });
  } catch (err) {
    console.error('[WHATSAPP-ADAPTER-ERROR]', err.message);
    return { ok: false, error: err.message };
  }
}

async function sendInApp(username, title, message, meta) {
  const db = getDB();
  const doc = { username, title, message, meta: meta || {}, createdAt: new Date(), read: false };
  await db.collection('sa_notifications').insertOne(doc);
  return { ok: true };
}

module.exports = { sendEmail, sendSMS, sendWhatsApp, sendInApp };
