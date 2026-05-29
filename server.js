const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { connectDB, getDB } = require('./config/db');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
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


// Mount REST APIs
app.use('/api', authRoutes);
app.use('/api', dbRoutes);
// Admin APIs (delivery, barcode, etc.)
app.use('/api/admin', require('./routes/deliveryRoutes'));
app.use('/api/admin', require('./routes/reportRoutes'));
// Offers and notifications admin APIs
app.use('/api/admin/offers', require('./routes/offerRoutes'));
app.use('/api/admin/notifications', require('./routes/notificationRoutes'));
app.use('/api/super', superRoutes);
app.use('/api/user/payments', require('./controllers/superController').getUserPayments);



// Catch-all route to serve the SPA (React routing support)
app.get('/login', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});
app.get('/super_admin.html', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// Database Initialization & Start-up
async function init() {
  try {
    const db = await connectDB();

    // Create collections if they don't exist
    const collectionsToCreate = ['products', 'sales', 'purchases', 'parties', 'transactions', 'settings', 'users', 'sa_plans', 'sa_payments', 'sa_config', 'sa_audit', 'deliveries', 'delivery_boys', 'barcodes', 'offers', 'driver_profiles', 'driver_deliveries'];
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

    app.listen(PORT, () => {
      console.log(`SERVER START: Vyapar Express Server running on http://localhost:${PORT}`);
    });

    // Auto-reports cron skeleton (runs once a day at midnight)
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        console.log('[CRON] Generating and emailing daily auto-reports...');
        // Logic to aggregate reports and send via email service (e.g. SendGrid/Nodemailer)
      }
    }, 60 * 1000); // check every minute

  } catch (err) {
    console.error('SERVER FAILED TO START:', err);
    process.exit(1);
  }
}

init();
