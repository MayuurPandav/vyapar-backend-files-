const { getDB } = require('../config/db');

/**
 * Normalizes phone numbers for WhatsApp & SMS:
 * Strips spaces, dashes, symbols. If 10 digits (India standard), prefixes with 91.
 */
function normalizePhoneNumber(rawPhone, defaultCountryCode = '91') {
  if (!rawPhone) return '';
  let phone = String(rawPhone).replace(/[^\d+]/g, '');
  if (phone.startsWith('+')) {
    phone = phone.slice(1);
  }
  // If 10 digits, assume standard Indian mobile number
  if (phone.length === 10) {
    phone = `${defaultCountryCode}${phone}`;
  }
  return phone;
}

/**
 * Logs communication attempts to the database for audit and dry-run tracking
 */
async function logNotificationAttempt({ channel, provider, to, payload, status, response, isDryRun = false }) {
  try {
    const db = getDB();
    await db.collection('sa_notifications_log').insertOne({
      channel, // 'whatsapp' | 'sms' | 'email'
      provider, // 'meta' | 'twilio' | 'fast2sms' | 'dryrun'
      to,
      payload,
      status, // 'sent' | 'failed' | 'dryrun'
      response,
      isDryRun,
      createdAt: new Date()
    });
  } catch (err) {
    console.error('[COMMUNICATION-LOG] Failed to log notification:', err.message);
  }
}

/**
 * Generates formatted text message for an Invoice/Bill
 */
