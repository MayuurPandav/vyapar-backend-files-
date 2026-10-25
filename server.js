// Fix: Force IPv4-first DNS to resolve MongoDB Atlas SRV records correctly on IPv6 systems
require('dns').setDefaultResultOrder('ipv4first');

// Suppress unhandled Redis ECONNREFUSED errors when local Redis service is not installed
process.on('uncaughtException', (err) => {
  if (err && err.code === 'ECONNREFUSED' && (err.port === 6379 || err.message?.includes('6379'))) {
    return;
  }
  console.error('[UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
  if (reason && reason.code === 'ECONNREFUSED' && (reason.port === 6379 || reason.message?.includes('6379'))) {
    return;
  }
  console.error('[UNHANDLED REJECTION]', reason);
});

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { connectDB, getDB } = require('./config/db');

require('dotenv').config();

// Polyfill `fetch` on Node versions that don't provide it (Node < 18).
// Uses node-fetch v2 when available (added to package.json below).
if (typeof fetch === 'undefined') {
  try {
    global.fetch = require('node-fetch');
    console.log('POLYFILL: node-fetch installed and global.fetch set');
  } catch (e) {
    console.warn('POLYFILL: node-fetch not installed; external HTTP providers may fail');
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use((req, res, next) => {
  console.log(`[REQUEST LOG] ${req.method} ${req.originalUrl}`);
  next();
});
app.use(cookieParser());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Express Static Directory Configuration
// In production, Vite builds the React client into the frontend/dist folder
const FRONTEND_DIR = path.resolve(__dirname, '../frontend/dist');
app.use(express.static(FRONTEND_DIR));

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Import Route modules
const authRoutes = require('./routes/authRoutes');
const dbRoutes = require('./routes/dbRoutes');
const superRoutes = require('./routes/superRoutes');
const healthRoutes = require('./routes/healthRoutes');
const driverRoutes = require('./routes/driverRoutes');
const shopProfileRoutes = require('./routes/shopProfileRoutes');
const accountantRoutes = require('./routes/accountantRoutes');
const staffRoutes = require('./routes/staffRoutes');


// Mount REST APIs
app.use('/api', authRoutes);
app.use('/api', healthRoutes);
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/payment', require('./routes/paymentRoutes'));
app.use('/api', driverRoutes);
app.use('/api', dbRoutes);
// Admin APIs (delivery, barcode, etc.)
app.use('/api/admin', require('./routes/deliveryRoutes'));
app.use('/api/admin', require('./routes/reportRoutes'));
// Offers and notifications admin APIs
app.use('/api/admin/offers', require('./routes/offerRoutes'));
app.use('/api/admin/notifications', require('./routes/notificationRoutes'));
// tracking endpoints for opens / clicks
app.use('/api/track', require('./routes/trackRoutes'));
app.use('/api/super/shop-profile', shopProfileRoutes);
app.use('/api/super', superRoutes);
app.use('/api/super/billing', require('./routes/billingRoutes'));
app.use('/api/accountant', accountantRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/user/payments', require('./controllers/superController').getUserPayments);

// Direct download route for the official presentation deck
const handleDownloadPPTX = (req, res) => {
  const pptxNames = ['Vyapar_2.0_Official_Presentation.pptx', 'Vyapar_2.0_Presentation.pptx'];
  for (const name of pptxNames) {
    const rootPath = path.resolve(__dirname, '..', name);
    if (fs.existsSync(rootPath)) {
      return res.download(rootPath, name);
    }
    const pubPath = path.resolve(__dirname, '../frontend/public', name);
    if (fs.existsSync(pubPath)) {
      return res.download(pubPath, name);
    }
  }
  return res.status(404).send('Presentation file not found');
};

app.get('/api/download-pptx', handleDownloadPPTX);
app.get('/download-pptx', handleDownloadPPTX);



// Generic error handler to ensure JSON responses for uncaught errors
app.use((err, req, res, next) => {
  console.error('UNHANDLED ERROR:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ status: 'error', message: err && err.message ? err.message : 'Internal server error' });
});

// Root healthcheck & status (Immediate 200 OK for Render / cloud health probes)
app.get('/', (req, res) => {
  if (fs.existsSync(path.join(FRONTEND_DIR, 'index.html'))) {
    return res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  }
  res.json({ status: 'ok', service: 'Vyapar 2.0 Backend API', timestamp: new Date().toISOString() });
});

// Catch-all route to serve the SPA if frontend build exists
app.get('*', (req, res) => {
  if (fs.existsSync(path.join(FRONTEND_DIR, 'index.html'))) {
    return res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  }
  res.status(404).json({ error: 'Endpoint not found', apiDocs: '/api/health' });
});

// Database Initialization & Start-up
async function init() {
  try {
    const db = await connectDB();

    // Initialize Mongoose Connection
    const mongoose = require('mongoose');
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/';
    const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'vyapar_db';
    let mongooseUri = MONGO_URI;
    if (mongooseUri.endsWith('/')) {
      mongooseUri += MONGO_DB_NAME;
    }
    await mongoose.connect(mongooseUri, { dbName: MONGO_DB_NAME });
    console.log('MONGOOSE READY: MongoDB connected via Mongoose successfully');

    // Create collections if they don't exist
    const collectionsToCreate = ['products', 'sales', 'purchases', 'parties', 'transactions', 'settings', 'users', 'sa_plans', 'sa_payments', 'sa_config', 'sa_audit', 'deliveries', 'delivery_boys', 'barcodes', 'offers', 'driver_profiles', 'driver_deliveries', 'sa_shop_profile', 'sa_shop_branches', 'sa_coupons', 'sa_refunds', 'sa_notifications', 'sa_announcements', 'sa_templates', 'sa_delivery_logs', 'sa_tickets', 'sa_ticket_comments', 'sa_archived_data', 'sa_faqs', 'sa_chat_threads', 'sa_chat_messages', 'custom_reports', 'report_schedules', 'notification_configs'];
    const existingCollections = (await db.listCollections().toArray()).map(c => c.name);

    for (const name of collectionsToCreate) {
      if (!existingCollections.includes(name)) {
        await db.createCollection(name);
      }
    }

    // Create Indexes
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('settings').createIndex({ username: 1 }, { unique: true });
    await db.collection('sa_plans').createIndex({ name: 1 }, { unique: true });
    await db.collection('products').createIndex({ username: 1 });
    await db.collection('sales').createIndex({ username: 1 });
    await db.collection('purchases').createIndex({ username: 1 });
    await db.collection('parties').createIndex({ username: 1 });
    await db.collection('transactions').createIndex({ username: 1 });
    await db.collection('sa_delivery_logs').createIndex({ announcementId: 1 });
    await db.collection('sa_delivery_logs').createIndex({ username: 1 });
    await db.collection('custom_reports').createIndex({ username: 1 });
    await db.collection('report_schedules').createIndex({ username: 1 });
    await db.collection('notification_configs').createIndex({ username: 1 }, { unique: true });

    // Initialize Default Plans
    const defaultPlans = [
      { name: 'Bronze', price: 499.00, cycle: 'MONTHLY', features: 'Billing, Basic Reports, Single User' },
      { name: 'Silver', price: 999.00, cycle: 'MONTHLY', features: 'Inventory, Billing, Basic Reports, Multi-User' },
      { name: 'Gold', price: 1999.00, cycle: 'MONTHLY', features: 'AI Insights, Advanced Reports, Multi-user' },
      { name: 'Premium', price: 4999.00, cycle: 'YEARLY', features: 'Priority Support, Custom Branding, Unlimited Users' }
    ];

    for (const plan of defaultPlans) {
      await db.collection('sa_plans').updateOne(
        { name: plan.name },
        { $set: plan },
        { upsert: true }
      );
    }

    // Remove obsolete plans
    const defaultPlanNames = defaultPlans.map(p => p.name);
    await db.collection('sa_plans').deleteMany({ name: { $nin: defaultPlanNames } });

    // Initialize Default System Configs
    const defaultConfigs = {
      'maintenance_mode': 'false',
      'maintenance_message': '',
      'maintenance_schedule': '',
      'broadcast_message': ''
    };

    for (const [key, value] of Object.entries(defaultConfigs)) {
      await db.collection('sa_config').updateOne(
        { _id: key },
        { $set: { config_key: key, config_value: value } },
        { upsert: true }
      );
    }

    // Mount support routes
    try {
      app.use('/api/admin/support', require('./routes/supportRoutes'));
      console.log('[ROUTES] support routes mounted');
    } catch (e) { console.warn('[ROUTES] could not mount support routes', e.message || e); }

    // Analytics routes
    try {
      app.use('/api/admin/analytics', require('./routes/analyticsRoutes'));
      console.log('[ROUTES] analytics routes mounted');
    } catch (e) { console.warn('[ROUTES] analytics routes mount failed', e.message || e); }

    // FAQ routes
    try { app.use('/api/admin/faq', require('./routes/faqRoutes')); console.log('[ROUTES] faq routes'); } catch (e) {}

    // Chat routes
    try { app.use('/api/admin/chat', require('./routes/chatRoutes')); console.log('[ROUTES] chat routes'); } catch (e) {}

    // Ensure demo admin accounts exist in development — create if missing.
    try {
      const superAdmin = await db.collection('users').findOne({ role: 'super_admin' });
      if (!superAdmin) {
        const createDemo = require('./scripts/createDemoAdmins');
        const res = await createDemo(db);
        console.log('DEMO ACCOUNTS CREATED:', res);
      }

      // Auto-seeding disabled to ensure a 100% clean production environment
      // const seedAccountantData = require('./scripts/seedAccountantData');
      // await seedAccountantData();
    } catch (err) {
      console.warn('Could not ensure demo accounts or seed accountant data:', err.message || err);
    }

    const http = require('http');
    const server = http.createServer(app);
    const { Server: SocketIOServer } = require('socket.io');
    const io = new SocketIOServer(server, { cors: { origin: true, credentials: true } });
    global.io = io;
    app.set('socketio', io);

    io.on('connection', (socket) => {
      console.log('Client connected for real-time updates');
    });

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`SERVER START: Vyapar Express Server running on port ${PORT}`);
    });

    // Start announcement scheduler (process scheduled broadcasts)
    try {
      const startAnnouncementScheduler = require('./scheduler/announcementScheduler');
      startAnnouncementScheduler(db);
      console.log('[SCHEDULER] Announcement scheduler initialized');
    } catch (e) {
      console.warn('[SCHEDULER] Could not initialize announcement scheduler:', e.message || e);
    }

    // Start Subscription Dunning Worker (Runs daily checks and every 6 hours)
    try {
      const { processSubscriptionDunning } = require('./workers/dunningWorker');
      // Run once on startup
      processSubscriptionDunning();
      // Schedule to run every 6 hours
      setInterval(processSubscriptionDunning, 6 * 60 * 60 * 1000);
      console.log('[WORKER] Subscription Dunning background worker initialized');
    } catch (e) {
      console.warn('[WORKER] Could not initialize Subscription Dunning worker:', e.message || e);
    }

    // Start queue workers if Redis configured
    try {
      const announcementWorker = require('./workers/announcementWorker');
      console.log('[WORKER] Announcement worker initialized');
    } catch (e) {
      console.warn('[WORKER] Could not initialize announcement worker:', e.message || e);
    }

    // ============================================================
    // AUTOMATED AUTO-REPORTS SCHEDULER CRON (runs every minute, checks at midnight)
    // ============================================================
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        console.log('[CRON] Running Automated Reports Scheduler...');
        try {
          const reportController = require('./controllers/reportController');
          const schedules = await db.collection('report_schedules').find().toArray();
          for (const s of schedules) {
            let shouldSend = false;
            const lastSent = s.lastSent ? new Date(s.lastSent) : null;
            if (!lastSent) {
              shouldSend = true;
            } else {
              const diffMs = now - lastSent;
              const diffDays = diffMs / (1000 * 60 * 60 * 24);
              if (s.frequency === 'daily' && diffDays >= 0.9) shouldSend = true;
              else if (s.frequency === 'weekly' && diffDays >= 6.9) shouldSend = true;
              else if (s.frequency === 'monthly' && diffDays >= 29.9) shouldSend = true;
            }
            
            if (shouldSend) {
              console.log(`[CRON] Dispatching auto-report to ${s.email} for shop ${s.username}`);
              try {
                await reportController.sendScheduledReportEmail(db, s);
              } catch (mailErr) {
                console.error(`[CRON] Mail dispatch failed for schedule ${s._id}:`, mailErr.message);
              }
            }
          }
        } catch (e) {
          console.error('[CRON] Auto-reports scheduler failed:', e);
        }
      }
    }, 60 * 1000);

    // ============================================================
    // SUBSCRIPTION EXPIRY LIFECYCLE CRON (runs every minute, acts at midnight)
    // ============================================================
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        // Distributed Lock: check/create a lock for today's date
        const todayKey = `lock_subscription_${now.toISOString().substring(0, 10)}`;
        try {
          const lockResult = await db.collection('sa_config').updateOne(
            { _id: todayKey },
            { $setOnInsert: { config_key: todayKey, config_value: 'locked', lockedAt: new Date() } },
            { upsert: true }
          );
          if (lockResult.upsertedCount === 0 && lockResult.matchedCount > 0) {
            console.log(`[CRON] Subscription Expiry Lifecycle already executed on another instance today (Lock: ${todayKey}). Skipping.`);
            return;
          }
        } catch (lockErr) {
          console.warn('[CRON] Failed to acquire distributed lock, skipping cron to be safe:', lockErr.message);
          return;
        }

        console.log(`[CRON] Running Subscription Expiry Lifecycle (Lock: ${todayKey} acquired successfully)...`);
        
        try {
          const allSettings = await db.collection('settings').find({ subscriptionExpiry: { $exists: true, $ne: null } }).toArray();
          
          for (const s of allSettings) {
            const expiry = new Date(s.subscriptionExpiry);
            if (isNaN(expiry)) continue;
            
            const diffMs = expiry - now;
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            const username = s.username;
            
            // --- PRE-EXPIRY NOTIFICATIONS (7 / 3 / 1 days before) ---
            if (diffDays === 7) {
              await db.collection('sa_notifications').insertOne({
                username, type: 'warning', severity: 'low',
                title: 'Subscription Expiring Soon',
                message: `Your subscription expires in 7 days (${expiry.toISOString().substring(0,10)}). Please renew to avoid service interruption.`,
                createdAt: new Date(), read: false
              });
              console.log(`[CRON] 7-day warning sent to ${username}`);
            }
            
            if (diffDays === 3) {
              await db.collection('sa_notifications').insertOne({
                username, type: 'reminder', severity: 'medium',
                title: 'Subscription Expiry Reminder',
                message: `Your subscription expires in 3 days (${expiry.toISOString().substring(0,10)}). Renew now to keep full access.`,
                createdAt: new Date(), read: false
              });
              console.log(`[CRON] 3-day reminder sent to ${username}`);
            }
            
            if (diffDays === 1) {
              await db.collection('sa_notifications').insertOne({
                username, type: 'urgent', severity: 'high',
                title: 'URGENT: Subscription Expires Tomorrow',
                message: `Your subscription expires TOMORROW (${expiry.toISOString().substring(0,10)}). After expiry you will enter a 7-day read-only grace period.`,
                createdAt: new Date(), read: false
              });
              console.log(`[CRON] 1-day urgent alert sent to ${username}`);
            }
            
            // --- PLAN EXPIRED: Enter Grace Period (0 to -7 days) ---
            if (diffDays <= 0 && diffDays > -7) {
              const currentStatus = await db.collection('users').findOne({ username });
              if (currentStatus && currentStatus.accountStatus !== 'grace' && currentStatus.accountStatus !== 'locked' && currentStatus.accountStatus !== 'archived') {
                await db.collection('users').updateOne({ username }, { $set: { accountStatus: 'grace', graceStartDate: new Date() } });
                await db.collection('sa_notifications').insertOne({
                  username, type: 'expiry', severity: 'high',
                  title: 'Plan Expired – Grace Period Active',
                  message: `Your plan has expired. You have a 7-day grace period with read-only access. Renew to restore full access.`,
                  createdAt: new Date(), read: false
                });
                console.log(`[CRON] Grace period started for ${username}`);
              }
            }
            
            // --- GRACE PERIOD OVER: Lock Account (day -7) ---
            if (diffDays <= -7 && diffDays > -60) {
              const currentStatus = await db.collection('users').findOne({ username });
              if (currentStatus && currentStatus.accountStatus !== 'locked' && currentStatus.accountStatus !== 'archived') {
                await db.collection('users').updateOne({ username }, { $set: { accountStatus: 'locked' } });
                await db.collection('sa_notifications').insertOne({
                  username, type: 'locked', severity: 'critical',
                  title: 'Account Locked',
                  message: `Your grace period has ended and your account is now locked. Your data is safe. Please renew your subscription to regain access.`,
                  createdAt: new Date(), read: false
                });
                console.log(`[CRON] Account locked for ${username}`);
              }
            }
            
            // --- 60 DAYS NO RENEWAL: Deletion Warning ---
            if (diffDays === -60) {
              await db.collection('sa_notifications').insertOne({
                username, type: 'deletion_warning', severity: 'critical',
                title: 'DATA DELETION WARNING',
                message: `Your account has been inactive for 60 days. If you do not renew within 30 days, your data will be permanently archived/deleted.`,
                createdAt: new Date(), read: false
              });
              console.log(`[CRON] 60-day deletion warning sent to ${username}`);
            }
            
            // --- 90 DAYS NO RENEWAL: Archive / Delete ---
            if (diffDays <= -90) {
              const currentStatus = await db.collection('users').findOne({ username });
              if (currentStatus && currentStatus.accountStatus !== 'archived') {
                // Archive user data
                const userData = {
                  username,
                  archivedAt: new Date(),
                  products: await db.collection('products').find({ username }).toArray(),
                  sales: await db.collection('sales').find({ username }).toArray(),
                  purchases: await db.collection('purchases').find({ username }).toArray(),
                  parties: await db.collection('parties').find({ username }).toArray(),
                  transactions: await db.collection('transactions').find({ username }).toArray(),
                  settings: s
                };
                await db.collection('sa_archived_data').insertOne(userData);
                
                // Clean up live data
                await db.collection('products').deleteMany({ username });
                await db.collection('sales').deleteMany({ username });
                await db.collection('purchases').deleteMany({ username });
                await db.collection('parties').deleteMany({ username });
                await db.collection('transactions').deleteMany({ username });
                
                // Mark account as archived
                await db.collection('users').updateOne({ username }, { $set: { accountStatus: 'archived' } });
                await db.collection('sa_notifications').insertOne({
                  username, type: 'archived', severity: 'critical',
                  title: 'Account Data Archived',
                  message: `Your data has been archived after 90 days of inactivity. Contact support to restore.`,
                  createdAt: new Date(), read: false
                });
                console.log(`[CRON] Data archived for ${username}`);
              }
            }
          }
          
          console.log('[CRON] Subscription Expiry Lifecycle completed.');
        } catch (cronErr) {
          console.error('[CRON] Error in expiry lifecycle:', cronErr);
        }
      }
    }, 60 * 1000); // check every minute

    // ============================================================
    // DYNAMIC 3PL DELIVERY STATUS SIMULATOR (runs every 30 seconds)
    // ============================================================
    setInterval(async () => {
      try {
        const { getNext3PLStatus } = require('./controllers/deliveryController');
        const active3PL = await db.collection('deliveries').find({
          partner: { $ne: 'in-house' },
          status: { $nin: ['Delivered', 'failed', 'Failed', 'cancelled', 'Cancelled'] }
        }).toArray();

        for (const delivery of active3PL) {
          const currentStatus = delivery.status || 'pending_partner_pickup';
          const nextStatus = getNext3PLStatus(delivery.partner, currentStatus);
          
          if (nextStatus !== currentStatus) {
            console.log(`[3PL SIMULATOR] Advancing delivery ${delivery.orderId} status from "${currentStatus}" to "${nextStatus}"`);
            
            const now = new Date().toISOString();
            await db.collection('deliveries').updateOne(
              { _id: delivery._id },
              { $set: { status: nextStatus, updatedAt: now } }
            );

            delivery.status = nextStatus;
            delivery.updatedAt = now;

            const socketio = app.get('socketio');
            if (socketio) {
              socketio.emit('delivery_updated', delivery);
            }
          }
        }
      } catch (err) {
        console.error('[3PL SIMULATOR] Error advancing status:', err.message);
      }
    }, 30 * 1000); // Poll and advance status every 30 seconds

  } catch (err) {
    console.error('SERVER FAILED TO START:', err);
    process.exit(1);
  }
}

init();
// reload trigger comment 2
