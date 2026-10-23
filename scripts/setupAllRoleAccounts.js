const { connectDB, getDB } = require('../config/db');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function setupAllRoleAccounts() {
  console.log('=== SETTING UP CLEAN UNIFIED ROLE ACCOUNTS FOR VYAPAR 2.0 ===');
  try {
    await connectDB();
    const db = getDB();
    const salt = await bcrypt.genSalt(10);

    const accounts = [
      { username: 'admin@vyapar.com', password: 'admin123', role: 'admin', name: 'Vyapar Shop Admin' },
      { username: 'superadmin@vyapar.com', password: 'superadmin123', role: 'super_admin', name: 'System Super Admin' },
      { username: 'accountant@vyapar.com', password: 'accountant123', role: 'accountant', name: 'Head Accountant' },
      { username: 'cashier@vyapar.com', password: 'cashier123', role: 'cashier', name: 'POS Cashier Operator' },
      { username: 'driver@vyapar.com', password: 'driver123', role: 'driver', name: 'Ramesh Pawar (Delivery Driver)' }
    ];

    for (const acc of accounts) {
      const passwordHash = await bcrypt.hash(acc.password, salt);
      await db.collection('users').updateOne(
        { username: acc.username },
        {
          $set: {
            username: acc.username,
            password: passwordHash,
            role: acc.role,
            name: acc.name,
            accountStatus: 'active',
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
      console.log(`👤 Created/Updated user: ${acc.username} (${acc.role})`);
    }

    console.log('\n🎉 ALL ROLE ACCOUNTS SET UP SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error setting up role accounts:', err);
    process.exit(1);
  }
}

setupAllRoleAccounts();
