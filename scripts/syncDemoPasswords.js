const { connectDB, getDB } = require('../config/db');
const bcrypt = require('bcryptjs');

async function sync() {
  await connectDB();
  const db = getDB();
  const salt = await bcrypt.genSalt(10);
  
  const hashAdmin = await bcrypt.hash('admin123', salt);
  const hashSuper = await bcrypt.hash('superadmin123', salt);
  const hashCashier = await bcrypt.hash('cashier123', salt);
  const hashDriver = await bcrypt.hash('driver123', salt);
  const hashAccountant = await bcrypt.hash('accountant123', salt);
  const hashPass = await bcrypt.hash('pass123', salt);

  const updates = [
    { username: 'admin@vyapar.com', password: hashAdmin, role: 'admin' },
    { username: 'admin@example.com', password: hashAdmin, role: 'admin' },
    { username: 'superadmin@vyapar.com', password: hashSuper, role: 'super_admin' },
    { username: 'superadmin@example.com', password: hashSuper, role: 'super_admin' },
    { username: 'cashier@vyapar.com', password: hashCashier, role: 'cashier' },
    { username: 'accountant@vyapar.com', password: hashAccountant, role: 'accountant' },
    { username: 'driver@vyapar.com', password: hashDriver, role: 'driver' },
    { username: 'staff@vyapar.com', password: hashPass, role: 'staff' },
    { username: 'DP-1001', password: hashPass, role: 'deliveryboy' }
  ];

  for (const item of updates) {
    await db.collection('users').updateOne(
      { username: item.username },
      {
        $set: {
          username: item.username,
          password: item.password,
          role: item.role,
          accountStatus: 'active',
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    console.log(`Verified & synced user: ${item.username} (${item.role})`);
  }

  console.log('SUCCESS: All demo accounts are active and verified in database!');
  process.exit(0);
}

sync().catch(err => {
  console.error(err);
  process.exit(1);
});
