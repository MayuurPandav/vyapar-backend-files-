const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { verifyGSTNumber } = require('../services/gstService');

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

    const jwtToken = jwt.sign(
      { id: newUser._id, username: newUser.username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      status: "success",
      token: jwtToken,
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

  // Normalize inputs: trim username and perform case-insensitive match
  const cleanUsername = (username || '').toString().trim().toLowerCase();
  const cleanPassword = (password || '').toString();

  try {
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 1. Try standard Admin/Super Admin in "users"
    const user = await db.collection('users').findOne({ username: { $regex: `^${escapeRegex(cleanUsername)}$`, $options: 'i' } });
    let isUserMatch = false;
    if (user) {
      if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
        isUserMatch = await bcrypt.compare(cleanPassword, user.password);
      } else {
        isUserMatch = (user.password === cleanPassword);
      }
    }
    if (user && isUserMatch) {
      if (user.status === 'blocked') {
        await logAudit(username, "LOGIN_ATTEMPT_BLOCKED", "User tried to login while blocked");
        return res.status(403).json({ status: "error", message: "Your account has been blocked by the administrator." });
      }

      if (user.accountStatus === 'locked') {
        await logAudit(username, "LOGIN_ATTEMPT_LOCKED", "User tried to login while account is locked due to expiry");
        return res.status(403).json({ status: "error", message: "Your account is locked due to an expired subscription. Please contact support to renew." });
      }

      if (user.accountStatus === 'archived') {
        await logAudit(username, "LOGIN_ATTEMPT_ARCHIVED", "User tried to login to an archived account");
        return res.status(403).json({ status: "error", message: "Your account has been archived due to long-term inactivity. Please contact support." });
      }

      if ((user.role === 'superadmin' || user.role === 'super_admin') && user.sa_access_expiry) {
        if (new Date() > new Date(user.sa_access_expiry)) {
          await logAudit(username, "LOGIN_ATTEMPT_EXPIRED", "Super Admin tried to login after access expiry date");
          return res.status(403).json({ status: "error", message: "Your access has expired. Please contact the primary owner." });
        }
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

      // Record login history for User Management module
      try {
        const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        await db.collection('login_history').insertOne({
          username: user.username,
          ip,
          userAgent,
          loginAt: new Date()
        });
      } catch (lhErr) {
        console.error('Login history log error:', lhErr.message);
      }

      const jwtToken = jwt.sign(
        { id: user._id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      return res.json({
        status: "success",
        token: jwtToken,
        user: {
          _id: user._id,
          username: user.username,
          role: user.role,
          phone: user.phone,
          status: user.status,
          accountStatus: user.accountStatus || 'active'
        },
        profileComplete,
        subscription,
        onboardingRequired
      });
    }

    // 2. Try Accountant in "accountantusers"
    const accountantUser = await db.collection('accountantusers').findOne({
      $or: [
        { email: cleanUsername },
        { employeeId: { $regex: `^${escapeRegex(cleanUsername)}$`, $options: 'i' } }
      ]
    });
    if (accountantUser) {
      const isMatch = await bcrypt.compare(cleanPassword, accountantUser.password);
      if (isMatch) {
        const jwtToken = jwt.sign({ id: accountantUser._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
        
        // Auto-assign employee ID if missing
        if (!accountantUser.employeeId) {
          const suffix = accountantUser._id.toString().substring(18).toUpperCase() || Math.floor(1000 + Math.random() * 9000);
          await db.collection('accountantusers').updateOne(
            { _id: accountantUser._id },
            { $set: { employeeId: `EMP-2026-${suffix}` } }
          );
          accountantUser.employeeId = `EMP-2026-${suffix}`;
        }

        return res.json({
          status: "success",
          token: jwtToken,
          user: {
            _id: accountantUser._id,
            username: accountantUser.email,
            role: 'accountant',
            phone: accountantUser.phone || '',
            status: 'active',
            employeeId: accountantUser.employeeId,
            name: accountantUser.name
          },
          profileComplete: true,
          onboardingRequired: false
        });
      }
    }

    // 3. Try Staff/Cashier in "staffusers"
    const staffUser = await db.collection('staffusers').findOne({ email: cleanUsername });
    if (staffUser) {
      const isMatch = await bcrypt.compare(cleanPassword, staffUser.password);
      
      // Log login history to loginhistories collection
      try {
        const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        await db.collection('loginhistories').insertOne({
          user: staffUser._id,
          email: staffUser.email,
          ipAddress: ip,
          userAgent: userAgent,
          successful: isMatch,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      } catch (lhErr) {
        console.error('Staff login history log error:', lhErr.message);
      }

      if (isMatch) {
        const jwtToken = jwt.sign({ id: staffUser._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        return res.json({
          status: "success",
          token: jwtToken,
          user: {
            _id: staffUser._id,
            username: staffUser.email,
            role: staffUser.role, // 'staff' or 'cashier'
            phone: staffUser.phone || '',
            status: 'active',
            name: staffUser.name,
            permissions: staffUser.permissions
          },
          profileComplete: true,
          onboardingRequired: false
        });
      }
    }

    console.log('[DEBUG] Auth Login Attempt for Driver:', { cleanUsername, cleanPassword });
    const driver = await db.collection('driver_profiles').findOne({
      $or: [
        { employeeId: { $regex: `^${escapeRegex(cleanUsername)}$`, $options: 'i' } },
        { email: cleanUsername }
      ]
    });
    console.log('[DEBUG] Driver Document Found:', driver);
    if (driver) {
      const isMatch = await bcrypt.compare(cleanPassword, driver.passwordHash);
      console.log('[DEBUG] Driver Password Match Result:', isMatch);
      if (isMatch) {
        const jwtToken = jwt.sign(
          { id: driver._id.toString(), role: 'delivery_boy' },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        );
        return res.json({
          status: "success",
          token: jwtToken,
          user: {
            _id: driver._id,
            username: driver.employeeId,
            role: 'delivery_boy',
            phone: driver.phone || '',
            status: 'active',
            fullName: driver.fullName
          },
          profileComplete: true,
          onboardingRequired: false
        });
      }
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
    await db.collection('sa_payments').insertOne({ username, amount: price, plan_name: planName, date: new Date().toISOString().substring(0,10), method: req.body.paymentMethod || 'Onboarding', type: 'signup' });

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
      const { SENDGRID_API_KEY, SENDGRID_FROM, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
      if (SENDGRID_API_KEY && SENDGRID_FROM) {
        // Send via SendGrid Web API
        try {
          const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
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
          if (!resp.ok) {
            const errTxt = await resp.text();
            throw new Error(`SendGrid API returned status ${resp.status}: ${errTxt}`);
          }
          sent = true;
          console.log(`[OTP EMAIL SUCCESS] SendGrid sent to ${cleanValue}`);
        } catch (err) {
          console.error(`[OTP EMAIL ERROR] SendGrid failed for ${cleanValue}:`, err.message);
          sendError = err.message;
        }
      }
      if (!sent && SMTP_HOST && SMTP_USER && SMTP_PASS) {
        try {
          const nodemailer = require('nodemailer');
          const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: parseInt(SMTP_PORT || '587'),
            secure: SMTP_SECURE === 'true',
            auth: { user: SMTP_USER, pass: SMTP_PASS }
          });
          await transporter.sendMail({
            from: SMTP_FROM || SMTP_USER,
            to: cleanValue,
            subject: 'Your Vyapar verification code',
            text: `Your verification code is: ${code}`
          });
          sent = true;
          console.log(`[OTP EMAIL SUCCESS] SMTP sent to ${cleanValue}`);
          sendError = null;
        } catch (err) {
          console.error(`[OTP EMAIL ERROR] SMTP failed for ${cleanValue}:`, err.message);
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
          let formattedPhone = cleanValue;
          if (!formattedPhone.startsWith('+')) {
            if (formattedPhone.startsWith('91') && formattedPhone.length === 12) {
              formattedPhone = `+${formattedPhone}`;
            } else if (formattedPhone.length === 10) {
              formattedPhone = `+91${formattedPhone}`;
            } else {
              formattedPhone = `+${formattedPhone}`;
            }
          }
          const body = new URLSearchParams({ To: formattedPhone, From: TWILIO_FROM, Body: `Your Vyapar verification code is: ${code}` });
          const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
          });
          if (!resp.ok) {
            const errTxt = await resp.text();
            throw new Error(`Twilio API returned status ${resp.status}: ${errTxt}`);
          }
          sent = true;
          console.log(`[OTP SMS SUCCESS] Twilio sent to ${formattedPhone}`);
        } catch (err) {
          console.error(`[OTP SMS ERROR] Twilio failed for ${cleanValue}:`, err.message);
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

  // Always log the OTP to the server console for easy testing/debugging and local fallback
  console.log(`[OTP] ${username} ${field} -> ${cleanValue} : ${code}`);

  const devReturn = (process.env.DEV_RETURN_OTP || 'false').toLowerCase() === 'true';
  const responsePayload = { status: 'success', message: `OTP dispatched to ${field}.` };

  if (devReturn) {
    responsePayload.otp = process.env.DEV_RETURN_OTP === 'true' ? code : process.env.DEV_RETURN_OTP;
  } else {
    if (!sent) {
      responsePayload.note = 'No delivery provider configured; test OTP provided.';
      responsePayload.otp = code;
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

  try {
    const result = await verifyGSTNumber(clean);
    return res.json({
      status: 'success',
      authoritative: result.authoritative,
      data: result.data
    });
  } catch (err) {
    const isExternalError = err.message.includes('failed') || err.message.includes('authentication') || err.message.includes('lookup');
    return res.status(isExternalError ? 502 : 400).json({ status: 'error', message: err.message });
  }
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
