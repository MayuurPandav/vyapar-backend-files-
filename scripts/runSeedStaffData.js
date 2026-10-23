const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const seedStaffData = require('./seedStaffData');

(async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/';
    const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'vyapar_db';
    let mongooseUri = MONGO_URI;
    if (mongooseUri.endsWith('/')) {
      mongooseUri += MONGO_DB_NAME;
    }
    await mongoose.connect(mongooseUri, { dbName: MONGO_DB_NAME });
    console.log('Mongoose connected for seeding.');

    await seedStaffData();

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
