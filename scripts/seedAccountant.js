const { connectDB } = require('../config/db');
const bcrypt = require('bcryptjs');

async function seedAccountant() {
  console.log('=== VYAPAR SETUP ACCOUNTANT ACCOUNT ===');
  try {
    const db = await connectDB();

    const email = 'accountant@vyapar.com';
    const plainPassword = 'accountant123';
    
    // Check if the accountant user already exists
    const existing = await db.collection('accountantusers').findOne({ email });
    if (existing) {
      console.log(`Accountant user ${email} already exists! Resetting password to ${plainPassword}...`);
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(plainPassword, salt);
      await db.collection('accountantusers').updateOne(
        { email },
        { $set: { password: hashed } }
      );
      console.log('✅ Password reset successful!');
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(plainPassword, salt);

    const accountantUser = {
      name: 'Vyapar Accountant',
      email,
      password: hashed,
      role: 'accountant',
      employeeId: 'EMP-2026-AC101',
      phone: '9999999999',
      createdAt: new Date()
    };

    await db.collection('accountantusers').insertOne(accountantUser);
    console.log('✅ Accountant account created successfully in MongoDB!');
    console.log('   Email:    ' + email);
    console.log('   Password: ' + plainPassword);
    console.log('   Role:     accountant');
    console.log('   Emp ID:   ' + accountantUser.employeeId);
    process.exit(0);

  } catch (err) {
    console.error('❌ Error creating accountant account:', err);
    process.exit(1);
  }
}

seedAccountant();
