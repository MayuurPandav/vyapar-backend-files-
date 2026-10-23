const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || 'vyapar_db';

if (!uri) {
  console.error('MONGO_URI is not defined in .env');
  process.exit(1);
}

async function reset() {
  console.log('Connecting to database...');
  await mongoose.connect(uri, { dbName });
  console.log('Connected!');

  const salt = await bcrypt.genSalt(10);

  // 1. Reset Staff / Cashier passwords in 'staffusers' collection
  const staffPass = await bcrypt.hash('staff123', salt);
  const cashierPass = await bcrypt.hash('cashier123', salt);

  await mongoose.connection.db.collection('staffusers').updateOne(
    { email: 'staff@vyapar.com' },
    { $set: { password: staffPass } }
  );
  console.log('Updated staff@vyapar.com password to "staff123"');

  await mongoose.connection.db.collection('staffusers').updateOne(
    { email: 'cashier@vyapar.com' },
    { $set: { password: cashierPass } }
  );
  console.log('Updated cashier@vyapar.com password to "cashier123"');

  // 2. Reset Accountant password in 'accountantusers' collection
  const accountantPass = await bcrypt.hash('accountant123', salt);
  await mongoose.connection.db.collection('accountantusers').updateOne(
    { email: 'accountant@vyapar.com' },
    { $set: { password: accountantPass } }
  );
  console.log('Updated accountant@vyapar.com password to "accountant123"');

  console.log('\nAll resets complete! Exiting...');
  process.exit(0);
}

reset().catch(e => {
  console.error(e);
  process.exit(1);
});
