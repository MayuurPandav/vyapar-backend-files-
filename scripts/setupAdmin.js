const { connectDB } = require('../config/db');
const createDemoAdmins = require('./createDemoAdmins');

async function createAdminAccount() {
  console.log('=== VYAPAR SETUP ADMIN ACCOUNT ===');
  try {
    const db = await connectDB();

    // Use the shared helper to create idempotent demo accounts
    const result = await createDemoAdmins(db);

    console.log('✅ Admin and Super Admin accounts created successfully in MongoDB!');
    console.log('   --- BUSINESS ADMIN ACCOUNT ---');
    console.log(`   Username: ${result.admin.username}`);
    console.log(`   Password: ${result.admin.password}`);
    console.log('   Role:     admin');
    console.log('   ------------------------------');
    console.log('   --- SYSTEM SUPER ADMIN ACCOUNT ---');
    console.log(`   Username: ${result.superadmin.username}`);
    console.log(`   Password: ${result.superadmin.password}`);
    console.log('   Role:     super_admin');
    console.log('   ----------------------------------');
    process.exit(0);

  } catch (err) {
    console.error('❌ Error creating admin accounts:', err);
    process.exit(1);
  }
}

createAdminAccount();
