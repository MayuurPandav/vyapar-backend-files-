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
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('pass123', 10);
    await db.collection('driver_profiles').updateOne(
      { employeeId: 'DP-1001' },
      {
        $set: {
          employeeId: 'DP-1001',
          fullName: 'Ramesh Pawar (DP-1001)',
          email: 'ramesh.driver@vyapar.com',
          phone: '9876543299',
          passwordHash: hash,
          vehicleNumber: 'MH-02-CD-5544',
          status: 'available',
          isAvailable: true,
          active: true,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    await db.collection('parties').updateMany(
      { email: '' },
      { $unset: { email: '' } }
    );
    console.log('✅ Admin demo profile & driver DP-1001 seeded successfully, empty emails unset.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to seed admin settings:', err);
    process.exit(1);
  }
}

seedAdminSettings();
