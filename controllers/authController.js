const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');

// In-memory OTP storage matching backend/app.py OTP_STORE
const OTP_STORE = {};

async function logAudit(username, action, details = "") {
  try {
    const db = getDB();
    await db.collection('sa_audit').insertOne({
      username,
      action,
      timestamp: new Date(),
      details
    });
  } catch (err) {
    // Ignore audit logging errors
  }
}

// User Registration
async function register(req, res) {
  const { username, password, phone } = req.body;
  if (!phone) {
    return res.status(400).json({ status: "error", message: "Phone number is required" });
  }

  const db = getDB();
  try {
    // Check if username or phone already exists
    const existingUser = await db.collection('users').findOne({
      $or: [{ username }, { phone }]
    });

    if (existingUser) {
      return res.status(400).json({ status: "error", message: "Username or Phone number already exists" });
    }

    // Insert new user
    const newUser = {
      username,
      password,
      phone,
      role: 'admin',
      status: 'active'
    };
    await db.collection('users').insertOne(newUser);

    // Create initial settings
    await db.collection('settings').updateOne(
      { username },
      {
        $set: {
          username,
          bizName: null,
          email: null,
          phone,
          theme: 'light',
          isGstVerified: 0,
          isPhoneVerified: 0,
          isEmailVerified: 0,
          isWhatsappVerified: 0,
          gstin: null,
          subscriptionExpiry: null,
          planName: 'Bronze',
          planCycle: 'MONTHLY'
        }
      },
      { upsert: true }
    );

    await logAudit(username, 'REGISTER_SUCCESS');

    // Determine onboarding flags for the new user
    const profileComplete = false;
    const subscription = { active: false, expiry: null, planName: 'Bronze', planCycle: 'MONTHLY' };
    const onboardingRequired = true;

    return res.json({
      status: "success",
      token: "mongo_token_" + username,
      user: {
        username,
        role: 'admin',
        phone,
        status: 'active'
      },
      profileComplete,
      subscription,
      onboardingRequired
    });

  } catch (err) {
    return res.status(400).json({ status: "error", message: err.message });
  }
}

// User Login
async function login(req, res) {
  const { username, password } = req.body;
  const db = getDB();

  try {
    const user = await db.collection('users').findOne({ username, password });
    if (user) {
      if (user.status === 'blocked') {
        await logAudit(username, "LOGIN_ATTEMPT_BLOCKED", "User tried to login while blocked");
        return res.status(403).json({ status: "error", message: "Your account has been blocked by the administrator." });
      }

      // Load settings to determine onboarding / subscription state
      const settings = await db.collection('settings').findOne({ username: user.username }) || {};

      const profileComplete = !!(settings.bizName && settings.email && settings.phone);

      let subscription = { active: false, expiry: null, planName: settings.planName || null, planCycle: settings.planCycle || null };
      if (settings.subscriptionExpiry) {
        try {
          const expiry = new Date(settings.subscriptionExpiry);
          subscription.expiry = settings.subscriptionExpiry;
          subscription.active = expiry >= new Date(new Date().setHours(0,0,0,0));
        } catch (e) {
          subscription.active = false;
        }
      }

      const onboardingRequired = !profileComplete || !subscription.active;

      await logAudit(user.username, "LOGIN_SUCCESS");
      return res.json({
        status: "success",
        token: "mongo_token_" + user.username,
        user: {
          username: user.username,
          role: user.role,
          phone: user.phone,
          status: user.status
        },
        profileComplete,
        subscription,
        onboardingRequired
      });
    }

    return res.status(401).json({ status: "error", message: "Invalid credentials" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Subscribe / Activate plan (onboarding flow)
async function subscribe(req, res) {
  const { username, planName } = req.body;
  if (!username || !planName) return res.status(400).json({ status: 'error', message: 'username and planName required' });
  try {
    const db = getDB();
    const plan = await db.collection('sa_plans').findOne({ name: planName });
    const price = plan ? (parseFloat(plan.price) || 0) : 0;
    const cycle = plan ? (plan.cycle || 'MONTHLY') : 'MONTHLY';

    const today = new Date();
    const daysToAdd = (cycle === 'YEARLY') ? 365 : 30;
    const expiry = new Date(today);
    expiry.setDate(expiry.getDate() + daysToAdd);
    const expiryStr = expiry.toISOString().substring(0,10);

    // Record payment
    await db.collection('sa_payments').insertOne({ username, amount: price, plan_name: planName, date: new Date().toISOString().substring(0,10), method: 'Onboarding', type: 'signup' });

    // Update settings
    await db.collection('settings').updateOne({ username }, { $set: { subscriptionExpiry: expiryStr, planName: planName, planCycle: cycle, subscriptionCancelled: false } }, { upsert: true });

    await logAudit(username, 'SUBSCRIBE', `Plan ${planName} activated until ${expiryStr}`);

    return res.json({ status: 'success', subscription: { active: true, expiry: expiryStr, planName, planCycle: cycle } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Send OTP
async function sendOTP(req, res) {
  const { username, field, value } = req.body;
  const cleanValue = (value || '').trim();

  if (!['phone', 'email', 'whatsapp'].includes(field)) {
    return res.status(400).json({ status: 'error', message: 'Invalid verification channel.' });
  }
  if (!username || !cleanValue) {
    return res.status(400).json({ status: 'error', message: 'Username and value are required.' });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
  
  OTP_STORE[`${username}:${field}`] = { code, expires };
  await logAudit(username, 'OTP_SENT', `${field} OTP generated for ${cleanValue}`);

  let sent = false;
  let sendError = null;

  // Twilio / SMTP Providers can be implemented here based on env variables
  try {
    if (field === 'email') {
      const { SENDGRID_API_KEY, SENDGRID_FROM } = process.env;
      if (SENDGRID_API_KEY && SENDGRID_FROM) {
        // Send via SendGrid Web API
        try {
          await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SENDGRID_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: cleanValue }] }],
              from: { email: SENDGRID_FROM },
              subject: 'Your Vyapar verification code',
              content: [{ type: 'text/plain', value: `Your verification code is: ${code}` }]
            })
          });
          sent = true;
        } catch (err) {
          sendError = err.message;
        }
      }
      // Optionally validate email via AbstractAPI if key present
      const { ABSTRACTAPI_KEY } = process.env;
      if (ABSTRACTAPI_KEY) {
        try {
          // lightweight validation (not strictly required)
          await fetch(`https://emailvalidation.abstractapi.com/v1/?api_key=${ABSTRACTAPI_KEY}&email=${encodeURIComponent(cleanValue)}`);
        } catch (_) {}
      }
    }
    if (field === 'phone') {
      const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
      if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM) {
        try {
          const body = new URLSearchParams({ To: cleanValue, From: TWILIO_FROM, Body: `Your Vyapar verification code is: ${code}` });
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
          });
          sent = true;
        } catch (err) {
          sendError = err.message;
        }
      }
      // Optionally validate phone number via AbstractAPI (if provided)
      const { ABSTRACTAPI_KEY } = process.env;
      if (ABSTRACTAPI_KEY) {
        try {
          await fetch(`https://phonevalidation.abstractapi.com/v1/?api_key=${ABSTRACTAPI_KEY}&phone=${encodeURIComponent(cleanValue)}`);
        } catch (_) {}
      }
    }
  } catch (err) {
    sendError = err.message;
  }

  if (!sent) {
    console.log(`[OTP] ${username} ${field} -> ${cleanValue} : ${code}`);
  }

  const devReturn = (process.env.DEV_RETURN_OTP || 'false').toLowerCase() === 'true';
  const responsePayload = { status: 'success', message: `OTP dispatched to ${field}.` };

  if (devReturn) {
    responsePayload.otp = process.env.DEV_RETURN_OTP === 'true' ? code : process.env.DEV_RETURN_OTP;
  } else {
    if (!sent) {
      responsePayload.note = 'No delivery provider configured; OTP logged to server console.';
    } else if (sendError) {
      responsePayload.warning = 'OTP queued but delivery reported a non-fatal error.';
    }
  }

  return res.json(responsePayload);
}

