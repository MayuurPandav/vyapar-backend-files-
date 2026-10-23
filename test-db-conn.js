require('dns').setDefaultResultOrder('ipv4first');
require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/';
const dbName = process.env.MONGO_DB_NAME || 'vyapar_db';

(async () => {
  console.log('Testing MongoDB connection to:', uri);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db(dbName);
    await db.command({ ping: 1 });
    console.log('RESULT: OK - Connected to database', dbName);
    await client.close();
    process.exit(0);
  } catch (err) {
    console.error('RESULT: ERROR -', err.message);
    if (client) await client.close();
    process.exit(1);
  }
})();
