require('dotenv').config();
const { MongoClient } = require('mongodb');

// Usage:
// SOURCE_URI - if not provided defaults to mongodb://localhost:27017/
// TARGET_URI - required (your Atlas URI)
// DB_NAME - optional, defaults to vyapar_db

const SOURCE_URI = process.env.SOURCE_URI || 'mongodb://localhost:27017/';
const TARGET_URI = process.env.TARGET_URI || process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || process.env.MONGO_DB_NAME || 'vyapar_db';

if (!TARGET_URI) {
  console.error('TARGET_URI (or MONGO_URI in .env) is required. Set it and retry.');
  process.exit(1);
}

(async () => {
  const srcClient = new MongoClient(SOURCE_URI, { serverSelectionTimeoutMS: 5000 });
  const tgtClient = new MongoClient(TARGET_URI, { serverSelectionTimeoutMS: 5000 });
  try {
    console.log('Connecting to source:', SOURCE_URI);
    await srcClient.connect();
    console.log('Connecting to target:', TARGET_URI);
    await tgtClient.connect();

    const srcDb = srcClient.db(DB_NAME);
    const tgtDb = tgtClient.db(DB_NAME);

    // List collections in source DB
    const cols = await srcDb.listCollections().toArray();
    const colNames = cols.map(c => c.name).filter(n => !n.startsWith('system.'));
    console.log('Collections to migrate:', colNames);

    for (const name of colNames) {
      console.log(`Migrating collection: ${name}`);
      const srcColl = srcDb.collection(name);
      const tgtColl = tgtDb.collection(name);

      // optional: drop target collection before migrating
      try {
        await tgtColl.drop();
        console.log(`Dropped existing target collection ${name}`);
      } catch (e) {
        // ignore if not exist
      }

      const cursor = srcColl.find({});
      const batchSize = 500;
      let batch = [];
      let count = 0;
      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        // remove _id to allow insert with new ObjectId in target if desired
        // but preserve it by default
        batch.push(doc);
        if (batch.length >= batchSize) {
          await tgtColl.insertMany(batch);
          count += batch.length;
          console.log(`Inserted ${count} documents into ${name}...`);
          batch = [];
        }
      }
      if (batch.length) {
        await tgtColl.insertMany(batch);
        count += batch.length;
        console.log(`Inserted ${count} documents into ${name} (final).`);
      }

      // replicate indexes
      try {
        const idxs = await srcColl.indexes();
        for (const idx of idxs) {
          if (idx.name === '_id_') continue;
          const key = idx.key;
          const options = { ...idx };
          delete options.key; delete options.ns; delete options.v; delete options.name;
          await tgtColl.createIndex(key, options);
        }
        console.log(`Replicated indexes for ${name}`);
      } catch (e) {
        console.warn(`Could not replicate indexes for ${name}:`, e.message);
      }
    }

    console.log('Migration completed successfully.');
    await srcClient.close();
    await tgtClient.close();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    try { await srcClient.close(); } catch(e){}
    try { await tgtClient.close(); } catch(e){}
    process.exit(1);
  }
})();
