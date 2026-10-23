const { getDB } = require('../config/db');

// Fetch integration settings
async function getIntegrations(req, res) {
  try {
    const db = getDB();
    const config = await db.collection('sa_config').findOne({ type: 'integrations' });
    
    // Default structure if not initialized
    const defaultData = {
      type: 'integrations',
      payments: { razorpay: {}, stripe: {}, payu: {}, upi: {} },
      comms: { whatsapp: {}, sms: {}, smtp: {} },
      logistics: { shiprocket: {}, delhivery: {}, dunzo: {} },
      hardware: { printers: {}, cloudBackup: {} },
      developer: { webhooks: [], sso: {}, globalApiKey: '' }
    };

    return res.json({ status: 'success', data: config || defaultData });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Update integration settings
async function updateIntegrations(req, res) {
  try {
    const db = getDB();
    const payload = req.body;
    
    await db.collection('sa_config').updateOne(
      { type: 'integrations' },
      { $set: { ...payload, updatedAt: new Date() } },
      { upsert: true }
    );

    // Audit log
    await db.collection('sa_audit').insertOne({
      username: req.user?.username || 'superadmin',
      action: 'UPDATE_INTEGRATIONS',
      details: 'Updated global integration credentials',
      timestamp: new Date()
    });

    return res.json({ status: 'success', message: 'Integrations updated successfully' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  getIntegrations,
  updateIntegrations
};
