const { connectDB } = require('../config/db');

const USERNAME = 'admin@vyapar.com';

async function seed() {
  console.log('=== SEEDING VYAPAR TEST DATA ===');
  try {
    const db = await connectDB();
    const today = new Date();

    // Clear old
    const collections = ['products', 'sales', 'purchases', 'parties', 'transactions', 'settings'];
    for (const c of collections) {
      await db.collection(c).deleteMany({ username: USERNAME });
    }

    // 1. Seed Products (10 items)
    const products = [
      { id: 1, name: 'Samsung Galaxy S24 Ultra', sku: 'SKU-MOB-001', category: 'Electronics', stock: 25, price: 134999.00, notes: 'Flagship smartphone', image: '', username: USERNAME },
      { id: 2, name: 'Apple MacBook Air M3', sku: 'SKU-LAP-002', category: 'Electronics', stock: 12, price: 114900.00, notes: '15-inch Laptop', image: '', username: USERNAME },
      { id: 3, name: 'Sony WH-1000XM5', sku: 'SKU-AUD-003', category: 'Audio', stock: 40, price: 29990.00, notes: 'Noise Cancelling Headphones', image: '', username: USERNAME },
      { id: 4, name: 'JBL Charge 5', sku: 'SKU-AUD-004', category: 'Audio', stock: 35, price: 14999.00, notes: 'Portable Bluetooth Speaker', image: '', username: USERNAME },
      { id: 5, name: 'Nike Air Max 270', sku: 'SKU-FTW-005', category: 'Footwear', stock: 60, price: 12995.00, notes: 'Running Shoes', image: '', username: USERNAME },
      { id: 6, name: 'Apple Watch Series 9', sku: 'SKU-ACC-006', category: 'Accessories', stock: 18, price: 41900.00, notes: 'Smartwatch GPS', image: '', username: USERNAME },
      { id: 7, name: 'Dell UltraSharp 27"', sku: 'SKU-MON-007', category: 'Electronics', stock: 8, price: 45999.00, notes: '4K IPS Monitor', image: '', username: USERNAME },
      { id: 8, name: 'Logitech MX Master 3S', sku: 'SKU-ACC-008', category: 'Accessories', stock: 50, price: 8995.00, notes: 'Wireless Mouse', image: '', username: USERNAME },
      { id: 9, name: 'Canon EOS R6 Mark II', sku: 'SKU-CAM-009', category: 'Electronics', stock: 3, price: 215990.00, notes: 'Full Frame Mirrorless Camera', image: '', username: USERNAME },
      { id: 10, name: 'Boat Airdopes 441', sku: 'SKU-AUD-010', category: 'Audio', stock: 120, price: 1299.00, notes: 'True Wireless Earbuds', image: '', username: USERNAME }
    ];
    await db.collection('products').insertMany(products);

    // 2. Seed Parties (8 profiles)
    const subDays = (d, count) => {
      const copy = new Date(d);
      copy.setDate(copy.getDate() - count);
      return copy.toISOString().substring(0, 10);
    };

    const parties = [
      { id: 1, name: 'Rahul Sharma', type: 'Customer', phone: '9876543210', balance: -25000.00, lastTxn: subDays(today, 2), notes: 'Regular customer', username: USERNAME },
      { id: 2, name: 'Priya Electronics', type: 'Supplier', phone: '9123456789', balance: 0.00, lastTxn: subDays(today, 5), notes: 'Samsung authorized dealer', username: USERNAME },
      { id: 3, name: 'Vikram Trading Co.', type: 'Customer', phone: '9988776655', balance: -75000.00, lastTxn: subDays(today, 1), notes: 'Bulk buyer', username: USERNAME },
      { id: 4, name: 'TechHub Distributors', type: 'Supplier', phone: '9112233445', balance: 0.00, lastTxn: subDays(today, 10), notes: 'Apple products supplier', username: USERNAME },
      { id: 5, name: 'Anita Desai', type: 'Customer', phone: '9001122334', balance: 0.00, lastTxn: subDays(today, 3), notes: 'One-time buyer', username: USERNAME },
      { id: 6, name: 'Metro Sound Systems', type: 'Supplier', phone: '9556677889', balance: 0.00, lastTxn: subDays(today, 7), notes: 'Audio equipment supplier', username: USERNAME },
      { id: 7, name: 'Deepak Patel', type: 'Customer', phone: '9334455667', balance: -12000.00, lastTxn: today.toISOString().substring(0, 10), notes: 'New customer', username: USERNAME },
      { id: 8, name: 'Global Imports Ltd.', type: 'Supplier', phone: '9445566778', balance: 0.00, lastTxn: subDays(today, 15), notes: 'International supplier', username: USERNAME }
    ];
    await db.collection('parties').insertMany(parties);

    // 3. Seed Sales (8 items)
    const sales = [
      { id: 'INV-1', customer: 'Rahul Sharma', date: subDays(today, 6), amount: 164989.00, mode: 'UPI', status: 'Paid', notes: 'Galaxy S24 + Headphones', items: [{ name: 'Samsung Galaxy S24 Ultra', qty: 1, rate: 134999.00, total: 134999.00 }, { name: 'Sony WH-1000XM5', qty: 1, rate: 29990.00, total: 29990.00 }], username: USERNAME },
      { id: 'INV-2', customer: 'Vikram Trading Co.', date: subDays(today, 5), amount: 344700.00, mode: 'Credit (Due)', status: 'Pending', notes: 'Bulk: 3x MacBook Air', items: [{ name: 'Apple MacBook Air M3', qty: 3, rate: 114900.00, total: 344700.00 }], username: USERNAME },
      { id: 'INV-3', customer: 'Anita Desai', date: subDays(today, 4), amount: 41900.00, mode: 'Card', status: 'Paid', notes: 'Apple Watch', items: [{ name: 'Apple Watch Series 9', qty: 1, rate: 41900.00, total: 41900.00 }], username: USERNAME },
      { id: 'INV-4', customer: 'Rahul Sharma', date: subDays(today, 3), amount: 29990.00, mode: 'Cash', status: 'Paid', notes: 'Sony WH-1000XM5', items: [{ name: 'Sony WH-1000XM5', qty: 1, rate: 29990.00, total: 29990.00 }], username: USERNAME },
      { id: 'INV-5', customer: 'Deepak Patel', date: subDays(today, 2), amount: 25994.00, mode: 'UPI', status: 'Paid', notes: '2x Nike Air Max', items: [{ name: 'Nike Air Max 90', qty: 2, rate: 12997.00, total: 25994.00 }], username: USERNAME },
      { id: 'INV-6', customer: 'Vikram Trading Co.', date: subDays(today, 1), amount: 215990.00, mode: 'Credit (Due)', status: 'Pending', notes: 'Canon EOS R6', items: [{ name: 'Canon EOS R6 Mark II', qty: 1, rate: 215990.00, total: 215990.00 }], username: USERNAME },
      { id: 'INV-7', customer: 'Deepak Patel', date: today.toISOString().substring(0, 10), amount: 14999.00, mode: 'Cash', status: 'Paid', notes: 'JBL Charge 5', items: [{ name: 'JBL Charge 5 Speaker', qty: 1, rate: 14999.00, total: 14999.00 }], username: USERNAME },
      { id: 'INV-8', customer: 'Rahul Sharma', date: today.toISOString().substring(0, 10), amount: 53995.00, mode: 'UPI', status: 'Paid', notes: 'Monitor + Mouse', items: [{ name: 'Dell 27-inch 4K Monitor', qty: 1, rate: 45000.00, total: 45000.00 }, { name: 'Logitech MX Master 3S', qty: 1, rate: 8995.00, total: 8995.00 }], username: USERNAME }
    ];
    await db.collection('sales').insertMany(sales);

    // 4. Seed Purchases (5 items)
    const purchases = [
      { id: 'PO-1', supplier: 'Priya Electronics', date: subDays(today, 12), amount: 2699980.00, mode: 'Bank Transfer', status: 'Paid', notes: '20x Galaxy S24 Ultra', username: USERNAME },
      { id: 'PO-2', supplier: 'TechHub Distributors', date: subDays(today, 10), amount: 1378800.00, mode: 'Bank Transfer', status: 'Paid', notes: '12x MacBook Air M3', username: USERNAME },
      { id: 'PO-3', supplier: 'Metro Sound Systems', date: subDays(today, 8), amount: 749750.00, mode: 'Credit (Due)', status: 'Pending', notes: '25x Sony WH + 20x JBL', username: USERNAME },
      { id: 'PO-4', supplier: 'Global Imports Ltd.', date: subDays(today, 6), amount: 779700.00, mode: 'Bank Transfer', status: 'Paid', notes: '60x Nike Air Max', username: USERNAME },
      { id: 'PO-5', supplier: 'TechHub Distributors', date: subDays(today, 3), amount: 753600.00, mode: 'Credit (Due)', status: 'Pending', notes: '18x Apple Watch', username: USERNAME }
    ];
    await db.collection('purchases').insertMany(purchases);

    // 5. Seed Transactions (13 items)
    const txnData = [
      [subDays(today, 12), 'Purchase', 'Priya Electronics', 2699980.00, 0],
      [subDays(today, 10), 'Purchase', 'TechHub Distributors', 1378800.00, 0],
      [subDays(today, 8), 'Purchase', 'Metro Sound Systems', 749750.00, 0],
      [subDays(today, 6), 'Sale', 'Rahul Sharma', 0, 164989.00],
      [subDays(today, 6), 'Purchase', 'Global Imports Ltd.', 779700.00, 0],
      [subDays(today, 5), 'Sale', 'Vikram Trading Co.', 0, 344700.00],
      [subDays(today, 4), 'Sale', 'Anita Desai', 0, 41900.00],
      [subDays(today, 3), 'Sale', 'Rahul Sharma', 0, 29990.00],
      [subDays(today, 3), 'Purchase', 'TechHub Distributors', 753600.00, 0],
      [subDays(today, 2), 'Sale', 'Deepak Patel', 0, 25994.00],
      [subDays(today, 1), 'Sale', 'Vikram Trading Co.', 0, 215990.00],
      [today.toISOString().substring(0, 10), 'Sale', 'Deepak Patel', 0, 14999.00],
      [today.toISOString().substring(0, 10), 'Sale', 'Rahul Sharma', 0, 53995.00]
    ];

    let balance = 0;
    const txnRows = txnData.map((row, i) => {
      const [date, ttype, party, debit, credit] = row;
      balance = balance - debit + credit;
      return {
        id: `TXN-${i + 1}`,
        date,
        type: ttype,
        party,
        debit,
        credit,
        balance,
        username: USERNAME
      };
    });
    await db.collection('transactions').insertMany(txnRows);

    // 6. Settings
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 180);
    const expiryStr = expiry.toISOString().substring(0, 10);

    await db.collection('settings').updateOne(
      { username: USERNAME },
      {
        $set: {
          username: USERNAME,
          bizName: 'Vyapar Demo Store',
          city: 'Mumbai',
          pincode: '400001',
          state: 'Maharashtra',
          email: 'admin@vyapar.com',
          phone: '9876543210',
          address: '123 Business Park, Andheri West, Mumbai',
          theme: 'light',
          isGstVerified: 1,
          isPhoneVerified: 1,
          isEmailVerified: 1,
          isWhatsappVerified: 0,
          gstin: '27AABCU9603R1ZM',
          subscriptionExpiry: expiryStr,
          planName: 'Premium',
          planCycle: 'YEARLY'
        }
      },
      { upsert: true }
    );

    // 7. Payment Record
    await db.collection('sa_payments').insertOne({
      username: USERNAME,
      amount: 4999.00,
      plan_name: 'Premium',
      date: new Date().toISOString().substring(0, 10),
      method: 'Manual Entry'
    });

    console.log('✅ Test data successfully seeded in MongoDB!');
    console.log(`   Products: ${products.length}`);
    console.log(`   Parties: ${parties.length}`);
    console.log(`   Sales: ${sales.length}`);
    console.log(`   Purchases: ${purchases.length}`);
    console.log(`   Transactions: ${txnRows.length}`);
    process.exit(0);

  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seed();
