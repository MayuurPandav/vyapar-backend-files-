const { connectDB, getDB } = require('../config/db');

async function seedAdminSettings() {
  try {
    await connectDB();
    const db = getDB();
    await db.collection('settings').updateOne(
      { username: 'admin@vyapar.com' },
      {
        $set: {
          username: 'admin@vyapar.com',
          businessName: 'Vyapar Trade Hub',
          gstin: '27AABCV1234F1Z5',
          phone: '9876543210',
          email: 'admin@vyapar.com',
          address: '101, Commercial Center, Nariman Point, Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          plan: 'Enterprise Pro',
          subscriptionExpiry: '2028-12-31',
          profileComplete: true,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    console.log('✅ Admin demo profile & subscription seeded with active status.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to seed admin settings:', err);
    process.exit(1);
  }
}

seedAdminSettings();
