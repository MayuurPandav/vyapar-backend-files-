const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || 'vyapar_db';

if (!uri) {
  console.error('MONGO_URI is not defined in .env');
  process.exit(1);
}

console.log('Connecting to database...');
mongoose.connect(uri, { dbName }).then(async () => {
  console.log('Connected successfully!');
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  
  console.log(`\nFound ${collections.length} collections in database "${dbName}":\n`);
  
  for (const col of collections) {
    const name = col.name;
    const count = await db.collection(name).countDocuments();
    console.log(`- ${name}: ${count} documents`);
    
    if (count > 0) {
      // Print first 2 documents of each collection to see what it is
      const docs = await db.collection(name).find().limit(2).toArray();
      console.log(`  Sample data:`, JSON.stringify(docs, null, 2));
    }
  }
  
  process.exit(0);
}).catch(e => {
  console.error('Connection error:', e);
  process.exit(1);
});
