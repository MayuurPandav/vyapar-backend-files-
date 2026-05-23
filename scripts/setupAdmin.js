const { connectDB, getDB } = require('../config/db');

async function createAdminAccount() {
  console.log('=== VYAPAR SETUP ADMIN ACCOUNT ===');
  try {
    const db = await connectDB();

    // Clean old
    await db.collection('users').deleteOne({ username: 'admin@vyapar.com' });
    await db.collection('settings').deleteOne({ username: 'admin@vyapar.com' });
    await db.collection('users').deleteOne({ username: 'superadmin@vyapar.com' });
    await db.collection('settings').deleteOne({ username: 'superadmin@vyapar.com' });

    // Create admin user (regular business user with full seeded ledger data)
    await db.collection('users').insertOne({
      username: 'admin@vyapar.com',
      password: 'admin123',
      role: 'admin',
      status: 'active',
      phone: '9999999999'
    });

    // Create settings for admin
    await db.collection('settings').insertOne({
      username: 'admin@vyapar.com',
      bizName: 'Vyapar Demo',
      theme: 'light',
      email: 'admin@vyapar.com',
      phone: '9999999999',
      isGstVerified: 0,
      isPhoneVerified: 0,
      isEmailVerified: 0,
      isWhatsappVerified: 0,
      planName: 'Bronze',
      planCycle: 'MONTHLY'
    });

    // Create super_admin user (Master Control Center access)
    await db.collection('users').insertOne({
      username: 'superadmin@vyapar.com',
      password: 'admin123',
      role: 'super_admin',
      status: 'active',
      phone: '8888888888'
    });

    // Create settings for super_admin
    await db.collection('settings').insertOne({
      username: 'superadmin@vyapar.com',
      bizName: 'Vyapar Cloud Master',
      theme: 'dark',
      email: 'superadmin@vyapar.com',
      phone: '8888888888',
      isGstVerified: 1,
      isPhoneVerified: 1,
      isEmailVerified: 1,
      isWhatsappVerified: 1,
      planName: 'Premium',
      planCycle: 'YEARLY'
    });

    console.log('✅ Admin and Super Admin accounts created successfully in MongoDB!');
    console.log('   --- BUSINESS ADMIN ACCOUNT ---');
    console.log('   Username: admin@vyapar.com');
    console.log('   Password: admin123');
    console.log('   Role:     admin');
    console.log('   ------------------------------');
    console.log('   --- SYSTEM SUPER ADMIN ACCOUNT ---');
    console.log('   Username: superadmin@vyapar.com');
    console.log('   Password: admin123');
    console.log('   Role:     super_admin');
    console.log('   ----------------------------------');
    process.exit(0);

  } catch (err) {
    console.error('❌ Error creating admin accounts:', err);
    process.exit(1);
  }
}

createAdminAccount();
