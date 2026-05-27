// Normalizes legacy seed data: parses stringified `items` and coerces numeric fields
const { getDBClient } = require('../config/db');

async function run() {
  const client = await getDBClient();
  const db = client.db();
  console.log('Connected. Normalizing data...');

  // Sales & Purchases: parse items if string
  for (const col of ['sales','purchases']) {
    const cursor = db.collection(col).find({});
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      let changed = false;
      if (doc.items && typeof doc.items === 'string') {
        try { const parsed = JSON.parse(doc.items); await db.collection(col).updateOne({ _id: doc._id }, { $set: { items: parsed } }); changed = true; }
        catch (e) { }
      }
      if (changed) console.log(`Normalized ${col} ${doc._id}`);
    }
  }

  // Products: ensure numeric stock/price
  await db.collection('products').find({}).forEach(async p => {
    const updates = {};
    if (p.stock && typeof p.stock !== 'number') updates.stock = Number(p.stock) || 0;
    if (p.price && typeof p.price !== 'number') updates.price = Number(p.price) || 0;
    if (Object.keys(updates).length) await db.collection('products').updateOne({ _id: p._id }, { $set: updates });
  });

  // Parties: balance numeric
  await db.collection('parties').find({}).forEach(async p => {
    if (p.balance && typeof p.balance !== 'number') {
      await db.collection('parties').updateOne({ _id: p._id }, { $set: { balance: Number(p.balance) || 0 } });
    }
  });

  console.log('Normalization complete.');
  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
