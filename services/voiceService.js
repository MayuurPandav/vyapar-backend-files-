const { getDB } = require('../config/db');

/**
 * Normalizes phone numbers to standard E.164 (+91...)
 */
function normalizePhone(rawPhone, defaultCountryCode = '91') {
  if (!rawPhone) return '';
  let phone = String(rawPhone).replace(/[^\d+]/g, '');
  if (phone.startsWith('+')) {
    phone = phone.slice(1);
  }
  if (phone.length === 10) {
    phone = `${defaultCountryCode}${phone}`;
  }
  return `+${phone}`;
}

/**
 * Logs voice call attempts in the database for tracking & history
 */
async function logVoiceAttempt({ type, from, to, callSid, status, duration = 0, isDryRun = false, meta = {} }) {
  try {
    const db = getDB();
    await db.collection('sa_voice_calls_log').insertOne({
      type, // 'masked_bridge' | 'ivr_reminder'
      from,
      to,
      callSid,
      status, // 'initiated' | 'completed' | 'failed' | 'dryrun'
      duration,
      isDryRun,
      meta,
      createdAt: new Date()
    });
  } catch (err) {
    console.error('[VOICE-LOG-ERROR]', err.message);
  }
}

/**
 * Initiates a Masked Click-to-Call Bridge:
 * 1. Twilio calls the Staff or Driver (agent)
 * 2. When agent answers, plays a prompt and bridges the call to the Customer
 * 3. Masking: Both parties see the Twilio business number, preserving privacy!
 */
async function initiateMaskedCall({ fromAgent, toCustomer, agentName = 'Driver', customerName = 'Customer', orderId = null }) {
  const sid = process.env.TWILIO_SID || process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_TOKEN || process.env.TWILIO_AUTH_TOKEN;
  const twilioNumber = process.env.TWILIO_FROM || process.env.TWILIO_PHONE;

  if (!fromAgent) throw new Error('Agent/caller phone number is required');
  if (!toCustomer) throw new Error('Customer recipient phone number is required');

  const cleanAgentPhone = normalizePhone(fromAgent);
  const cleanCustomerPhone = normalizePhone(toCustomer);

  if (!sid || !token || !twilioNumber) {
    throw new Error('Twilio Voice credentials are not configured in .env. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM.');
  }

  const twilio = require('twilio')(sid, token);

  // TwiML to whisper to the agent and dial the customer
  const twiml = `
    <Response>
      <Say voice="alice" language="en-IN">Hello ${agentName}. Connecting your masked call to ${customerName}. Please hold.</Say>
      <Dial callerId="${twilioNumber}" timeout="30" record="false">
        <Number>${cleanCustomerPhone}</Number>
      </Dial>
    </Response>
  `.trim();

  const call = await twilio.calls.create({
    twiml,
    to: cleanAgentPhone,
    from: twilioNumber
  });

  await logVoiceAttempt({
    type: 'masked_bridge',
    from: cleanAgentPhone,
    to: cleanCustomerPhone,
    callSid: call.sid,
    status: call.status || 'initiated',
    isDryRun: false,
    meta: { agentName, customerName, orderId, twilioNumber }
  });

  return {
    ok: true,
    callSid: call.sid,
    status: call.status,
    fromMaskedNumber: twilioNumber,
    directDialUrl: `tel:${cleanCustomerPhone}`
  };
}

/**
 * Dispatches an Automated Voice Reminder (IVR) to a customer for payment settlement
 */
async function sendAutomatedVoiceReminder({ to, customerName = 'Customer', businessName = 'Vyapar', amount, invoiceNumber = null }) {
  const sid = process.env.TWILIO_SID || process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_TOKEN || process.env.TWILIO_AUTH_TOKEN;
  const twilioNumber = process.env.TWILIO_FROM || process.env.TWILIO_PHONE;

  if (!to) throw new Error('Recipient phone number is required');
  const cleanTo = normalizePhone(to);

  if (!sid || !token || !twilioNumber) {
    throw new Error('Twilio Voice credentials are not configured in .env. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM.');
  }

  const twilio = require('twilio')(sid, token);

  const invDetails = invoiceNumber ? `for invoice number ${invoiceNumber}` : '';
  const twiml = `
    <Response>
      <Pause length="1"/>
      <Say voice="alice" language="en-IN">
        Hello ${customerName}. This is an automated notification from ${businessName}.
        Your outstanding balance of ${amount} rupees ${invDetails} is pending settlement.
        Kindly clear your balance at your earliest convenience. Thank you and have a wonderful day!
      </Say>
      <Pause length="1"/>
    </Response>
  `.trim();

  const call = await twilio.calls.create({
    twiml,
    to: cleanTo,
    from: twilioNumber
  });

  await logVoiceAttempt({
    type: 'ivr_reminder',
    from: twilioNumber,
    to: cleanTo,
    callSid: call.sid,
    status: call.status || 'initiated',
    isDryRun: false,
    meta: { customerName, businessName, amount, invoiceNumber }
  });

  return {
    ok: true,
    callSid: call.sid,
    status: call.status
  };
}

module.exports = {
  normalizePhone,
  initiateMaskedCall,
  sendAutomatedVoiceReminder
};
