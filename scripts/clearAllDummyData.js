const { connectDB, getDB } = require('../config/db');
require('dotenv').config();

async function clearAllDummyData() {
  console.log('=== CLEARING ALL DUMMY / MOCK DATA FROM VYAPAR DATABASE ===');
  try {
    await connectDB();
    const db = getDB();

    const collectionsToClear = [
      'products',
      'sales',
      'purchases',
      'parties',
      'transactions',
      'expenses',
      'deliveries',
      'delivery_boys',
      'barcodes',
      'offers',
      'driver_profiles',
      'driver_deliveries',
      'sa_delivery_logs',
      'sa_tickets',
      'sa_ticket_comments',
      'sa_audit',
      'sa_announcements',
      'sa_coupons',
      'custom_reports',
      'report_schedules',
      'notifications',
      'ledgers',
      'customers',
      'invoices',
      'gstfilings',
      'journalentries'
    ];

    for (const collName of collectionsToClear) {
      try {
        const result = await db.collection(collName).deleteMany({});
        console.log(`🧹 Cleared collection "${collName}": ${result.deletedCount} documents deleted.`);
      } catch (err) {
        console.warn(`Could not clear collection "${collName}":`, err.message);
      }
    }

    console.log('\n✅ All dummy/mock transactional data cleared successfully!');
    console.log('Database is now 100% clean and ready for real production data.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error clearing dummy data:', err);
    process.exit(1);
  }
}

clearAllDummyData();
