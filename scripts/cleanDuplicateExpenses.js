const { connectDB } = require('../config/db');

async function cleanDuplicates() {
  console.log('=== CLEAN DUPLICATE EXPENSES ===');
  try {
    const db = await connectDB();
    
    // Delete expenses associated with merchant@vyapar.com
    const result = await db.collection('expenses').deleteMany({ username: 'merchant@vyapar.com' });
    console.log(`Successfully deleted ${result.deletedCount} duplicate expenses of merchant@vyapar.com`);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

cleanDuplicates();
