const { MongoClient } = require('mongodb');
const uri = 'mongodb://localhost:27017/';
const dbName = 'vyapar_db';

(async () => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const users = await db.collection('users').find({}).toArray();
    console.log('USERS FOUND IN DATABASE:');
    users.forEach(u => {
      console.log(`Username: ${u.username}, Password: ${u.password}, Role: ${u.role}, Status: ${u.status}`);
    });
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await client.close();
    process.exit(0);
  }
})();
