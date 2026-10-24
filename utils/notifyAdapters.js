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

async function logDryrun(type, to, subjectOrBody, bodyOrEmpty = '') {
  try {
    const db = getDB();
    await db.collection('sa_dryrun_notifications').insertOne({
      type,
      to,
      subject: type === 'email' ? subjectOrBody : null,
      body: type === 'email' ? bodyOrEmpty : subjectOrBody,
      createdAt: new Date()
    });
  } catch (err) {
    console.error('[DRYRUN-LOGGER] Failed to insert dryrun notification:', err.message);
  }
}

const emailService = require('../services/emailService');
const communicationService = require('../services/communicationService');

async function sendEmail(to, subject, html, attachments = [], options = {}) {
  try {
    const res = await emailService.sendEmail({
      to,
      subject,
      html,
      attachments,
      fromName: options.fromName
    });
    if (res.dryrun) {
      await logDryrun('email', to, subject, html);
    }
    return res;
  } catch (err) {
    console.error('[EMAIL-ADAPTER-ERROR]', err.message);
    await logDryrun('email-error', to, subject, `Error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function sendSMS(to, body, options = {}) {
  try {
    const res = await communicationService.sendSMS({ to, message: body, otp: options.otp });
    if (res.dryrun) {
      await logDryrun('sms', to, body);
    }
    return res;
  } catch (err) {
    console.error('[SMS-ADAPTER-ERROR]', err.message);
    await logDryrun('sms-error', to, `${body} | Error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function sendWhatsApp(to, body, options = {}) {
  try {
    const res = await communicationService.sendWhatsApp({
      to,
      text: body,
      mediaUrl: options.mediaUrl,
      mediaType: options.mediaType,
      fileName: options.fileName
    });
    if (res.dryrun) {
      await logDryrun('whatsapp', to, body);
    }
    return res;
  } catch (err) {
    console.error('[WHATSAPP-ADAPTER-ERROR]', err.message);
    await logDryrun('whatsapp-error', to, `${body} | Error: ${err.message}`);
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
