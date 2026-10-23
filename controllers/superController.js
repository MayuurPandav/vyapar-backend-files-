const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const { logAudit } = require('./authController');
const bcrypt = require('bcryptjs');

const formatDate = (val) => {
  if (!val) return '';
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toISOString().substring(0, 10);
  } catch (e) {
    return String(val);
  }
};

// Super Admin Stats Dashboard
async function getSuperStats(req, res) {
  try {
    const db = getDB();
    const payments = await db.collection('sa_payments').find({}).toArray();
    const revenue = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    const totalUsers = await db.collection('users').countDocuments({ role: { $ne: 'super_admin' } });
    const activeUsers = await db.collection('users').countDocuments({ role: { $ne: 'super_admin' }, status: 'active' });
    const totalPlans = await db.collection('sa_plans').countDocuments({});

    // Calculate MRR, ARR, Plan Distributions, and Churn Rate
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyPayments = payments.filter(p => {
      if (!p.date) return false;
      const pd = new Date(p.date);
      return pd.getMonth() === currentMonth && pd.getFullYear() === currentYear;
    });

    const mrr = monthlyPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) || (revenue > 0 ? Math.round(revenue / 12) : 0);
    const arr = mrr * 12;

    const settings = await db.collection('settings').find({}).toArray();
    const planDistribution = {
      Starter: 0,
      Growth: 0,
      Enterprise: 0,
      Custom: 0
    };
    let cancelledCount = 0;

    settings.forEach(s => {
      const planName = s.selectedPlan || s.plan || 'Starter';
      if (planDistribution[planName] !== undefined) {
        planDistribution[planName]++;
      } else {
        planDistribution.Custom++;
      }
      if (s.subscriptionCancelled) {
        cancelledCount++;
      }
    });

    const churnRate = totalUsers > 0 ? parseFloat(((cancelledCount / totalUsers) * 100).toFixed(1)) : 0;

    return res.json({
      revenue,
      mrr,
      arr,
      plan_distribution: planDistribution,
      churn_rate: churnRate,
      total_users: totalUsers,
      active_users: activeUsers,
      total_plans: totalPlans,
      trend: []
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Impersonate Merchant user for support
async function superImpersonateMerchant(req, res) {
  try {
    const { username } = req.params;
    const db = getDB();
    const user = await db.collection('users').findOne({ username });
    if (!user) {
      return res.status(404).json({ status: "error", message: "Merchant user not found" });
    }

    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'supersecretjwtsecretkey12345!';
    const token = jwt.sign(
      { id: String(user._id), username: user.username, role: user.role || 'admin', isImpersonated: true },
      secret,
      { expiresIn: '2h' }
    );

    try {
      await logAudit(req.user?.username || 'superadmin', 'IMPERSONATE_MERCHANT', `Impersonated merchant: ${username}`);
    } catch (e) {}

    return res.json({
      status: "success",
      token,
      user: {
        username: user.username,
        role: user.role || 'admin'
      }
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Get all users (except super_admin) with business settings
async function superGetUsers(req, res) {
  try {
    const db = getDB();
    const users = await db.collection('users').find({ role: { $ne: 'super_admin' } }, { projection: { password: 0 } }).toArray();
    const enrichedUsers = [];

    for (const u of users) {
      const settings = await db.collection('settings').findOne({ username: u.username }) || {};
      enrichedUsers.push({
        ...u,
        ...settings,
        _id: String(u._id)
      });
    }
    return res.json(enrichedUsers);
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Verify field (GST/phone/email)
async function superVerify(req, res) {
  const { username, field, status } = req.body;
  const colMap = { 'gst': 'isGstVerified', 'phone': 'isPhoneVerified', 'email': 'isEmailVerified' };

  if (!colMap[field]) {
    return res.status(400).json({ status: "error", message: "Invalid field" });
  }

  try {
    const db = getDB();
    await db.collection('settings').updateOne(
      { username },
      { $set: { [colMap[field]]: parseInt(status) } }
    );
    return res.json({ status: "success" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// --- Shop Management (Super Admin) ---
// Get shops (alias to users with business fields)
async function superGetShops(req, res) {
  try {
    const db = getDB();
    const users = await db.collection('users').find({ role: { $ne: 'super_admin' } }, { projection: { password: 0 } }).toArray();
    const out = [];
    for (const u of users) {
      const settings = await db.collection('settings').findOne({ username: u.username }) || {};
      out.push({
        ...u,
        _id: String(u._id),
        // normalize verification flags to 0/1
        isEmailVerified: parseInt(settings.isEmailVerified || 0),
        isPhoneVerified: parseInt(settings.isPhoneVerified || 0),
        isGstVerified: parseInt(settings.isGstVerified || 0),
        settings
      });
    }
    return res.json(out);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Create shop (manual)
async function superCreateShop(req, res) {
  const { username, password, bizName, email, phone } = req.body;
  if (!username || !password) return res.status(400).json({ status: 'error', message: 'username and password required' });
  try {
    const db = getDB();
    const existing = await db.collection('users').findOne({ username });
    if (existing) return res.status(400).json({ status: 'error', message: 'username exists' });
    const hashed = bcrypt.hashSync(password, 10);
    const doc = { username, password: hashed, role: 'admin', status: 'active', bizName: bizName || '', email: email || '', phone: phone || '' };
    await db.collection('users').insertOne(doc);
    await db.collection('settings').updateOne({ username }, { $set: { username, bizName: bizName || '', email: email || '', phone: phone || '' } }, { upsert: true });
    await logAudit('SYSTEM', 'SA_CREATE_SHOP', `Created shop ${username}`);
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Edit shop details
async function superEditShop(req, res) {
  const data = req.body;
  if (!data || !data.username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    const username = data.username;
    const userUpdates = {};
    if (data.bizName) userUpdates.bizName = data.bizName;
    if (data.email) userUpdates.email = data.email;
    if (data.phone) userUpdates.phone = data.phone;
    if (Object.keys(userUpdates).length) await db.collection('users').updateOne({ username }, { $set: userUpdates });
    const settings = { ...(data.settings || {}) };
    if (Object.keys(settings).length) await db.collection('settings').updateOne({ username }, { $set: settings }, { upsert: true });
    await logAudit('SYSTEM', 'SA_EDIT_SHOP', `Edited shop ${username}`);
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Update subscription expiry
async function superSubscription(req, res) {
  const { username, expiry } = req.body;
  try {
    const db = getDB();
    await db.collection('settings').updateOne(
      { username },
      { $set: { subscriptionExpiry: expiry } }
    );
    return res.json({ status: "success" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Send email OTP for shop email verification
async function sendShopOtp(req, res) {
  const { username } = req.body;
  if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    const settings = await db.collection('settings').findOne({ username }) || {};
    const email = settings.email || '';
    if (!email) return res.status(400).json({ status: 'error', message: 'No email on record' });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await db.collection('sa_otps').updateOne({ username, type: 'email' }, { $set: { username, type: 'email', code, expires } }, { upsert: true });

    // Try sending email if SMTP env configured, otherwise return code in dev mode
    let sent = false;
    try {
      const nodemailer = require('nodemailer');
      const host = process.env.SMTP_HOST;
      if (host) {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
        });
        const info = await transporter.sendMail({
          from: process.env.SMTP_FROM || 'no-reply@vyapar.com',
          to: email,
          subject: 'Your Vyapar verification code',
          text: `Your verification code is ${code}. It expires in 10 minutes.`
        });
        sent = !!info;
      }
    } catch (e) {
      // ignore send errors, we'll still return code in non-prod
      console.error('OTP send error', e.message || e);
    }

    const resp = { status: 'success', sent };
    if (process.env.NODE_ENV !== 'production' || !sent) resp.code = code;
    return res.json(resp);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Verify OTP and mark email verified
async function verifyShopOtp(req, res) {
  const { username, code } = req.body;
  if (!username || !code) return res.status(400).json({ status: 'error', message: 'username and code required' });
  try {
    const db = getDB();
    const row = await db.collection('sa_otps').findOne({ username, type: 'email' });
    if (!row) return res.status(400).json({ status: 'error', message: 'No OTP found' });
    if (row.expires && new Date(row.expires) < new Date()) return res.status(400).json({ status: 'error', message: 'OTP expired' });
    if (String(row.code) !== String(code).trim()) return res.status(400).json({ status: 'error', message: 'Invalid code' });

    await db.collection('settings').updateOne({ username }, { $set: { isEmailVerified: 1 } }, { upsert: true });
    await db.collection('sa_otps').deleteOne({ username, type: 'email' });
    await logAudit('SYSTEM', 'SA_VERIFY_EMAIL', `Verified email for ${username}`);
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Block / Unblock User
async function superStatus(req, res) {
  const { username, status } = req.body;
  try {
    const db = getDB();
    await db.collection('users').updateOne(
      { username },
      { $set: { status } }
    );
    return res.json({ status: "success" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Super Admin Subscription Info
async function superSubscriptionInfo(req, res) {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ status: "error", message: "Username required" });
  }

  try {
    const db = getDB();
    const payments = await db.collection('sa_payments').find({ username }).toArray();
    const settings = await db.collection('settings').findOne({ username }) || {};

    const dates = payments.map(p => p.date).filter(Boolean);
    const lastPayment = dates.length ? dates.sort().reverse()[0] : null;

    const expiry = settings.subscriptionExpiry;
    let active = false;
    if (expiry) {
      try {
        active = new Date(expiry) >= new Date(new Date().setHours(0, 0, 0, 0));
      } catch (e) {
        active = false;
      }
    }

    return res.json({
      status: "success",
      subscription_count: payments.length,
      last_payment: lastPayment,
      subscriptionExpiry: expiry,
      planName: settings.planName,
      planCycle: settings.planCycle,
      active
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Set Plan
async function superPlan(req, res) {
  const { username, planName, planCycle } = req.body;
  try {
    const db = getDB();
    await db.collection('settings').updateOne(
      { username },
      { $set: { planName, planCycle } }
    );

    const plan = await db.collection('sa_plans').findOne({ name: planName });
    const price = plan ? (parseFloat(plan.price) || 0) : 0;

    await db.collection('sa_payments').insertOne({
      username,
      amount: price,
      plan_name: planName,
      date: new Date().toISOString().substring(0, 10),
      method: 'Auto-System'
    });

    return res.json({ status: "success" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// SaaS Plans CRUD
async function superPlans(req, res) {
  const db = getDB();
  const method = req.method;

  try {
    if (method === 'GET') {
      const plans = await db.collection('sa_plans').find({}).toArray();
      const cleanPlans = plans.map(p => ({
        ...p,
        _id: String(p._id)
      }));
      return res.json(cleanPlans);
    }

    if (method === 'POST') {
      const {
        _id, name, description, price, monthlyPrice, yearlyPrice, yearlyDiscountPercent,
        cycle, features, badgeText, status, isFeatured, isRecommended, displayOrder, modules, limits
      } = req.body;

      const parsedPrice = parseFloat(price) || parseFloat(monthlyPrice) || 0;
      const doc = {
        name,
        description: description || '',
        price: parsedPrice,
        monthlyPrice: parseFloat(monthlyPrice) || parsedPrice,
        yearlyPrice: parseFloat(yearlyPrice) || 0,
        yearlyDiscountPercent: parseFloat(yearlyDiscountPercent) || 0,
        cycle: cycle || 'MONTHLY',
        features: features || '',
        badgeText: badgeText || '',
        status: status || 'active',
        isFeatured: !!isFeatured,
        isRecommended: !!isRecommended,
        displayOrder: parseInt(displayOrder) || 0,
        modules: modules || {},
        limits: limits || {}
      };

      if (_id) {
        await db.collection('sa_plans').updateOne(
          { _id: new ObjectId(_id) },
          { $set: doc }
        );
      } else {
        await db.collection('sa_plans').insertOne(doc);
      }
      return res.json({ status: "success" });
    }

    if (method === 'DELETE') {
      const planId = req.query.id;
      if (!planId) return res.status(400).json({ status: "error", message: "Plan ID required" });
      await db.collection('sa_plans').deleteOne({ _id: new ObjectId(planId) });
      return res.json({ status: "success" });
    }
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Perform action on a plan (Activate, Deactivate, Archive, Restore, Duplicate)
async function superPlanAction(req, res) {
  const { id } = req.params;
  const { action } = req.body;
  if (!id || !action) return res.status(400).json({ status: 'error', message: 'id and action required' });

  try {
    const db = getDB();
    const plan = await db.collection('sa_plans').findOne({ _id: new ObjectId(id) });
    if (!plan) return res.status(404).json({ status: 'error', message: 'Plan not found' });

    if (action === 'activate') {
      await db.collection('sa_plans').updateOne({ _id: new ObjectId(id) }, { $set: { status: 'active' } });
    } else if (action === 'deactivate') {
      await db.collection('sa_plans').updateOne({ _id: new ObjectId(id) }, { $set: { status: 'inactive' } });
    } else if (action === 'archive') {
      await db.collection('sa_plans').updateOne({ _id: new ObjectId(id) }, { $set: { status: 'archived' } });
    } else if (action === 'restore') {
      await db.collection('sa_plans').updateOne({ _id: new ObjectId(id) }, { $set: { status: 'inactive' } });
    } else if (action === 'duplicate') {
      const newPlan = { ...plan };
      delete newPlan._id;
      newPlan.name = `${newPlan.name} (Copy)`;
      newPlan.status = 'inactive';
      await db.collection('sa_plans').insertOne(newPlan);
    } else {
      return res.status(400).json({ status: 'error', message: 'Invalid action' });
    }

    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Seed the default 5 plans
async function seedDefaultPlans(req, res) {
  try {
    const db = getDB();
    const defaultModules = {
      'Billing & Invoicing': 'enabled',
      'Purchase Management': 'enabled',
      'Inventory Management': 'enabled',
      'Party Management': 'enabled',
      'Accounting / Khata': 'enabled',
      'GST & Tax': 'enabled',
      'Expense Management': 'enabled',
      'Payment Management': 'enabled',
      'Offers & Discounts': 'enabled',
      'Delivery Management': 'enabled',
      'Barcode / QR': 'enabled',
      'Reports & Analytics': 'enabled',
      'Staff Management': 'enabled',
      'Data Management': 'enabled',
      'Notifications & Alerts': 'enabled'
    };

    const starterModules = { ...defaultModules, 'Staff Management': 'disabled', 'Delivery Management': 'disabled' };
    const freeModules = { ...starterModules, 'Reports & Analytics': 'readonly', 'GST & Tax': 'disabled' };

    const plans = [
      { name: 'Free Trial', description: '14-day full access', price: 0, monthlyPrice: 0, yearlyPrice: 0, yearlyDiscountPercent: 0, cycle: 'MONTHLY', badgeText: 'Trial', status: 'active', isFeatured: false, isRecommended: false, displayOrder: 1, modules: freeModules },
      { name: 'Starter', description: 'For small shops', price: 499, monthlyPrice: 499, yearlyPrice: 4990, yearlyDiscountPercent: 16, cycle: 'MONTHLY', badgeText: '', status: 'active', isFeatured: false, isRecommended: false, displayOrder: 2, modules: starterModules },
      { name: 'Business', description: 'Standard features', price: 999, monthlyPrice: 999, yearlyPrice: 9990, yearlyDiscountPercent: 16, cycle: 'MONTHLY', badgeText: 'Most Popular', status: 'active', isFeatured: true, isRecommended: true, displayOrder: 3, modules: defaultModules },
      { name: 'Premium', description: 'Advanced tools', price: 1999, monthlyPrice: 1999, yearlyPrice: 19990, yearlyDiscountPercent: 16, cycle: 'MONTHLY', badgeText: '', status: 'active', isFeatured: false, isRecommended: false, displayOrder: 4, modules: defaultModules },
      { name: 'Enterprise', description: 'Custom scale', price: 4999, monthlyPrice: 4999, yearlyPrice: 49990, yearlyDiscountPercent: 16, cycle: 'MONTHLY', badgeText: 'Enterprise', status: 'active', isFeatured: false, isRecommended: false, displayOrder: 5, modules: defaultModules }
    ];

    for (const plan of plans) {
      // Upsert by name so we don't duplicate
      await db.collection('sa_plans').updateOne({ name: plan.name }, { $set: plan }, { upsert: true });
    }

    return res.json({ status: 'success', message: 'Default plans seeded successfully' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Super Admin config
async function superConfig(req, res) {
  const db = getDB();
  const method = req.method;

  try {
    if (method === 'GET') {
      const configDocs = await db.collection('sa_config').find({}).toArray();
      const config = {};
      configDocs.forEach(c => {
        config[c.config_key] = c.config_value;
      });
      return res.json(config);
    }

    if (method === 'POST') {
      const data = req.body;
      for (const [key, value] of Object.entries(data)) {
        await db.collection('sa_config').updateOne(
          { config_key: key },
          { $set: { config_key: key, config_value: String(value) } },
          { upsert: true }
        );
      }
      await logAudit("SYSTEM", "CONFIG_UPDATE", JSON.stringify(data));
      return res.json({ status: "success" });
    }
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Fetch all system payments
async function superPayments(req, res) {
  try {
    const db = getDB();
    const rawPayments = await db.collection('sa_payments').find({}).sort({ date: -1 }).toArray();
    const payments = [];

    for (const p of rawPayments) {
      const plan = await db.collection('sa_plans').findOne({ name: p.plan_name }) || {};
      payments.push({
        ...p,
        _id: String(p._id),
        features: plan.features,
        cycle: plan.cycle
      });
    }
    return res.json(payments);
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Fetch payments for a user
async function getUserPayments(req, res) {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ status: "error", message: "Username required" });
  }

  try {
    const db = getDB();
    const rawPayments = await db.collection('sa_payments').find({ username }).sort({ date: -1 }).toArray();
    const payments = [];

    for (const p of rawPayments) {
      const plan = await db.collection('sa_plans').findOne({ name: p.plan_name }) || {};
      payments.push({
        ...p,
        _id: String(p._id),
        features: plan.features,
        cycle: plan.cycle
      });
    }
    return res.json(payments);
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Audit Logs
async function superAudit(req, res) {
  const { username } = req.query;
  const db = getDB();

  try {
    let logs;
    if (username) {
      logs = await db.collection('sa_audit').find({ username }).sort({ timestamp: -1 }).limit(50).toArray();
    } else {
      logs = await db.collection('sa_audit').find({}).sort({ timestamp: -1 }).limit(100).toArray();
    }
    const cleanLogs = logs.map(l => ({
      ...l,
      _id: String(l._id),
      timestamp: l.timestamp.toISOString()
    }));
    return res.json(cleanLogs);
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Renew subscription (record payment and extend expiry)
async function renewSubscription(req, res) {
  const { username, amount, days = 30, method = 'Manual', note = '' } = req.body;
  if (!username || !amount) return res.status(400).json({ status: 'error', message: 'username and amount required' });
  try {
    const db = getDB();
    const dateStr = new Date().toISOString().substring(0, 10);
    await db.collection('sa_payments').insertOne({ username, amount: parseFloat(amount) || 0, plan_name: null, date: dateStr, method, note, type: 'renewal' });

    const settings = await db.collection('settings').findOne({ username }) || {};
    let currentExpiry = settings.subscriptionExpiry ? new Date(settings.subscriptionExpiry) : null;
    const today = new Date();
    if (!currentExpiry || currentExpiry < today) currentExpiry = today;
    const newExpiry = new Date(currentExpiry);
    newExpiry.setDate(newExpiry.getDate() + Number(days));
    await db.collection('settings').updateOne({ username }, { $set: { subscriptionExpiry: newExpiry.toISOString().substring(0, 10), subscriptionCancelled: false } }, { upsert: true });

    return res.json({ status: 'success', subscriptionExpiry: newExpiry.toISOString().substring(0, 10) });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Return a simple HTML invoice for a payment (for download/print)
async function getPaymentInvoice(req, res) {
  const id = req.params.id;
  if (!id) return res.status(400).send('Payment ID required');
  try {
    const db = getDB();
    const payment = await db.collection('sa_payments').findOne({ _id: new ObjectId(id) });
    if (!payment) return res.status(404).send('Payment not found');
    const plan = payment.plan_name ? (await db.collection('sa_plans').findOne({ name: payment.plan_name })) : {};
    const html = `
        <html><head><meta charset="utf-8"><title>Invoice ${payment._id}</title></head><body>
        <h2>Vyapar - Subscription Receipt</h2>
        <p><strong>Username:</strong> ${payment.username || ''}</p>
        <p><strong>Date:</strong> ${payment.date || ''}</p>
        <p><strong>Amount:</strong> ₹${payment.amount || 0}</p>
        <p><strong>Plan:</strong> ${payment.plan_name || 'N/A'}</p>
        <p><strong>Method:</strong> ${payment.method || ''}</p>
        <p><strong>Note:</strong> ${payment.note || ''}</p>
        <hr/>
        <p>Thank you for your payment.</p>
        </body></html>
      `;
    res.set('Content-Type', 'text/html');
    return res.send(html);
  } catch (err) {
    return res.status(500).send('Error: ' + err.message);
  }
}

// Cancel subscription for a user
async function cancelSubscription(req, res) {
  const { username } = req.body;
  if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    await db.collection('settings').updateOne({ username }, { $set: { subscriptionExpiry: null, subscriptionCancelled: true } }, { upsert: true });
    await db.collection('sa_payments').insertOne({ username, amount: 0, date: new Date().toISOString().substring(0, 10), method: 'system', note: 'cancelled', type: 'cancel' });
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Toggle auto-renew for a user
async function toggleAutoRenew(req, res) {
  const { username, autoRenew } = req.body;
  if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    await db.collection('settings').updateOne({ username }, { $set: { autoRenew: !!autoRenew } }, { upsert: true });
    return res.json({ status: 'success', autoRenew: !!autoRenew });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Apply coupon code (basic validation)
async function applyCoupon(req, res) {
  const { code, username, planName } = req.body;
  if (!code) return res.status(400).json({ status: 'error', message: 'code required' });
  try {
    const db = getDB();
    const coupon = await db.collection('sa_coupons').findOne({ code: code.trim().toUpperCase() });
    if (!coupon) return res.status(404).json({ status: 'error', message: 'Invalid coupon' });
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return res.status(400).json({ status: 'error', message: 'Coupon expired' });
    // simple usage limit
    const usedCount = await db.collection('sa_payments').countDocuments({ coupon: coupon.code });
    if (coupon.usageLimit && usedCount >= coupon.usageLimit) return res.status(400).json({ status: 'error', message: 'Coupon usage limit reached' });

    // compute discount
    const plan = planName ? await db.collection('sa_plans').findOne({ name: planName }) : null;
    const basePrice = plan ? (parseFloat(plan.price) || 0) : (parseFloat(coupon.basePrice) || 0);
    let discount = 0;
    if (coupon.discountPercent) discount = basePrice * (parseFloat(coupon.discountPercent) / 100);
    if (coupon.discountFlat) discount = Math.max(discount, parseFloat(coupon.discountFlat));

    return res.json({ status: 'success', coupon: coupon.code, discount: Number(discount.toFixed(2)), basePrice });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Scan and return expiry reminders for 7/3/1 day windows
async function sendExpiryReminders(req, res) {
  try {
    const db = getDB();
    const users = await db.collection('settings').find({ subscriptionExpiry: { $exists: true, $ne: null } }).toArray();
    const today = new Date();
    const reminders = [];
    for (const s of users) {
      const expiry = new Date(s.subscriptionExpiry);
      const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
      if ([7, 3, 1].includes(diff)) {
        reminders.push({ username: s.username, daysLeft: diff, expiry: s.subscriptionExpiry });
      }
    }
    return res.json({ status: 'success', reminders });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Plan Limits Handlers
async function getPlanLimits(req, res) {
  const { planId } = req.params;
  if (!planId) return res.status(400).json({ status: 'error', message: 'planId required' });
  try {
    const db = getDB();
    const limits = await db.collection('sa_plan_limits').findOne({ planId });
    return res.json(limits || {});
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function createOrUpdatePlanLimits(req, res) {
  const { planId, limits } = req.body;
  if (!planId) return res.status(400).json({ status: 'error', message: 'planId required' });
  try {
    const db = getDB();
    await db.collection('sa_plan_limits').updateOne(
      { planId },
      { $set: { planId, limits: limits || {} } },
      { upsert: true }
    );
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getPlanLimitDetails(req, res) {
  const { planId } = req.params;
  if (!planId) return res.status(400).json({ status: 'error', message: 'planId required' });
  try {
    const db = getDB();
    const limits = await db.collection('sa_plan_limits').findOne({ planId });
    const plan = await db.collection('sa_plans').findOne({ _id: new ObjectId(planId) });
    return res.json({ plan, limits: limits ? limits.limits : {} });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Fetch Super Admin Notifications
async function superGetNotifications(req, res) {
  try {
    const db = getDB();
    const notifications = await db.collection('sa_notifications')
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return res.json(notifications);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Mark Notification as Read
async function superMarkNotificationRead(req, res) {
  const { id } = req.params;
  try {
    const db = getDB();
    await db.collection('sa_notifications').updateOne(
      { _id: new ObjectId(id) },
      { $set: { read: true } }
    );
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// --- User Management (Shop Owners) ---

// Delete a shop owner (soft delete by default, hard delete if ?hard=true)
async function superDeleteUser(req, res) {
  const { username } = req.params;
  const hard = req.query.hard === 'true';
  if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    const user = await db.collection('users').findOne({ username });
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
    if (user.role === 'super_admin') return res.status(403).json({ status: 'error', message: 'Cannot delete super admin' });

    if (hard) {
      await db.collection('users').deleteOne({ username });
      await db.collection('settings').deleteOne({ username });
      await db.collection('login_history').deleteMany({ username });
      await db.collection('sa_payments').deleteMany({ username });
      await logAudit('SYSTEM', 'SA_HARD_DELETE_USER', `Hard-deleted user ${username}`);
    } else {
      await db.collection('users').updateOne({ username }, { $set: { status: 'deleted', deletedAt: new Date() } });
      await logAudit('SYSTEM', 'SA_SOFT_DELETE_USER', `Soft-deleted user ${username}`);
    }
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Force reset password for a shop owner
async function superForceResetPassword(req, res) {
  const { username, newPassword } = req.body;
  if (!username || !newPassword) return res.status(400).json({ status: 'error', message: 'username and newPassword required' });
  try {
    const db = getDB();
    const user = await db.collection('users').findOne({ username });
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

    // Store plain or hashed depending on how existing passwords work
    // Existing register uses plain text, existing createShop uses bcrypt — keep bcrypt for security
    const hashed = bcrypt.hashSync(newPassword, 10);
    await db.collection('users').updateOne({ username }, { $set: { password: hashed } });
    await logAudit('SYSTEM', 'SA_FORCE_RESET_PASSWORD', `Password reset for ${username}`);
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Merge duplicate accounts: move data from sourceUsername to targetUsername, then soft-delete source
async function superMergeAccounts(req, res) {
  const { sourceUsername, targetUsername } = req.body;
  if (!sourceUsername || !targetUsername) return res.status(400).json({ status: 'error', message: 'sourceUsername and targetUsername required' });
  if (sourceUsername === targetUsername) return res.status(400).json({ status: 'error', message: 'Cannot merge same account' });
  try {
    const db = getDB();
    const source = await db.collection('users').findOne({ username: sourceUsername });
    const target = await db.collection('users').findOne({ username: targetUsername });
    if (!source) return res.status(404).json({ status: 'error', message: 'Source user not found' });
    if (!target) return res.status(404).json({ status: 'error', message: 'Target user not found' });

    // Reassign payments, login_history, audit logs to target
    const collectionsToMigrate = ['sa_payments', 'login_history', 'sa_audit'];
    for (const col of collectionsToMigrate) {
      await db.collection(col).updateMany({ username: sourceUsername }, { $set: { username: targetUsername } });
    }

    // Soft-delete the source account
    await db.collection('users').updateOne({ username: sourceUsername }, { $set: { status: 'merged', mergedInto: targetUsername, mergedAt: new Date() } });
    await logAudit('SYSTEM', 'SA_MERGE_ACCOUNTS', `Merged ${sourceUsername} into ${targetUsername}`);
    return res.json({ status: 'success', message: `${sourceUsername} merged into ${targetUsername}` });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Get login history for a specific user
async function superGetLoginHistory(req, res) {
  const { username } = req.params;
  if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    const history = await db.collection('login_history')
      .find({ username })
      .sort({ loginAt: -1 })
      .limit(50)
      .toArray();
    const cleaned = history.map(h => ({ ...h, _id: String(h._id), loginAt: h.loginAt ? h.loginAt.toISOString() : null }));
    return res.json(cleaned);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// --- Global Staff Members (Super Admin) ---
async function superGetGlobalStaff(req, res) {
  try {
    const db = getDB();
    // Get all staff across all shops
    const staffList = await db.collection('staff').find({}).toArray();
    
    // Map with shop owners to get the bizName
    const users = await db.collection('users').find({ role: 'admin' }).project({ username: 1, bizName: 1 }).toArray();
    const shopMap = {};
    users.forEach(u => {
      shopMap[u.username] = u.bizName || u.username;
    });

    const enrichedStaff = staffList.map(s => ({
      ...s,
      _id: String(s._id),
      shopName: shopMap[s.username] || s.username
    }));

    return res.json({ status: 'success', data: enrichedStaff });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function superGetGlobalStaffActivity(req, res) {
  const { staffId } = req.params;
  try {
    const db = getDB();
    const logs = await db.collection('staff_activity').find({ staffId }).sort({ timestamp: -1 }).limit(100).toArray();
    return res.json({ status: 'success', data: logs });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function superToggleStaffActive(req, res) {
  const { staffId } = req.params;
  const { active } = req.body;
  try {
    const db = getDB();
    await db.collection('staff').updateOne(
      { _id: new ObjectId(staffId) },
      { $set: { active: !!active } }
    );
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function superGetGlobalStaffLogins(req, res) {
  const { staffId } = req.params;
  try {
    const db = getDB();
    // Assuming staff logins might be recorded in login_history with a staffId field in the future
    const logins = await db.collection('login_history').find({ staffId }).sort({ timestamp: -1 }).limit(50).toArray();
    return res.json({ status: 'success', data: logins });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}


// --- Security Settings (Super Admin) ---
async function superGetSecuritySettings(req, res) {
  try {
    const db = getDB();
    
    // 1. Get Global Settings
    let globalSettings = await db.collection('global_settings').findOne({ id: 'security' });
    if (!globalSettings) {
      globalSettings = {
        passwordMinLength: 8,
        passwordRequireSpecial: false,
        passwordRequireNumber: false,
        enforce2FA: false,
        sessionTimeout: 120 // minutes
      };
    }

    // 2. Get Shop Specific Overrides (IP whitelist, etc.)
    const users = await db.collection('users').find({ role: 'admin', status: 'active' }).project({ username: 1, bizName: 1 }).toArray();
    const usernames = users.map(u => u.username);
    
    const settingsDocs = await db.collection('settings').find({ username: { $in: usernames } }).project({ username: 1, ipWhitelist: 1, trustedDevices: 1 }).toArray();
    const settingsMap = {};
    settingsDocs.forEach(s => { settingsMap[s.username] = s; });

    const shops = users.map(u => ({
      username: u.username,
      bizName: u.bizName || u.username,
      ipWhitelist: settingsMap[u.username]?.ipWhitelist || [],
      trustedDevicesCount: (settingsMap[u.username]?.trustedDevices || []).length
    }));

    return res.json({ status: 'success', globalSettings, shops });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function superSaveGlobalSecurity(req, res) {
  const data = req.body;
  try {
    const db = getDB();
    await db.collection('global_settings').updateOne(
      { id: 'security' },
      { $set: data },
      { upsert: true }
    );
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function superSaveShopSecurity(req, res) {
  const { username } = req.params;
  const data = req.body; // e.g. { ipWhitelist: ['192.168.1.1'] }
  try {
    const db = getDB();
    await db.collection('settings').updateOne(
      { username },
      { $set: data },
      { upsert: true }
    );
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}


// --- Dashboard & Analytics: Shop Stats ---
async function superDashboardShopStats(req, res) {
  try {
    const db = getDB();
    const today = new Date();
    const todayStr = today.toISOString().substring(0, 10);
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - 7);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // All admin users
    const users = await db.collection('users').find({ role: { $ne: 'super_admin' } }, { projection: { username: 1, role: 1, status: 1, accountStatus: 1, createdAt: 1 } }).toArray();
    const allSettings = await db.collection('settings').find({}, { projection: { username: 1, subscriptionExpiry: 1, subscriptionCancelled: 1, shopType: 1, state: 1, city: 1, planName: 1, planCycle: 1, bizName: 1 } }).toArray();
    const settingsMap = {};
    allSettings.forEach(s => { settingsMap[s.username] = s; });

    const plans = await db.collection('sa_plans').find({}).toArray();

    // Enrich users with settings
    const shops = users.map(u => {
      const s = settingsMap[u.username] || {};
      const expiry = s.subscriptionExpiry;
      let expiryDate = expiry ? new Date(expiry) : null;
      let isExpired = expiryDate ? expiryDate < today : false;
      let cancelled = s.subscriptionCancelled === true;
      let createdAt = u.createdAt || null;
      if (!createdAt && u._id) {
        try { createdAt = new Date(parseInt(String(u._id).substring(0, 8), 16) * 1000).toISOString(); } catch (e) {}
      }
      return { ...u, settings: s, expiryDate, isExpired, cancelled, createdAt };
    });

    // Total Shops Breakdown
    const total = shops.length;
    const active = shops.filter(s => s.status === 'active' && !s.isExpired).length;
    const blocked = shops.filter(s => s.status === 'blocked').length;
    const deleted = shops.filter(s => s.status === 'deleted' || s.status === 'merged').length;
    const expired = shops.filter(s => s.isExpired && s.status === 'active').length;
    const suspended = shops.filter(s => s.status === 'suspended').length;

    // New registrations
    const newToday = shops.filter(s => s.createdAt && formatDate(s.createdAt) === todayStr).length;
    const newWeek = shops.filter(s => s.createdAt && new Date(s.createdAt) >= startOfWeek).length;
    const newMonth = shops.filter(s => s.createdAt && new Date(s.createdAt) >= startOfMonth).length;

    // Shops by type
    const byType = {};
    shops.forEach(s => {
      const t = s.settings?.shopType || 'Unknown';
      byType[t] = (byType[t] || 0) + 1;
    });

    // Shops by state and city
    const byState = {};
    const byCity = {};
    shops.forEach(s => {
      const state = s.settings?.state || 'Unknown';
      const city = s.settings?.city || 'Unknown';
      byState[state] = (byState[state] || 0) + 1;
      byCity[city] = (byCity[city] || 0) + 1;
    });

    // Churn rate
    const churned = shops.filter(s => s.cancelled || (s.isExpired && s.expiryDate && (today - s.expiryDate) > 30 * 24 * 3600 * 1000)).length;
    const churnRate = total > 0 ? ((churned / total) * 100).toFixed(1) : '0.0';

    // Shops on each plan
    const byPlan = {};
    shops.forEach(s => {
      const p = s.settings?.planName || 'No Plan';
      byPlan[p] = (byPlan[p] || 0) + 1;
    });

    // Grace period (expired within last 7 days but status still active)
    const gracePeriodDate = new Date(today); gracePeriodDate.setDate(today.getDate() - 7);
    const inGrace = shops.filter(s => s.isExpired && s.expiryDate && s.expiryDate >= gracePeriodDate && s.status === 'active');

    // Expiring this week / month
    const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + 7);
    const endOfMonth = new Date(today); endOfMonth.setDate(today.getDate() + 30);
    const expiringWeek = shops.filter(s => s.expiryDate && s.expiryDate >= today && s.expiryDate <= endOfWeek).length;
    const expiringMonth = shops.filter(s => s.expiryDate && s.expiryDate >= today && s.expiryDate <= endOfMonth).length;

    return res.json({
      status: 'success',
      totals: { total, active, blocked, deleted, expired, suspended },
      newRegistrations: { today: newToday, week: newWeek, month: newMonth },
      byType,
      byState: Object.entries(byState).sort((a, b) => b[1] - a[1]),
      byCity: Object.entries(byCity).sort((a, b) => b[1] - a[1]),
      churn: { churned, churnRate },
      byPlan,
      grace: { count: inGrace.length, shops: inGrace.map(s => ({ username: s.username, bizName: s.settings?.bizName || s.bizName || s.username, expiry: s.settings?.subscriptionExpiry })) },
      expiring: { week: expiringWeek, month: expiringMonth }
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}


// --- Dashboard & Analytics: Revenue Stats ---
async function superDashboardRevenueStats(req, res) {
  try {
    const db = getDB();
    const today = new Date();
    const todayStr = today.toISOString().substring(0, 10);
    const monthStr = todayStr.substring(0, 7);
    const yearStr = todayStr.substring(0, 4);

    const payments = await db.collection('sa_payments').find({}, { projection: { type: 1, amount: 1, date: 1, createdAt: 1, plan_name: 1, status: 1 } }).toArray();
    const refunds = await db.collection('sa_refunds').find({}, { projection: { amount: 1 } }).toArray();
    const allSettings = await db.collection('settings').find({}, { projection: { planName: 1, planCycle: 1, subscriptionExpiry: 1, subscriptionCancelled: 1 } }).toArray();
    const plans = await db.collection('sa_plans').find({}).toArray();
    const planMap = {};
    plans.forEach(p => { planMap[p.name] = p; });

    const getDate = (p) => p.date || (p.createdAt ? new Date(p.createdAt).toISOString().substring(0, 10) : null);
    const getAmt = (p) => parseFloat(p.amount) || 0;

    // Filter out cancel/refund types for revenue
    const revPayments = payments.filter(p => p.type !== 'cancel' && getAmt(p) > 0);

    // Total revenue by period
    const revenueToday = revPayments.filter(p => getDate(p) === todayStr).reduce((s, p) => s + getAmt(p), 0);
    const revenueMonth = revPayments.filter(p => (getDate(p) || '').startsWith(monthStr)).reduce((s, p) => s + getAmt(p), 0);
    const revenueYear = revPayments.filter(p => (getDate(p) || '').startsWith(yearStr)).reduce((s, p) => s + getAmt(p), 0);

    // Revenue by plan
    const byPlan = {};
    revPayments.forEach(p => {
      const plan = p.plan_name || 'Unknown';
      byPlan[plan] = (byPlan[plan] || 0) + getAmt(p);
    });

    // Pending payments
    const pending = payments.filter(p => (p.status || '').toLowerCase() === 'pending');
    const pendingCount = pending.length;
    const pendingAmount = pending.reduce((s, p) => s + getAmt(p), 0);

    // Upcoming renewals this month
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const upcomingRenewals = allSettings.filter(s => {
      if (!s.subscriptionExpiry) return false;
      const exp = new Date(s.subscriptionExpiry);
      return exp >= today && exp <= endOfMonth && !s.subscriptionCancelled;
    }).length;

    // MRR & ARR
    const activeMonthly = allSettings.filter(s => s.planCycle === 'MONTHLY' && s.subscriptionExpiry && new Date(s.subscriptionExpiry) >= today && !s.subscriptionCancelled);
    const activeYearly = allSettings.filter(s => s.planCycle === 'YEARLY' && s.subscriptionExpiry && new Date(s.subscriptionExpiry) >= today && !s.subscriptionCancelled);
    
    let mrrFromMonthly = 0;
    activeMonthly.forEach(s => {
      const plan = planMap[s.planName];
      mrrFromMonthly += plan ? (parseFloat(plan.monthlyPrice || plan.price) || 0) : 0;
    });
    let mrrFromYearly = 0;
    activeYearly.forEach(s => {
      const plan = planMap[s.planName];
      mrrFromYearly += plan ? ((parseFloat(plan.yearlyPrice || plan.price) || 0) / 12) : 0;
    });
    const mrr = mrrFromMonthly + mrrFromYearly;
    const arr = mrr * 12;

    // Refunds
    const refundCount = refunds.length;
    const refundAmount = refunds.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

    // Failed payments
    const failedCount = payments.filter(p => (p.status || '').toLowerCase() === 'failed').length;

    // ARPU
    const activeShops = allSettings.filter(s => s.subscriptionExpiry && new Date(s.subscriptionExpiry) >= today).length;
    const arpu = activeShops > 0 ? (revenueYear / activeShops) : 0;

    // Revenue trend (last 12 months)
    const trend = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = d.toISOString().substring(0, 7);
      const rev = revPayments.filter(p => (getDate(p) || '').startsWith(key)).reduce((s, p) => s + getAmt(p), 0);
      trend.push({ month: key, revenue: rev });
    }

    return res.json({
      status: 'success',
      totals: { today: revenueToday, month: revenueMonth, year: revenueYear },
      byPlan,
      pending: { count: pendingCount, amount: pendingAmount },
      upcomingRenewals,
      mrr, arr,
      refunds: { count: refundCount, amount: refundAmount },
      failedCount,
      arpu,
      trend
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}


async function superDashboardBusinessStats(req, res) {
  try {
    const db = getDB();
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayStr = today.toISOString().substring(0, 10);
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().substring(0, 10);

    const invoices = await db.collection('invoices').find({}, { projection: { date: 1, invoiceDate: 1, createdAt: 1, totalAmount: 1, total: 1, paidAmount: 1, received: 1, type: 1, isCreditNote: 1, gstAmount: 1, taxAmount: 1, amount: 1, outstanding: 1, totalTax: 1, paymentMode: 1, mode: 1, paymentMethod: 1 } }).toArray();
    let invToday = 0; let invMonth = 0; let totalSalesAmt = 0; let totalGst = 0; let creditNotes = 0; let outstandingRecv = 0;
    
    invoices.forEach(i => {
      const dt = formatDate(i.date || i.invoiceDate || i.createdAt);
      if (dt === todayStr) invToday++;
      if (dt >= firstDay) invMonth++;
      
      const amt = parseFloat(i.amount !== undefined ? i.amount : (i.totalAmount !== undefined ? i.totalAmount : (i.total !== undefined ? i.total : 0))) || 0;
      const outstandingVal = parseFloat(i.outstanding) || 0;
      const pd = i.outstanding !== undefined ? (amt - outstandingVal) : (parseFloat(i.paidAmount || i.received || 0) || 0);
      
      if (i.type === 'credit_note' || i.isCreditNote) {
        creditNotes += amt;
      } else {
        totalSalesAmt += amt;
        outstandingRecv += (amt - pd);
      }
      
      totalGst += parseFloat(i.totalTax || i.gstAmount || i.taxAmount || 0) || 0;
    });

    const sales = await db.collection('sales').find({}, { projection: { date: 1, createdAt: 1, totalAmount: 1, total: 1, paidAmount: 1, received: 1, gstAmount: 1, taxAmount: 1, amount: 1, outstanding: 1, totalTax: 1, mode: 1, paymentMethod: 1, paymentMode: 1 } }).toArray();
    sales.forEach(s => {
      const dt = formatDate(s.date || s.createdAt);
      if (dt === todayStr) invToday++;
      if (dt >= firstDay) invMonth++;
      
      const amt = parseFloat(s.amount !== undefined ? s.amount : (s.totalAmount !== undefined ? s.totalAmount : (s.total !== undefined ? s.total : 0))) || 0;
      const outstandingVal = parseFloat(s.outstanding) || 0;
      const pd = s.outstanding !== undefined ? (amt - outstandingVal) : (parseFloat(s.paidAmount || s.received || 0) || 0);
      
      totalSalesAmt += amt;
      outstandingRecv += (amt - pd);
      totalGst += parseFloat(s.totalTax || s.gstAmount || s.taxAmount || 0) || 0;
    });

    const purchases = await db.collection('purchases').find({}, { projection: { totalAmount: 1, total: 1, paidAmount: 1, paid: 1, amount: 1, outstanding: 1 } }).toArray();
    let poCount = purchases.length;
    let outstandingPay = 0;
    purchases.forEach(p => {
      const amt = parseFloat(p.amount !== undefined ? p.amount : (p.totalAmount !== undefined ? p.totalAmount : (p.total !== undefined ? p.total : 0))) || 0;
      const outstandingVal = parseFloat(p.outstanding) || 0;
      const pd = p.outstanding !== undefined ? (amt - outstandingVal) : (parseFloat(p.paidAmount || p.paid || 0) || 0);
      outstandingPay += (amt - pd);
    });

    const totalProducts = await db.collection('products').countDocuments({});
    const totalCustomers = await db.collection('parties').countDocuments({ type: /customer/i });
    const totalSuppliers = await db.collection('parties').countDocuments({ type: /supplier/i });
    const totalDeliveries = await db.collection('deliveries').countDocuments({ status: { $in: ['completed', 'delivered'] } });

    const expenses = await db.collection('expenses').find({}, { projection: { amount: 1 } }).toArray();
    const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amount || 0) || 0), 0);

    const payModes = { upi: 0, cash: 0, card: 0, cheque: 0 };
    
    invoices.forEach(i => {
      const m = (i.paymentMode || i.mode || i.paymentMethod || 'cash').toLowerCase();
      const a = parseFloat(i.amount !== undefined ? i.amount : (i.totalAmount !== undefined ? i.totalAmount : (i.total !== undefined ? i.total : 0))) || 0;
      if (m.includes('upi')) payModes.upi += a;
      else if (m.includes('card')) payModes.card += a;
      else if (m.includes('cheq')) payModes.cheque += a;
      else if (m.includes('cash')) payModes.cash += a;
    });

    sales.forEach(s => {
      const m = (s.mode || s.paymentMethod || s.paymentMode || 'cash').toLowerCase();
      const a = parseFloat(s.amount !== undefined ? s.amount : (s.totalAmount !== undefined ? s.totalAmount : (s.total !== undefined ? s.total : 0))) || 0;
      if (m.includes('upi')) payModes.upi += a;
      else if (m.includes('card')) payModes.card += a;
      else if (m.includes('cheq')) payModes.cheque += a;
      else if (m.includes('cash')) payModes.cash += a;
    });

    return res.json({
      status: 'success',
      invoices: { today: invToday, month: invMonth, totalCount: invoices.length + sales.length },
      totalSalesAmt,
      purchaseOrders: poCount,
      totalProducts,
      totalCustomers,
      totalSuppliers,
      totalDeliveries,
      totalExpenses,
      totalGst,
      creditNotes,
      outstandingReceivables: Math.max(outstandingRecv, 0),
      outstandingPayables: Math.max(outstandingPay, 0),
      paymentModes: payModes
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function superDashboardStaffStats(req, res) {
  try {
    const db = getDB();
    const users = await db.collection('users').find({ role: { $nin: ['super_admin', 'admin'] } }, { projection: { role: 1 } }).toArray();
    const staffCol = await db.collection('staff').find({}, { projection: { role: 1 } }).toArray();
    const staffusersCol = await db.collection('staffusers').find({}, { projection: { role: 1 } }).toArray();
    const dbBoys = await db.collection('delivery_boys').find({}, { projection: { name: 1 } }).toArray();
    
    let totalStaff = 0;
    let byRole = { cashier: 0, accountant: 0, delivery_boy: 0, other: 0 };
    
    const countRole = (role) => {
      totalStaff++;
      const r = (role || '').toLowerCase();
      if (r.includes('cashier')) byRole.cashier++;
      else if (r.includes('accountant')) byRole.accountant++;
      else if (r.includes('delivery')) byRole.delivery_boy++;
      else byRole.other++;
    };

    users.forEach(u => countRole(u.role));
    staffCol.forEach(s => countRole(s.role));
    staffusersCol.forEach(s => countRole(s.role));
    dbBoys.forEach(d => countRole('delivery_boy'));

    const logins1 = await db.collection('loginhistories').find({}, { projection: { username: 1, email: 1, loginTime: 1, createdAt: 1, timestamp: 1 } }).toArray();
    const logins2 = await db.collection('login_history').find({}, { projection: { username: 1, email: 1, loginTime: 1, createdAt: 1, timestamp: 1, loginAt: 1 } }).toArray();
    const logins = [...logins1, ...logins2.map(l => ({ ...l, loginTime: l.loginTime || l.loginAt }))]
      .sort((a,b) => new Date(b.loginTime || b.createdAt) - new Date(a.loginTime || a.createdAt))
      .slice(0, 5000);
    const logFreq = {};
    const activeStaff = {};

    logins.forEach(l => {
      const un = l.username || l.email || 'Unknown';
      logFreq[un] = (logFreq[un] || 0) + 1;
      
      const dStr = formatDate(l.loginTime || l.createdAt || l.timestamp);
      if (dStr) {
        if (!activeStaff[un]) activeStaff[un] = new Set();
        activeStaff[un].add(dStr);
      }
    });

    const activeList = Object.keys(activeStaff).map(u => ({ username: u, activeDays: activeStaff[u].size })).sort((a,b) => b.activeDays - a.activeDays).slice(0, 10);
    const freqList = Object.keys(logFreq).map(u => ({ username: u, logins: logFreq[u] })).sort((a,b) => b.logins - a.logins).slice(0, 10);

    return res.json({
      status: 'success',
      totalStaff,
      byRole,
      mostActive: activeList,
      loginFreq: freqList
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function superDashboardAppUsage(req, res) {
  try {
    const db = getDB();
    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);
    
    const d30 = new Date();
    d30.setDate(d30.getDate() - 30);
    d30.setHours(0,0,0,0);
    const thirtyDaysAgo = d30.toISOString().substring(0, 10);

    const logins1 = await db.collection('loginhistories').find({}, { projection: { username: 1, email: 1, loginTime: 1, createdAt: 1, timestamp: 1 } }).toArray();
    const logins2 = await db.collection('login_history').find({}, { projection: { username: 1, email: 1, loginTime: 1, createdAt: 1, timestamp: 1, loginAt: 1 } }).toArray();
    const logins = [...logins1, ...logins2.map(l => ({ ...l, loginTime: l.loginTime || l.loginAt }))]
      .sort((a,b) => new Date(b.loginTime || b.createdAt) - new Date(a.loginTime || a.createdAt))
      .slice(0, 5000);
    const dauSet = new Set();
    const mauSet = new Set();

    logins.forEach(l => {
      const dt = formatDate(l.loginTime || l.createdAt || l.timestamp);
      const un = l.username || l.email;
      if (!dt || !un) return;
      const dStr = dt;
      if (dStr === todayStr) dauSet.add(un);
      if (dStr >= thirtyDaysAgo) mauSet.add(un);
    });

    const auditLogs = await db.collection('sa_audit').find({}, { projection: { action: 1, timestamp: 1, username: 1 } }).sort({ timestamp: -1 }).limit(5000).toArray();
    const featureUsage = {};
    const hourUsage = {};
    let sessionSum = 0;
    let sessionCount = 0;
    const userDays = {};

    auditLogs.forEach(l => {
      const f = l.action || 'Unknown';
      featureUsage[f] = (featureUsage[f] || 0) + 1;
      
      if (l.timestamp) {
        const d = new Date(l.timestamp);
        if (isNaN(d.getTime())) return;
        
        const hr = d.getHours();
        hourUsage[hr] = (hourUsage[hr] || 0) + 1;

        const u = l.username || 'sys';
        const dStr = d.toISOString().substring(0,10);
        const k = u+'_'+dStr;
        if (!userDays[k]) userDays[k] = { min: d, max: d };
        else {
          if (d < userDays[k].min) userDays[k].min = d;
          if (d > userDays[k].max) userDays[k].max = d;
        }
      }
    });

    Object.values(userDays).forEach(ud => {
      const dur = (ud.max - ud.min) / 1000 / 60;
      if (dur > 0 && dur < 600) {
        sessionSum += dur;
        sessionCount++;
      }
    });
    const avgSessionMinutes = sessionCount > 0 ? Math.round(sessionSum / sessionCount) : 0;

    const invoices1 = await db.collection('invoices').find({}, { projection: { type: 1, paymentMethod: 1, method: 1 } }).toArray();
    const invoices2 = await db.collection('sales').find({}, { projection: { type: 1, paymentMethod: 1, method: 1, mode: 1 } }).toArray();
    const invoices = [...invoices1, ...invoices2.map(s => ({ ...s, paymentMethod: s.paymentMethod || s.mode }))]
      .slice(0, 5000);
      
    const invTypes = {};
    const payModes = {};
    invoices.forEach(i => {
      const t = i.type || 'Non-GST';
      invTypes[t] = (invTypes[t] || 0) + 1;
      const pm = i.paymentMethod || i.method || 'Cash';
      payModes[pm] = (payModes[pm] || 0) + 1;
    });

    const users = await db.collection('users').find({ role: 'admin' }, { projection: { username: 1 } }).toArray();
    const activeShopSet = new Set();
    auditLogs.forEach(l => {
      if (l.timestamp && l.timestamp >= thirtyDaysAgo) {
        activeShopSet.add(l.username);
      }
    });
    
    const inactiveShops = [];
    users.forEach(u => {
      if (!activeShopSet.has(u.username)) {
        inactiveShops.push(u.username);
      }
    });

    // Most used modules per shop
    const shopModules = {};
    auditLogs.forEach(l => {
      const u = l.username || 'sys';
      const action = l.action || 'Unknown';
      if (!shopModules[u]) shopModules[u] = {};
      shopModules[u][action] = (shopModules[u][action] || 0) + 1;
    });
    const modulesPerShop = Object.entries(shopModules).map(([shop, modules]) => {
      const topModule = Object.entries(modules).sort((a, b) => b[1] - a[1])[0];
      return { shop, topModule: topModule ? topModule[0] : 'None', count: topModule ? topModule[1] : 0 };
    }).sort((a, b) => b.count - a.count).slice(0, 15);

    return res.json({
      status: 'success',
      dau: dauSet.size,
      mau: mauSet.size,
      featureUsage,
      hourUsage,
      avgSessionMinutes,
      invoiceTypes: invTypes,
      paymentModes: payModes,
      inactiveRiskCount: inactiveShops.length,
      inactiveShops: inactiveShops.slice(0, 50),
      modulesPerShop
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function superDashboardBusinessDetails(req, res) {
  try {
    const db = getDB();
    const { type } = req.query; // 'purchases', 'products', 'customers', 'suppliers', 'deliveries', 'expenses', 'gst', 'credit-notes', 'receivables', 'payables'
    let data = [];

    if (type === 'purchases') {
      data = await db.collection('purchases').find({}).toArray();
    } else if (type === 'products') {
      data = await db.collection('products').find({}).toArray();
    } else if (type === 'customers') {
      data = await db.collection('parties').find({ type: /customer/i }).toArray();
    } else if (type === 'suppliers') {
      data = await db.collection('parties').find({ type: /supplier/i }).toArray();
    } else if (type === 'deliveries') {
      data = await db.collection('deliveries').find({}).toArray();
    } else if (type === 'expenses') {
      data = await db.collection('expenses').find({}).toArray();
    } else if (type === 'gst') {
      const sales = await db.collection('sales').find({}).toArray();
      const invoices = await db.collection('invoices').find({}).toArray();
      data = [...sales, ...invoices].filter(x => parseFloat(x.totalTax || x.gstAmount || x.taxAmount || 0) > 0);
    } else if (type === 'credit-notes') {
      const invoices = await db.collection('invoices').find({
        $or: [
          { type: 'credit_note' },
          { isCreditNote: true }
        ]
      }).toArray();
      data = invoices;
    } else if (type === 'receivables') {
      const sales = await db.collection('sales').find({}).toArray();
      const invoices = await db.collection('invoices').find({}).toArray();
      data = [...sales, ...invoices].filter(x => {
        const amt = parseFloat(x.amount !== undefined ? x.amount : (x.totalAmount !== undefined ? x.totalAmount : (x.total !== undefined ? x.total : 0))) || 0;
        const outstandingVal = parseFloat(x.outstanding) || 0;
        const pd = x.outstanding !== undefined ? (amt - outstandingVal) : (parseFloat(x.paidAmount || x.received || 0) || 0);
        return (amt - pd) > 0;
      });
    } else if (type === 'payables') {
      const purchases = await db.collection('purchases').find({}).toArray();
      data = purchases.filter(x => {
        const amt = parseFloat(x.amount !== undefined ? x.amount : (x.totalAmount !== undefined ? x.totalAmount : (x.total !== undefined ? x.total : 0))) || 0;
        const outstandingVal = parseFloat(x.outstanding) || 0;
        const pd = x.outstanding !== undefined ? (amt - outstandingVal) : (parseFloat(x.paidAmount || x.paid || 0) || 0);
        return (amt - pd) > 0;
      });
    }

    return res.json({ status: 'success', data });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  superDashboardBusinessDetails,
  superDashboardBusinessStats,
  superDashboardStaffStats,
  superDashboardAppUsage,

  getSuperStats,
  superGetUsers,
  superGetShops,
  superVerify,
  superSubscription,
  superStatus,
  superSubscriptionInfo,
  superPlan,
  superPlans,
  superConfig,
  superPayments,
  getUserPayments,
  superAudit,
  renewSubscription,
  getPaymentInvoice,
  cancelSubscription,
  toggleAutoRenew,
  applyCoupon,
  sendExpiryReminders,
  superPlanAction,
  seedDefaultPlans,
  getPlanLimits,
  createOrUpdatePlanLimits,
  getPlanLimitDetails,
  superGetNotifications,
  superMarkNotificationRead,
  superDeleteUser,
  superForceResetPassword,
  superMergeAccounts,
  superGetLoginHistory,
  superGetGlobalStaff,
  superGetGlobalStaffActivity,
  superToggleStaffActive,
  superGetGlobalStaffLogins,
  superGetSecuritySettings,
  superSaveGlobalSecurity,
  superSaveShopSecurity,
  superDashboardShopStats,
  superDashboardRevenueStats,
  superImpersonateMerchant,
};

// Export new shop management APIs
module.exports.superGetShops = superGetShops;
module.exports.superCreateShop = superCreateShop;
module.exports.superEditShop = superEditShop;
module.exports.sendShopOtp = sendShopOtp;
module.exports.verifyShopOtp = verifyShopOtp;
