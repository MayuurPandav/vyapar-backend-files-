const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const { sendEmail, sendSMS, sendWhatsApp, sendInApp } = require('../utils/notifyAdapters');
const communicationService = require('../services/communicationService');
const { logAudit } = require('./authController');

// Utility: simple retry wrapper
async function retry(fn, attempts = 3, backoff = 300) {
  let a = 0; let lastErr = null;
  while (a < attempts) {
    try { return await fn(); } catch (e) { lastErr = e; a++; await new Promise(r => setTimeout(r, backoff * a)); }
  }
  throw lastErr;
}

// ADMIN: list announcements + configs
async function listAnnouncements(req, res) {
  try {
    const db = getDB();
    const announcements = await db.collection('sa_announcements').find({}).toArray();
    const templates = await db.collection('sa_templates').find({}).toArray();
    return res.json({ status: 'success', announcements, templates });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Create / update announcement
async function updateAnnouncement(req, res) {
  try {
    const db = getDB();
    const a = req.body;
    if (!a || !a.title || !a.message) return res.status(400).json({ status: 'error', message: 'title and message required' });
    const doc = {
      title: a.title,
      message: a.message,
      channels: a.channels || ['in-app'],
      filters: a.filters || {},
      scheduledAt: a.scheduledAt ? new Date(a.scheduledAt) : (a.immediate ? new Date() : null),
      createdBy: req.body.actor || req.body.username || 'SYSTEM',
      createdAt: new Date(),
      sent: false,
      meta: a.meta || {}
    };
    if (a._id) await db.collection('sa_announcements').updateOne({ _id: a._id }, { $set: doc }); else await db.collection('sa_announcements').insertOne(doc);
    await logAudit(req.body.actor || 'SYSTEM', 'ANNOUNCEMENT_CREATED', doc.title);
    if (a.immediate) { sendAnnouncement(doc).catch(e=>console.error('sendAnnouncement:', e)); }
    return res.json({ status: 'success' });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

// Send an announcement object
async function sendAnnouncement(announcement) {
  const db = getDB();
  const ann = { ...announcement };
  const channels = ann.channels || ['in-app'];

  // resolve recipients
  let recipients = [];
  if (ann.filters && ann.filters.username) {
    const list = Array.isArray(ann.filters.username) ? ann.filters.username : [ann.filters.username];
    recipients = await db.collection('users').find({ username: { $in: list } }).project({ username: 1, email:1, phone:1, city:1, state:1 }).toArray();
  } else if (ann.filters && ann.filters.roles && Array.isArray(ann.filters.roles) && ann.filters.roles.length > 0) {
    const roles = ann.filters.roles.map(r => r.toLowerCase());
    if (roles.includes('admin')) {
      const list = await db.collection('users').find({ role: 'admin' }).project({ username: 1, email: 1, phone: 1, city: 1, state: 1 }).toArray();
      recipients.push(...list.map(u => ({ ...u, role: 'admin' })));
    }
    if (roles.includes('delivery')) {
      const list = await db.collection('driver_profiles').find({}).project({ employeeId: 1, email: 1, phone: 1 }).toArray();
      recipients.push(...list.map(u => ({ username: u.employeeId, email: u.email, phone: u.phone, role: 'delivery' })));
    }
    if (roles.includes('staff')) {
      const list = await db.collection('staffusers').find({}).project({ email: 1, phone: 1, role: 1 }).toArray();
      recipients.push(...list.map(u => ({ username: u.email, email: u.email, phone: u.phone, role: u.role || 'staff' })));
    }
    if (roles.includes('accountant')) {
      const list = await db.collection('accountantusers').find({}).project({ email: 1, phone: 1 }).toArray();
      recipients.push(...list.map(u => ({ username: u.email, email: u.email, phone: u.phone, role: 'accountant' })));
    }

    // Apply optional city/state/shopType filters to role lists
    if (ann.filters.city || ann.filters.state || ann.filters.shopType) {
      recipients = recipients.filter(u => {
        if (ann.filters.city && u.city !== ann.filters.city) return false;
        if (ann.filters.state && u.state !== ann.filters.state) return false;
        if (ann.filters.shopType && u.shopType !== ann.filters.shopType) return false;
        return true;
      });
    }
  } else {
    const q = {};
    if (ann.filters) {
      if (ann.filters.city) q.city = ann.filters.city;
      if (ann.filters.state) q.state = ann.filters.state;
      if (ann.filters.shopType) q.shopType = ann.filters.shopType;
    }
    // planName requires join with settings
    if (ann.filters && ann.filters.planName) {
      const users = await db.collection('users').find(q).project({ username:1, email:1, phone:1 }).toArray();
      const matched = [];
      for (const u of users) {
        const s = await db.collection('settings').findOne({ username: u.username });
        if (s && s.planName === ann.filters.planName) matched.push(u);
      }
      recipients = matched;
    } else {
      recipients = await db.collection('users').find(q).project({ username:1, email:1, phone:1 }).toArray();
    }
  }

  recipients = recipients.slice(0, Number(process.env.NOTIFY_MAX_RECIPIENTS || 2000));

  const results = { total: recipients.length, enqueued: 0, sent: 0 };
  const { enqueueDeliveryJob } = require('../queue/announcementQueue');
  
  for (const r of recipients) {
    for (const ch of channels) {
      if (ch === 'in-app') {
        try {
          await db.collection('sa_notifications').insertOne({
            username: r.username,
            title: ann.title,
            message: ann.message,
            meta: ann.meta || {},
            createdAt: new Date(),
            read: false
          });
          results.sent++;
          await db.collection('sa_delivery_logs').insertOne({
            announcementId: announcement._id || null,
            channel: 'in-app',
            username: r.username,
            to: r.email || r.phone || null,
            status: 'sent',
            ts: new Date()
          });
        } catch (err) {
          await db.collection('sa_delivery_logs').insertOne({
            announcementId: announcement._id || null,
            channel: 'in-app',
            username: r.username,
            to: r.email || r.phone || null,
            status: 'error',
            error: err.message,
            ts: new Date()
          });
        }
      } else {
        try {
          await enqueueDeliveryJob(announcement._id || null, ch, r, { title: ann.title, message: ann.message, meta: ann.meta || {} });
          results.enqueued++;
        } catch (err) {
          // log enqueue failure
          await db.collection('sa_delivery_logs').insertOne({ announcementId: announcement._id || null, channel: ch, username: r.username, to: r.email || r.phone || null, status: 'enqueue_error', error: err.message, ts: new Date() });
        }
      }
    }
  }

  // update announcement record
  try { if (announcement._id) await db.collection('sa_announcements').updateOne({ _id: announcement._id }, { $set: { queuedAt: new Date(), queuedCount: recipients.length } }); } catch (e) {}
  await logAudit('SYSTEM', 'ANNOUNCEMENT_QUEUED', `title=${announcement.title} total=${recipients.length}`);
  return results;
}

// API: send ad-hoc announcement
async function sendNotification(req, res) {
  try {
    const body = req.body;
    if (!body || !body.title || !body.message) return res.status(400).json({ status: 'error', message: 'title and message required' });
    const r = await sendAnnouncement(body);
    return res.json({ status: 'success', result: r });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

// Read receipt: mark notification read
async function ackRead(req, res) {
  try {
    const db = getDB();
    const { username, notificationId } = req.body;
    if (!username || !notificationId) return res.status(400).json({ status: 'error', message: 'username and notificationId required' });
    const targetId = ObjectId.isValid(notificationId) ? new ObjectId(notificationId) : notificationId;
    await db.collection('sa_notifications').updateOne({ _id: targetId, username }, { $set: { read: true, readAt: new Date() } });
    await db.collection('sa_delivery_logs').insertOne({ username, notificationId, event: 'read', ts: new Date() });
    await logAudit(username, 'NOTIFICATION_READ', String(notificationId));
    return res.json({ status: 'success' });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

// Templates
async function listTemplates(req, res) {
  try { const db = getDB(); const t = await db.collection('sa_templates').find({}).toArray(); return res.json({ status: 'success', templates: t }); } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}
async function createTemplate(req, res) {
  try { const db = getDB(); const { name, subject, body } = req.body; if (!name || !body) return res.status(400).json({ status: 'error', message: 'name and body required' }); await db.collection('sa_templates').insertOne({ name, subject: subject||'', body, createdAt: new Date(), createdBy: req.body.actor||'SYSTEM' }); await logAudit(req.body.actor||'SYSTEM','TEMPLATE_CREATE',name); return res.json({ status: 'success' }); } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

async function deleteAnnouncement(req, res) {
  try {
    const db = getDB();
    const { id } = req.params;
    if (!id) return res.status(400).json({ status: 'error', message: 'Announcement ID required' });

    const targetId = ObjectId.isValid(id) ? new ObjectId(id) : id;
    const ann = await db.collection('sa_announcements').findOne({ _id: targetId });
    if (!ann) return res.status(404).json({ status: 'error', message: 'Announcement not found' });

    // Delete announcement from sa_announcements
    await db.collection('sa_announcements').deleteOne({ _id: targetId });

    // Delete matching notifications in sa_notifications (to stop unread alerts displaying to clients)
    await db.collection('sa_notifications').deleteMany({
      title: ann.title,
      message: ann.message
    });

    // Delete delivery logs
    await db.collection('sa_delivery_logs').deleteMany({ announcementId: targetId });

    await logAudit(req.body.actor || 'SYSTEM', 'ANNOUNCEMENT_RECALLED', ann.title);

    return res.json({ status: 'success', message: 'Broadcast successfully recalled' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  listAnnouncements,
  updateAnnouncement,
  sendNotification,
  sendAnnouncement,
  ackRead,
  listTemplates,
  createTemplate,
  deleteAnnouncement
};

// Tenant-specific configurations
async function getAlertsConfig(req, res) {
  try {
    const db = getDB();
    const username = req.query.username || req.body.username;
    if (!username) return res.status(400).json({ status: 'error', message: 'username required' });

    let config = await db.collection('notification_configs').findOne({ username });
    if (!config) {
      config = {
        username,
        notifyVia: { email: true, whatsapp: false, sms: false },
        lowStockThreshold: 5
      };
    }
    return res.json({ status: 'success', config });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function updateAlertsConfig(req, res) {
  try {
    const db = getDB();
    const { username, config } = req.body;
    if (!username) return res.status(400).json({ status: 'error', message: 'username required' });

    const doc = {
      username,
      notifyVia: config?.notifyVia || { email: true, whatsapp: false, sms: false },
      lowStockThreshold: Number(config?.lowStockThreshold !== undefined ? config.lowStockThreshold : 5),
      updatedAt: new Date()
    };

    await db.collection('notification_configs').updateOne(
      { username },
      { $set: doc },
      { upsert: true }
    );
    return res.json({ status: 'success', message: 'Alerts configuration updated' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Active real-time alerts calculator
async function getActiveAlerts(req, res) {
  try {
    const db = getDB();
    const username = req.query.username;
    if (!username) return res.status(400).json({ status: 'error', message: 'username required' });

    let config = await db.collection('notification_configs').findOne({ username });
    const threshold = config?.lowStockThreshold !== undefined ? Number(config.lowStockThreshold) : 5;

    const products = await db.collection('products').find({ username }).toArray();
    
    const activePOs = await db.collection('purchases').find({
      username,
      purchaseType: 'Purchase Order',
      active: { $ne: false }
    }).toArray();

    const orderedQtyMap = {};
    activePOs.forEach(po => {
      if (Array.isArray(po.items)) {
        po.items.forEach(item => {
          if (item.name) {
            const key = item.name.trim().toLowerCase();
            orderedQtyMap[key] = (orderedQtyMap[key] || 0) + (Number(item.qty) || 0);
          }
          if (item.sku) {
            const key = item.sku.trim().toLowerCase();
            orderedQtyMap[key] = (orderedQtyMap[key] || 0) + (Number(item.qty) || 0);
          }
        });
      }
    });

    const getEffectiveStock = (p) => {
      const pName = (p.name || '').trim().toLowerCase();
      const pSku = (p.sku || '').trim().toLowerCase();
      const orderedQty = (orderedQtyMap[pName] || 0) || (pSku ? (orderedQtyMap[pSku] || 0) : 0);
      return (Number(p.stock) || 0) + orderedQty;
    };

    const lowStock = [];
    const outOfStock = [];
    const expiryAlerts = [];

    const todayStr = new Date().toISOString().substring(0, 10);
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    const thirtyDaysStr = thirtyDaysLater.toISOString().substring(0, 10);

    products.forEach(p => {
      const stock = Number(p.stock) || 0;
      const minLevel = Number(p.lowStockLevel) || threshold;
      const effectiveStock = getEffectiveStock(p);

      if (effectiveStock <= 0) {
        outOfStock.push({
          productId: p._id,
          name: p.name,
          sku: p.sku || 'N/A',
          stock,
          price: p.price || 0
        });
      } else if (effectiveStock <= minLevel) {
        lowStock.push({
          productId: p._id,
          name: p.name,
          sku: p.sku || 'N/A',
          stock,
          lowStockLevel: minLevel,
          price: p.price || 0
        });
      }

      if (p.expiryDate) {
        if (p.expiryDate <= todayStr) {
          expiryAlerts.push({
            name: p.name,
            sku: p.sku || 'N/A',
            type: 'Product',
            expiryDate: p.expiryDate,
            status: 'expired'
          });
        } else if (p.expiryDate <= thirtyDaysStr) {
          expiryAlerts.push({
            name: p.name,
            sku: p.sku || 'N/A',
            type: 'Product',
            expiryDate: p.expiryDate,
            status: 'expiring_soon'
          });
        }
      }

      if (p.batches && Array.isArray(p.batches)) {
        p.batches.forEach(b => {
          if (b.expiryDate) {
            const desc = `Batch: ${b.batchNumber}`;
            if (b.expiryDate <= todayStr) {
              expiryAlerts.push({
                name: `${p.name} (${desc})`,
                sku: p.sku || 'N/A',
                type: 'Batch',
                expiryDate: b.expiryDate,
                status: 'expired'
              });
            } else if (b.expiryDate <= thirtyDaysStr) {
              expiryAlerts.push({
                name: `${p.name} (${desc})`,
                sku: p.sku || 'N/A',
                type: 'Batch',
                expiryDate: b.expiryDate,
                status: 'expiring_soon'
              });
            }
          }
        });
      }
    });

    const parties = await db.collection('parties').find({ username }).toArray();
    const paymentDue = [];

    parties.forEach(party => {
      const balance = Number(party.balance) || 0;
      if (balance === 0) return;

      let daysOverdue = 0;
      if (party.lastTxn) {
        const diffMs = new Date() - new Date(party.lastTxn);
        daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      } else {
        daysOverdue = 15;
      }

      const creditPeriod = Number(party.creditPeriod) || 30;

      if (party.type?.toLowerCase() === 'customer' && balance > 0) {
        if (daysOverdue > creditPeriod) {
          paymentDue.push({
            partyName: party.name,
            typeRole: 'Customer',
            balance,
            daysOverdue,
            creditPeriod,
            phone: party.phone || 'N/A',
            email: party.email || 'N/A'
          });
        }
      }

      if (party.type?.toLowerCase() === 'supplier' && balance < 0) {
        if (daysOverdue > creditPeriod) {
          paymentDue.push({
            partyName: party.name,
            typeRole: 'Supplier',
            balance: Math.abs(balance),
            daysOverdue,
            creditPeriod,
            phone: party.phone || 'N/A',
            email: party.email || 'N/A'
          });
        }
      }
    });

    // 1. Overdue Invoices Alerts
    const invoices = await db.collection('invoices').find({ username }).toArray();
    const overdueInvoices = [];

    // Create a lookup map of parties by their name to resolve contact details
    const partyMap = {};
    parties.forEach(p => {
      if (p.name) {
        partyMap[p.name.trim().toLowerCase()] = p;
      }
    });

    invoices.forEach(inv => {
      const amt = Number(inv.totalAmount || inv.amount || 0);
      const rec = Number(inv.paymentReceived || 0);
      const bal = Math.max(0, inv.balanceDue != null ? Number(inv.balanceDue) : (amt - rec));
      const isPaid = (inv.status === 'Paid' || bal <= 0);
      const isOverdue = !isPaid && inv.dueDate && (inv.dueDate < todayStr);
      if (isOverdue) {
        const due = inv.dueDate ? new Date(inv.dueDate) : null;
        const daysOverdue = due ? Math.max(0, Math.ceil((new Date() - due) / (1000 * 60 * 60 * 24))) : 0;

        const customerName = (inv.customer || '').trim();
        const matchedParty = partyMap[customerName.toLowerCase()];
        const email = matchedParty?.email || inv.customerEmail || inv.email || 'N/A';
        const phone = matchedParty?.phone || inv.customerPhone || inv.phone || 'N/A';

        overdueInvoices.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          customer: customerName || 'Unknown Customer',
          amount: amt,
          balanceDue: bal,
          dueDate: inv.dueDate,
          daysOverdue,
          email: email === 'N/A' ? 'N/A' : email,
          phone: phone === 'N/A' ? 'N/A' : phone
        });
      }
    });

    // 2. Subscription Expiry alerts
    const settingsDoc = await db.collection('settings').findOne({ username });
    let subscriptionAlert = null;
    if (settingsDoc && settingsDoc.subscriptionExpiry) {
      const exp = new Date(settingsDoc.subscriptionExpiry);
      const todayDate = new Date();
      const todayReset = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
      const expReset = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
      const diffMs = expReset - todayReset;
      const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (daysRemaining <= 7) {
        subscriptionAlert = {
          planName: settingsDoc.planName || 'Merchant Plan',
          expiryDate: settingsDoc.subscriptionExpiry,
          daysRemaining,
          status: daysRemaining <= 0 ? 'expired' : 'expiring_soon'
        };
      }
    }

    // 3. GST Filing Deadlines
    const todayDate = new Date();
    const todayReset = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
    
    // GSTR-1: Due on 11th of current/next month
    let gstr1Date = new Date(todayReset.getFullYear(), todayReset.getMonth(), 11);
    if (todayReset > gstr1Date) {
      gstr1Date = new Date(todayReset.getFullYear(), todayReset.getMonth() + 1, 11);
    }
    const gstr1Days = Math.ceil((gstr1Date - todayReset) / (1000 * 60 * 60 * 24));

    // GSTR-3B: Due on 20th of current/next month
    let gstr3bDate = new Date(todayReset.getFullYear(), todayReset.getMonth(), 20);
    if (todayReset > gstr3bDate) {
      gstr3bDate = new Date(todayReset.getFullYear(), todayReset.getMonth() + 1, 20);
    }
    const gstr3bDays = Math.ceil((gstr3bDate - todayReset) / (1000 * 60 * 60 * 24));

    const gstDeadlines = [
      {
        form: 'GSTR-1',
        dueDate: gstr1Date.toISOString().substring(0, 10),
        daysRemaining: gstr1Days,
        description: 'Monthly Outward Supplies Return'
      },
      {
        form: 'GSTR-3B',
        dueDate: gstr3bDate.toISOString().substring(0, 10),
        daysRemaining: gstr3bDays,
        description: 'Monthly Summary Return'
      }
    ];

    // 4. Staff Login Alerts
    const staffList = await db.collection('staff').find({ username, deletedAt: { $exists: false } }).toArray();
    const staffEmails = staffList.map(s => s.email?.toLowerCase()).filter(Boolean);
    let staffLogins = [];
    if (staffEmails.length > 0) {
      const rawLogins = await db.collection('loginhistories')
        .find({ email: { $in: staffEmails } })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray();
      staffLogins = rawLogins.map(l => ({
        email: l.email,
        ipAddress: l.ipAddress || 'unknown',
        userAgent: l.userAgent || 'unknown',
        successful: !!l.successful,
        timestamp: l.createdAt || l.timestamp || new Date()
      }));
    }

    return res.json({
      status: 'success',
      alerts: {
        lowStock,
        outOfStock,
        expiryAlerts,
        paymentDue,
        overdueInvoices,
        subscriptionAlert,
        gstDeadlines,
        staffLogins
      }
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Payment/Restock reminder dispatcher
async function sendReminder(req, res) {
  try {
    const db = getDB();
    const { username, partyName, email, phone, amount, daysOverdue, typeRole, channel, invoiceNumber } = req.body;
    if (!username) {
      return res.status(400).json({ status: 'error', message: 'username is required' });
    }

    const results = {};
    if (channel === 'digest') {
      const recipient = email || 'merchant@vyapar.com';
      const digestHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; border: 1px solid #eee; border-radius: 4px;">
          <h2 style="color: #2563eb;">Vypar Active Alerts Digest</h2>
          <p>Here is your daily status report for active alerts:</p>
          <hr/>
          ${req.body.digestSummaryHtml || '<p>No active alerts reported.</p>'}
        </div>
      `;
      results.email = await sendEmail(recipient, `[Vypar Merchant Alerts] Active Notifications Digest`, digestHtml);
      return res.json({ status: 'success', message: 'Digest dispatched successfully', results });
    }

    if (!partyName) {
      return res.status(400).json({ status: 'error', message: 'partyName is required' });
    }

    let messageText = '';
    const details = invoiceNumber ? ` for Invoice ${invoiceNumber}` : '';
    if (typeRole?.toLowerCase() === 'customer') {
      messageText = `Dear Customer ${partyName}, this is a polite reminder that your outstanding balance of INR ${amount}${details} is overdue by ${daysOverdue} days. Please clear it at your earliest convenience. Thank you, Vypar Merchant.`;
    } else {
      messageText = `Dear Supplier ${partyName}, this is to notify that the outstanding payment of INR ${amount}${details} (due since ${daysOverdue} days) is pending invoice settlement.`;
    }

    if (channel === 'email' && email && email !== 'N/A') {
      results.email = await sendEmail(email, `[Payment Reminder] Balance Due Notification`, `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; border: 1px solid #eee; border-radius: 4px;">
          <h3>Payment Reminder</h3>
          <p>${messageText}</p>
        </div>
      `);
    } else if (channel === 'sms' && phone && phone !== 'N/A') {
      results.sms = await sendSMS(phone, messageText);
    } else if (channel === 'whatsapp' && phone && phone !== 'N/A') {
      results.whatsapp = await sendWhatsApp(phone, messageText);
    } else {
      return res.status(400).json({ status: 'error', message: `Requested channel '${channel}' is missing recipient details or is invalid.` });
    }

    return res.json({ status: 'success', message: 'Reminder sent successfully', results });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function triggerExpiryReminders(req, res) {
  try {
    const db = getDB();
    const days = Number(req.body.days) || 7;
    const now = new Date();
    const list = await db.collection('settings').find({ subscriptionExpiry: { $exists: true, $ne: null } }).toArray();
    const notify = [];
    for (const s of list) {
      const exp = new Date(s.subscriptionExpiry);
      if (isNaN(exp)) continue;
      const diff = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
      if (diff === days) {
        await db.collection('sa_notifications').insertOne({ username: s.username, title: `Subscription expires in ${days} days`, message: `Your subscription expires in ${days} days`, createdAt: new Date(), read: false });
        notify.push(s.username);
      }
    }
    return res.json({ status: 'success', notified: notify.length });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function previewRecipients(req, res) {
  try {
    const db = getDB();
    const filters = req.body.filters || req.query || {};
    
    let recipients = [];
    if (filters.username) {
      const list = Array.isArray(filters.username) ? filters.username : [filters.username];
      recipients = await db.collection('users').find({ username: { $in: list } }).project({ username: 1, email: 1, phone: 1 }).toArray();
    } else if (filters.roles && Array.isArray(filters.roles) && filters.roles.length > 0) {
      const roles = filters.roles.map(r => r.toLowerCase());
      if (roles.includes('admin')) {
        const list = await db.collection('users').find({ role: 'admin' }).project({ username: 1, email: 1, phone: 1, city: 1, state: 1 }).toArray();
        recipients.push(...list);
      }
      if (roles.includes('delivery')) {
        const list = await db.collection('driver_profiles').find({}).project({ employeeId: 1, email: 1, phone: 1 }).toArray();
        recipients.push(...list.map(u => ({ username: u.employeeId, email: u.email, phone: u.phone })));
      }
      if (roles.includes('staff')) {
        const list = await db.collection('staffusers').find({}).project({ email: 1, phone: 1 }).toArray();
        recipients.push(...list.map(u => ({ username: u.email, email: u.email, phone: u.phone })));
      }
      if (roles.includes('accountant')) {
        const list = await db.collection('accountantusers').find({}).project({ email: 1, phone: 1 }).toArray();
        recipients.push(...list.map(u => ({ username: u.email, email: u.email, phone: u.phone })));
      }

      if (filters.city || filters.state || filters.shopType) {
        recipients = recipients.filter(u => {
          if (filters.city && u.city !== filters.city) return false;
          if (filters.state && u.state !== filters.state) return false;
          if (filters.shopType && u.shopType !== filters.shopType) return false;
          return true;
        });
      }
    } else {
      const q = {};
      if (filters.city) q.city = filters.city;
      if (filters.state) q.state = filters.state;
      if (filters.shopType) q.shopType = filters.shopType;
      
      recipients = await db.collection('users').find(q).project({ username: 1, email: 1, phone: 1 }).toArray();
      
      if (filters.planName) {
        const matched = [];
        for (const u of recipients) {
          const s = await db.collection('settings').findOne({ username: u.username });
          if (s && s.planName === filters.planName) matched.push(u);
        }
        recipients = matched;
      }
    }

    const sample = recipients.slice(0, 50).map(u => ({ username: u.username, email: u.email || '', phone: u.phone || '' }));
    return res.json({ status: 'success', total: recipients.length, sample });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getMyNotifications(req, res) {
  try {
    const db = getDB();
    const { username } = req.query;
    if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
    const list = await db.collection('sa_notifications')
      .find({ username })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return res.json({ status: 'success', notifications: list });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function sendInvoiceWhatsApp(req, res) {
  try {
    const { invoiceId, phone, customNote, upiVpa } = req.body;
    if (!phone) return res.status(400).json({ status: 'error', message: 'phone number is required' });

    const db = getDB();
    let invoice = null;
    if (invoiceId) {
      if (ObjectId.isValid(invoiceId)) {
        invoice = await db.collection('invoices').findOne({ _id: new ObjectId(invoiceId) });
      }
      if (!invoice) {
        invoice = await db.collection('invoices').findOne({ $or: [{ id: invoiceId }, { invoiceNumber: invoiceId }] });
      }
    } else if (req.body.invoice) {
      invoice = req.body.invoice;
    }

    if (!invoice) return res.status(404).json({ status: 'error', message: 'Invoice not found' });

    const settings = await db.collection('settings').findOne({}) || {};
    const business = {
      name: settings.businessName || 'Vyapar Merchant',
      phone: settings.phone || ''
    };

    let upiPaymentLink = null;
    const vpa = upiVpa || settings.upiId || settings.vpa;
    const dueAmt = invoice.balanceDue ?? (invoice.totalAmount - (invoice.paidAmount || 0));
    if (vpa && dueAmt > 0) {
      try {
        const { generateUPIString } = require('../services/paymentService');
        upiPaymentLink = generateUPIString({
          vpa,
          merchantName: business.name,
          amount: dueAmt,
          invoiceId: invoice.invoiceNumber || invoiceId,
          note: `Bill #${invoice.invoiceNumber || invoiceId}`
        });
      } catch (e) {
        console.warn('UPI link generation skipped:', e.message);
      }
    }

    const messageText = communicationService.formatInvoiceMessage({
      invoice,
      business,
      upiPaymentLink
    });

    const finalMsg = customNote ? `${messageText}\n\n📝 Note: ${customNote}` : messageText;
    const result = await communicationService.sendWhatsApp({
      to: phone,
      text: finalMsg
    });

    return res.json({
      status: 'success',
      message: result.dryrun ? 'Dry-run message logged' : 'WhatsApp sent successfully',
      result,
      deepLink: communicationService.generateWhatsAppDeepLink({ phone, text: finalMsg })
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function sendInvoiceSMS(req, res) {
  try {
    const { invoiceId, phone } = req.body;
    if (!phone) return res.status(400).json({ status: 'error', message: 'phone number is required' });

    const db = getDB();
    let invoice = null;
    if (invoiceId) {
      if (ObjectId.isValid(invoiceId)) {
        invoice = await db.collection('invoices').findOne({ _id: new ObjectId(invoiceId) });
      }
      if (!invoice) {
        invoice = await db.collection('invoices').findOne({ $or: [{ id: invoiceId }, { invoiceNumber: invoiceId }] });
      }
    } else if (req.body.invoice) {
      invoice = req.body.invoice;
    }

    if (!invoice) return res.status(404).json({ status: 'error', message: 'Invoice not found' });

    const settings = await db.collection('settings').findOne({}) || {};
    const bizName = settings.businessName || 'Vyapar Merchant';
    const invNo = invoice.invoiceNumber || invoiceId;
    const total = Number(invoice.totalAmount || 0).toLocaleString('en-IN');
    const due = Number(invoice.balanceDue ?? (invoice.totalAmount - (invoice.paidAmount || 0))).toLocaleString('en-IN');

    const smsText = `Dear Customer, Invoice #${invNo} for Rs.${total} is generated by ${bizName}. Balance: Rs.${due}. Thank you!`;

    const result = await communicationService.sendSMS({ to: phone, message: smsText });
    return res.json({ status: 'success', message: 'SMS sent successfully', result });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function generateWhatsAppShareLink(req, res) {
  try {
    const { phone, invoiceId, customText } = req.body;
    if (!phone) return res.status(400).json({ status: 'error', message: 'phone number is required' });

    let text = customText;
    if (!text && invoiceId) {
      const db = getDB();
      let invoice = null;
      if (ObjectId.isValid(invoiceId)) {
        invoice = await db.collection('invoices').findOne({ _id: new ObjectId(invoiceId) });
      }
      if (!invoice) {
        invoice = await db.collection('invoices').findOne({ $or: [{ id: invoiceId }, { invoiceNumber: invoiceId }] });
      }
      if (invoice) {
        const settings = await db.collection('settings').findOne({}) || {};
        text = communicationService.formatInvoiceMessage({
          invoice,
          business: { name: settings.businessName || 'Vyapar Merchant' }
        });
      }
    }

    const deepLink = communicationService.generateWhatsAppDeepLink({
      phone,
      text: text || 'Greetings from Vyapar!'
    });

    return res.json({ status: 'success', deepLink });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function sendOTPEndpoint(req, res) {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ status: 'error', message: 'phone and otp are required' });
    const result = await communicationService.sendSMS({ to: phone, otp });
    return res.json({ status: 'success', message: 'OTP dispatched', result });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports.getAlertsConfig = getAlertsConfig;
module.exports.updateAlertsConfig = updateAlertsConfig;
module.exports.triggerExpiryReminders = triggerExpiryReminders;
module.exports.previewRecipients = previewRecipients;
module.exports.getActiveAlerts = getActiveAlerts;
module.exports.sendReminder = sendReminder;
module.exports.getMyNotifications = getMyNotifications;
module.exports.sendInvoiceWhatsApp = sendInvoiceWhatsApp;
module.exports.sendInvoiceSMS = sendInvoiceSMS;
module.exports.generateWhatsAppShareLink = generateWhatsAppShareLink;
module.exports.sendOTPEndpoint = sendOTPEndpoint;
