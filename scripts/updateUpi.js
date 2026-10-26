const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function updateUpi() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('No MONGO_URI found');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(process.env.MONGO_DB_NAME || 'vyapar_db');
    console.log('Connected to MongoDB Atlas');

    const newUpi = 'mayurpandav128@okhdfcbank';

    // 1. Update shop_profiles
    const spRes = await db.collection('shop_profiles').updateMany(
      {},
      { $set: { upiId: newUpi, upi_id: newUpi, upiQrImage: '/upi_qr.png' } }
    );
    console.log(`Updated ${spRes.matchedCount} shop_profiles (modified ${spRes.modifiedCount})`);

    // 2. Update settings
    const stRes = await db.collection('settings').updateMany(
      {},
      { $set: { upiId: newUpi, upi_id: newUpi, upiQrImage: '/upi_qr.png' } }
    );
    console.log(`Updated ${stRes.matchedCount} settings (modified ${stRes.modifiedCount})`);

    // 3. If no shop_profiles exist, insert a default one for admin
    const count = await db.collection('shop_profiles').countDocuments();
    if (count === 0) {
      await db.collection('shop_profiles').insertOne({
        username: 'admin',
        shopName: 'Vyapar Supermart',
        businessName: 'Vyapar Supermart',
        upiId: newUpi,
        upi_id: newUpi,
        upiQrImage: '/upi_qr.png',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log('Created default shop_profile for admin with UPI ID:', newUpi);
    }

    const sample = await db.collection('shop_profiles').findOne({});
    console.log('Sample shop profile:', sample ? { shopName: sample.shopName, upiId: sample.upiId, upiQrImage: sample.upiQrImage } : 'None');
  } catch (err) {
    console.error('Error updating UPI:', err);
  } finally {
    await client.close();
  }
}

updateUpi();
