const { connectDB } = require('../config/db');

async function checkExpenses() {
  console.log('=== CHECK EXPENSES DATABASE (RAW) ===');
  try {
    const db = await connectDB();
    const expenses = await db.collection('expenses').find({}).toArray();
    console.log('Total expenses in DB:', expenses.length);
    expenses.forEach((e, i) => {
      console.log(`Document ${i}:`, JSON.stringify(e));
    });
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkExpenses();
