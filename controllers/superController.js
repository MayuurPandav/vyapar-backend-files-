const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const { logAudit } = require('./authController');

// Super Admin Stats Dashboard
async function getSuperStats(req, res) {
  try {
    const db = getDB();
    const payments = await db.collection('sa_payments').find({}).toArray();
    const revenue = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    const totalUsers = await db.collection('users').countDocuments({ role: { $ne: 'super_admin' } });
    const activeUsers = await db.collection('users').countDocuments({ role: { $ne: 'super_admin' }, status: 'active' });
    const totalPlans = await db.collection('sa_plans').countDocuments({});

    return res.json({
      revenue,
      total_users: totalUsers,
      active_users: activeUsers,
      total_plans: totalPlans,
      trend: [] // Keep consistent with backend/app.py empty trend array
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
      enrichedUsers.append = {
        ...u,
        ...settings,
        _id: String(u._id)
      };
      enrichedUsers.push(enrichedUsers.append);
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
        active = new Date(expiry) >= new Date(new Date().setHours(0,0,0,0));
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
      const { _id, name, price, cycle, features } = req.body;
      const parsedPrice = parseFloat(price) || 0;
      if (_id) {
        await db.collection('sa_plans').updateOne(
          { _id: new ObjectId(_id) },
          { $set: { name, price: parsedPrice, cycle, features } }
        );
      } else {
        await db.collection('sa_plans').insertOne({ name, price: parsedPrice, cycle, features });
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

module.exports = {
  getSuperStats,
  superGetUsers,
  superVerify,
  superSubscription,
  superStatus,
  superSubscriptionInfo,
  superPlan,
  superPlans,
  superConfig,
  superPayments,
  getUserPayments,
  superAudit
};