function formatInvoiceMessage({ invoice, business, upiPaymentLink }) {
  const invNo = invoice?.invoiceNumber || invoice?.id || invoice?._id || 'N/A';
  const bizName = business?.businessName || business?.name || 'Vyapar Merchant';
  const customerName = invoice?.customerName || invoice?.partyName || invoice?.customer?.name || 'Valued Customer';
  const total = Number(invoice?.totalAmount || invoice?.total || 0).toLocaleString('en-IN');
  const paid = Number(invoice?.paidAmount || 0).toLocaleString('en-IN');
  const balance = Number(invoice?.balanceDue ?? invoice?.dueAmount ?? (invoice?.totalAmount - (invoice?.paidAmount || 0))).toLocaleString('en-IN');
  const dateStr = invoice?.billDate || invoice?.date ? new Date(invoice.billDate || invoice.date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');

  let text = `🧾 *INVOICE: #${invNo}*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🏢 *Shop:* ${bizName}\n`;
  text += `👤 *Customer:* ${customerName}\n`;
  text += `📅 *Date:* ${dateStr}\n\n`;

  if (Array.isArray(invoice?.products) && invoice.products.length > 0) {
    text += `📦 *Items (${invoice.products.length}):*\n`;
    invoice.products.slice(0, 5).forEach(item => {
      const name = item.name || item.productName || 'Item';
      const qty = item.quantity || 1;
      const amt = Number((item.price || 0) * qty).toLocaleString('en-IN');
      text += ` • ${name} (x${qty}) : ₹${amt}\n`;
    });
    if (invoice.products.length > 5) {
      text += ` • ...and ${invoice.products.length - 5} more item(s)\n`;
    }
    text += `\n`;
  }

  text += `💰 *Total Amount:* ₹${total}\n`;
  text += `💳 *Paid:* ₹${paid}\n`;
  text += `⚠️ *Balance Due:* ₹${balance}\n`;

  if (upiPaymentLink) {
    text += `\n📲 *Pay via UPI:* ${upiPaymentLink}\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `Thank you for shopping with us! 🙏`;

  return text;
}

/**
 * Generates formatted text message for a Payment Reminder
 */
function formatPaymentReminder({ partyName, businessName, amount, daysOverdue, invoiceNumber, upiPaymentLink }) {
  const biz = businessName || 'Vyapar Merchant';
  const party = partyName || 'Valued Customer';
  const amtFormatted = Number(amount || 0).toLocaleString('en-IN');

  let text = `📢 *PAYMENT REMINDER*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `Dear *${party}*,\n\n`;
  text += `This is a courteous reminder from *${biz}* regarding your pending balance.\n\n`;
  text += `💵 *Pending Amount:* ₹${amtFormatted}\n`;
  if (invoiceNumber) {
    text += `📄 *Invoice Ref:* #${invoiceNumber}\n`;
  }
  if (daysOverdue !== undefined && daysOverdue !== null) {
    text += `⏳ *Overdue By:* ${daysOverdue} day(s)\n`;
  }

  if (upiPaymentLink) {
    text += `\n📲 *Click to Pay via UPI:* ${upiPaymentLink}\n`;
  }

  text += `\nKindly clear the pending balance at your earliest convenience.\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `_If you have already paid, please disregard this notice._\n`;
  text += `Regards, *${biz}*`;

  return text;
}

/**
 * Generates a direct WhatsApp link for browser/app opening
 */
function generateWhatsAppDeepLink({ phone, text }) {
  const cleanPhone = normalizePhoneNumber(phone);
  const encodedText = encodeURIComponent(text);
  return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
}

/**
 * Sends a WhatsApp message via Meta WhatsApp Cloud API (Graph API)
 */
async function sendMetaWhatsApp({ to, text, mediaUrl = null, mediaType = 'document', fileName = 'invoice.pdf' }) {
  const token = process.env.META_WA_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.META_WA_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    throw new Error('Meta WhatsApp Cloud API credentials missing (META_WA_TOKEN or META_WA_PHONE_NUMBER_ID)');
  }

  const cleanPhone = normalizePhoneNumber(to);
  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;

  let payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone
  };

  if (mediaUrl) {
    payload.type = mediaType;
    payload[mediaType] = {
      link: mediaUrl,
      caption: text || '',
      filename: fileName
    };
  } else {
    payload.type = 'text';
    payload.text = {
      preview_url: true,
      body: text
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const resData = await response.json();
  if (!response.ok) {
    throw new Error(`Meta WhatsApp API error (${response.status}): ${JSON.stringify(resData)}`);
  }

  return resData;
}

/**
 * Sends a WhatsApp message via Twilio WhatsApp API
 */
async function sendTwilioWhatsApp({ to, text, mediaUrl = null }) {
  const sid = process.env.TWILIO_SID || process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_TOKEN || process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error('Twilio credentials missing (TWILIO_SID or TWILIO_TOKEN)');
  }

  const twilio = require('twilio')(sid, token);
  const cleanPhone = normalizePhoneNumber(to);
  const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
  const toFmt = to.startsWith('whatsapp:') ? to : `whatsapp:+${cleanPhone}`;

  const messageOptions = {
    body: text,
    from,
    to: toFmt
  };
  if (mediaUrl) {
    messageOptions.mediaUrl = [mediaUrl];
  }

  return await twilio.messages.create(messageOptions);
}

/**
 * Main WhatsApp Dispatcher:
 * Intelligently picks Meta Cloud API > Twilio > Dryrun
 */
async function sendWhatsApp({ to, text, mediaUrl = null, mediaType = 'document', fileName = 'invoice.pdf' }) {
  const cleanPhone = normalizePhoneNumber(to);
  const hasMeta = !!(process.env.META_WA_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN);
  const hasTwilio = !!((process.env.TWILIO_SID || process.env.TWILIO_ACCOUNT_SID) && (process.env.TWILIO_TOKEN || process.env.TWILIO_AUTH_TOKEN));

  if (hasMeta) {
    try {
      const res = await sendMetaWhatsApp({ to: cleanPhone, text, mediaUrl, mediaType, fileName });
      await logNotificationAttempt({ channel: 'whatsapp', provider: 'meta', to: cleanPhone, payload: { text, mediaUrl }, status: 'sent', response: res });
      return { ok: true, provider: 'meta', response: res };
    } catch (err) {
      console.error('[COMMUNICATION-SERVICE] Meta WhatsApp failed, attempting fallback:', err.message);
      if (!hasTwilio) {
        await logNotificationAttempt({ channel: 'whatsapp', provider: 'meta', to: cleanPhone, payload: { text }, status: 'failed', response: err.message });
        throw err;
      }
    }
  }

  if (hasTwilio) {
    try {
      const res = await sendTwilioWhatsApp({ to: cleanPhone, text, mediaUrl });
      await logNotificationAttempt({ channel: 'whatsapp', provider: 'twilio', to: cleanPhone, payload: { text, mediaUrl }, status: 'sent', response: res });
      return { ok: true, provider: 'twilio', response: res };
    } catch (err) {
      console.error('[COMMUNICATION-SERVICE] Twilio WhatsApp failed:', err.message);
      await logNotificationAttempt({ channel: 'whatsapp', provider: 'twilio', to: cleanPhone, payload: { text }, status: 'failed', response: err.message });
      throw err;
    }
  }

  throw new Error('WhatsApp service credentials are not configured in .env. Please configure Twilio or Meta WhatsApp.');
}

/**
 * Sends SMS via Fast2SMS (Indian Gateway with Instant Delivery & Low Cost)
 */
async function sendFast2SMS({ to, message, otp = null }) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) throw new Error('FAST2SMS_API_KEY is not set');

  const cleanPhone = normalizePhoneNumber(to);
  const tenDigitPhone = cleanPhone.length === 12 && cleanPhone.startsWith('91') ? cleanPhone.slice(2) : cleanPhone;

  let requestBody = {};
  if (otp) {
    // Fast2SMS dedicated OTP route
    requestBody = {
      route: 'otp',
      variables_values: String(otp),
      numbers: tenDigitPhone
    };
  } else {
    // Quick Transactional route
    requestBody = {
      route: 'q',
      message: message,
      language: 'english',
      numbers: tenDigitPhone
    };
  }

  const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      'authorization': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const resData = await response.json();
  if (!response.ok || (resData.return === false)) {
    throw new Error(`Fast2SMS failed: ${JSON.stringify(resData)}`);
  }

  return resData;
}

/**
 * Sends SMS via Twilio
 */
async function sendTwilioSMS({ to, message }) {
  const sid = process.env.TWILIO_SID || process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_TOKEN || process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('Twilio credentials missing');

  const twilio = require('twilio')(sid, token);
  const cleanPhone = normalizePhoneNumber(to);
  const from = process.env.TWILIO_FROM || process.env.TWILIO_PHONE;

  return await twilio.messages.create({
    body: message,
    from,
    to: `+${cleanPhone}`
  });
}

/**
 * Main SMS Dispatcher:
 * Intelligently picks Fast2SMS > Twilio > Dryrun
 */
async function sendSMS({ to, message, otp = null }) {
  const cleanPhone = normalizePhoneNumber(to);
  const hasFast2SMS = !!process.env.FAST2SMS_API_KEY;
  const hasTwilio = !!((process.env.TWILIO_SID || process.env.TWILIO_ACCOUNT_SID) && (process.env.TWILIO_TOKEN || process.env.TWILIO_AUTH_TOKEN));

  if (hasFast2SMS) {
    try {
      const res = await sendFast2SMS({ to: cleanPhone, message, otp });
      await logNotificationAttempt({ channel: 'sms', provider: 'fast2sms', to: cleanPhone, payload: { message, otp }, status: 'sent', response: res });
      return { ok: true, provider: 'fast2sms', response: res };
    } catch (err) {
      console.error('[COMMUNICATION-SERVICE] Fast2SMS failed, falling back:', err.message);
      if (!hasTwilio) {
        await logNotificationAttempt({ channel: 'sms', provider: 'fast2sms', to: cleanPhone, payload: { message, otp }, status: 'failed', response: err.message });
        throw err;
      }
    }
  }

  if (hasTwilio) {
    try {
      const res = await sendTwilioSMS({ to: cleanPhone, message });
      await logNotificationAttempt({ channel: 'sms', provider: 'twilio', to: cleanPhone, payload: { message }, status: 'sent', response: res });
      return { ok: true, provider: 'twilio', response: res };
    } catch (err) {
      console.error('[COMMUNICATION-SERVICE] Twilio SMS failed:', err.message);
      await logNotificationAttempt({ channel: 'sms', provider: 'twilio', to: cleanPhone, payload: { message }, status: 'failed', response: err.message });
      throw err;
    }
  }

  throw new Error('SMS service credentials are not configured in .env. Please configure Twilio or Fast2SMS.');
}

module.exports = {
  normalizePhoneNumber,
  formatInvoiceMessage,
  formatPaymentReminder,
  generateWhatsAppDeepLink,
  sendWhatsApp,
  sendSMS,
  sendFast2SMS,
  sendMetaWhatsApp,
  sendTwilioWhatsApp,
  sendTwilioSMS
};
