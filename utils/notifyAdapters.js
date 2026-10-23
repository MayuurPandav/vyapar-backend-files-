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

async function sendEmail(to, subject, html, attachments = []) {
  if (!mailer) {
    console.log('[EMAIL][DRYRUN] to=', to, 'subject=', subject, 'attachments=', attachments.map(a => a.filename));
    await logDryrun('email', to, subject, html);
    return { ok: true, dryrun: true };
  }
  const res = await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html, attachments });
  return res;
}

// SMS / WhatsApp placeholders — prefer Twilio if configured
const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_TOKEN = process.env.TWILIO_TOKEN;
let twilioClient = null;
if (TWILIO_SID && TWILIO_TOKEN) {
  try { twilioClient = require('twilio')(TWILIO_SID, TWILIO_TOKEN); } catch (e) { twilioClient = null; }
}

async function sendSMS(to, body) {
  if (!twilioClient) {
    console.log('[SMS][DRYRUN] to=', to, 'body=', body);
    await logDryrun('sms', to, body);
    return { ok: true, dryrun: true };
  }
  const from = process.env.TWILIO_FROM || process.env.TWILIO_PHONE;
  const msg = await twilioClient.messages.create({ body, from, to });
  return msg;
}

async function sendWhatsApp(to, body) {
  if (!twilioClient) {
    console.log('[WHATSAPP][DRYRUN] to=', to, 'body=', body);
    await logDryrun('whatsapp', to, body);
    return { ok: true, dryrun: true };
  }
  const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:' + process.env.TWILIO_PHONE;
  const toFmt = to.startsWith('whatsapp:') ? to : 'whatsapp:' + to;
  const msg = await twilioClient.messages.create({ body, from, to: toFmt });
  return msg;
}

async function sendInApp(username, title, message, meta) {
  const db = getDB();
  const doc = { username, title, message, meta: meta || {}, createdAt: new Date(), read: false };
  await db.collection('sa_notifications').insertOne(doc);
  return { ok: true };
}

module.exports = { sendEmail, sendSMS, sendWhatsApp, sendInApp };
