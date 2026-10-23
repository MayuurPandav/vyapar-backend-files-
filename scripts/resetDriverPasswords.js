const { connectDB } = require('../config/db');
const bcrypt = require('bcryptjs');

async function resetDriverPasswords() {
  console.log('=== RESET DRIVER PASSWORDS ===');
  try {
    const db = await connectDB();
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash('admin123', salt);

    const result = await db.collection('driver_profiles').updateMany(
      {},
      { $set: { passwordHash: newHash } }
    );

    console.log(`Successfully reset passwords for ${result.modifiedCount} drivers to "admin123"`);
    
    // Print all driver details
    const drivers = await db.collection('driver_profiles').find({}).toArray();
    console.log('\nAvailable Driver Accounts (Password: "admin123"):');
    drivers.forEach(d => {
      console.log(`- ID/Username: ${d.employeeId} (or email: ${d.email}), Name: ${d.fullName}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

resetDriverPasswords();