// Verify OTP
async function verifyOTP(req, res) {
  const { username, field, code } = req.body;
  const cleanCode = (code || '').trim();

  if (!['phone', 'email', 'whatsapp'].includes(field)) {
    return res.status(400).json({ status: 'error', message: 'Invalid verification channel.' });
  }

  const key = `${username}:${field}`;
  const entry = OTP_STORE[key];

  if (!entry || new Date() > entry.expires) {
    return res.status(400).json({ status: 'error', message: 'OTP expired or not found.' });
  }
  if (entry.code !== cleanCode) {
    return res.status(400).json({ status: 'error', message: 'Invalid OTP.' });
  }

  const statusKey = `is${field.charAt(0).toUpperCase() + field.slice(1)}Verified`;
  const db = getDB();

  try {
    await db.collection('settings').updateOne(
      { username },
      { $set: { [statusKey]: 1 } }
    );

    await logAudit(username, 'OTP_VERIFIED', `${field} verified successfully`);
    delete OTP_STORE[key];
    return res.json({ status: 'success', message: `${field.charAt(0).toUpperCase() + field.slice(1)} verified successfully.` });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// GSTIN verification endpoint (format check + optional external provider)
async function verifyGSTIN(req, res) {
  const { gstin } = req.body;
  if (!gstin) return res.status(400).json({ status: 'error', message: 'gstin required' });
  const clean = (gstin || '').trim().toUpperCase();
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstRegex.test(clean)) return res.status(400).json({ status: 'error', message: 'GSTIN format invalid' });

  // If external GST API configured, forward request
  const { GST_API_URL, GST_API_KEY } = process.env;
  if (GST_API_URL && GST_API_KEY) {
    try {
      const resp = await fetch(GST_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GST_API_KEY}` },
        body: JSON.stringify({ gstin: clean })
      });
      const j = await resp.json();
      return res.json({ status: 'success', authoritative: true, result: j });
    } catch (err) {
      return res.status(502).json({ status: 'error', message: 'External GST verification failed', error: err.message });
    }
  }

  // No external provider — return format OK
  return res.json({ status: 'success', authoritative: false, message: 'GSTIN format valid (no external verification configured).' });
}

module.exports = {
  register,
  login,
  subscribe,
  sendOTP,
  verifyOTP,
  verifyGSTIN,
  logAudit
};
