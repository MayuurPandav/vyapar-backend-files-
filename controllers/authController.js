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

    return res.json({
      status: "success",
      token: "mongo_token_" + username,
      user: {
        username,
        role: 'admin',
        phone,
        status: 'active'
      }
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

      await logAudit(user.username, "LOGIN_SUCCESS");
      return res.json({
        status: "success",
        token: "mongo_token_" + user.username,
        user: {
          username: user.username,
          role: user.role,
          phone: user.phone,
          status: user.status
        }
      });
    }

    return res.status(401).json({ status: "error", message: "Invalid credentials" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
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
      const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
      if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM) {
        // Implement node mailer send if needed
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

module.exports = {
  register,
  login,
  sendOTP,
  verifyOTP,
  logAudit
};
