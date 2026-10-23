const { connectDB } = require('../config/db');

async function findDrivers() {
  console.log('=== FIND DELIVERY BOYS & DRIVERS ===');
  try {
    const db = await connectDB();

    // Check 'delivery_boys' collection
    const boys = await db.collection('delivery_boys').find({}).toArray();
    console.log('\n--- Collection: delivery_boys ---');
    boys.forEach(b => {
      console.log(`- _id: ${b._id}, Name: ${b.name}, Phone: ${b.phone}, Password: ${b.password}, Username: ${b.username}`);
    });

    // Check 'driver_profiles' collection
    const profiles = await db.collection('driver_profiles').find({}).toArray();
    console.log('\n--- Collection: driver_profiles ---');
    profiles.forEach(p => {
      console.log(`- _id: ${p._id}, FullName: ${p.fullName}, Phone: ${p.phone}, PasswordHash: ${p.passwordHash}, EmployeeId: ${p.employeeId}, Email: ${p.email}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

findDrivers();
