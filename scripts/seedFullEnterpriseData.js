const { connectDB, getDB } = require('../config/db');
require('dotenv').config();

async function seedFullEnterpriseData() {
  console.log('=== SEEDING FULL ENTERPRISE ORIGINAL DATA ACROSS ALL SECTIONS ===');
  try {
    await connectDB();
    const db = getDB();

    const username = 'admin@example.com';
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    // 1. PRODUCTS CATALOG
    const products = [
      {
        name: 'Fortune Sunlite Refined Sunflower Oil 1L',
        category: 'Grocery & Staples',
        salePrice: 145,
        purchasePrice: 125,
        gstRate: 5,
        hsnCode: '1512',
        stock: 120,
        minStock: 20,
        unit: 'Pcs',
        barcode: '8906007280014',
        username,
        createdAt: fiveDaysAgo
      },
      {
        name: 'Aashirvaad Shuddh Chakki Atta 5kg',
        category: 'Grocery & Staples',
        salePrice: 260,
        purchasePrice: 220,
        gstRate: 5,
        hsnCode: '1101',
        stock: 85,
        minStock: 15,
        unit: 'Pcs',
        barcode: '8901058852378',
        username,
        createdAt: fiveDaysAgo
      },
      {
        name: 'India Gate Feast Rozana Basmati Rice 5kg',
        category: 'Grocery & Staples',
        salePrice: 480,
        purchasePrice: 410,
        gstRate: 5,
        hsnCode: '1006',
        stock: 60,
        minStock: 10,
        unit: 'Pcs',
        barcode: '8906001021200',
        username,
        createdAt: fiveDaysAgo
      },
      {
        name: 'Tata Salt Vacuum Evaporated Iodised Salt 1kg',
        category: 'Grocery & Staples',
        salePrice: 28,
        purchasePrice: 22,
        gstRate: 0,
        hsnCode: '2501',
        stock: 200,
        minStock: 30,
        unit: 'Pcs',
        barcode: '8901058000106',
        username,
        createdAt: fiveDaysAgo
      },
      {
        name: 'Madhur Pure & Hygiene Sugar 1kg',
        category: 'Grocery & Staples',
        salePrice: 52,
        purchasePrice: 44,
        gstRate: 5,
        hsnCode: '1701',
        stock: 150,
        minStock: 25,
        unit: 'Pcs',
        barcode: '8906010510027',
        username,
        createdAt: fiveDaysAgo
      },
      {
        name: 'Amul Taaza Homogenised Toned Milk 1L Pack',
        category: 'Dairy & Beverages',
        salePrice: 72,
        purchasePrice: 62,
        gstRate: 5,
        hsnCode: '0401',
        stock: 90,
        minStock: 15,
        unit: 'Pcs',
        barcode: '8901262010012',
        username,
        createdAt: fiveDaysAgo
      },
      {
        name: 'Amul Butter Pasteurised 500g',
        category: 'Dairy & Beverages',
        salePrice: 275,
        purchasePrice: 240,
        gstRate: 12,
        hsnCode: '0405',
        stock: 45,
        minStock: 10,
        unit: 'Pcs',
        barcode: '8901262020059',
        username,
        createdAt: fiveDaysAgo
      },
      {
        name: 'Red Label Natural Care Tea 500g',
        category: 'Dairy & Beverages',
        salePrice: 310,
        purchasePrice: 265,
        gstRate: 5,
        hsnCode: '0902',
        stock: 50,
        minStock: 10,
        unit: 'Pcs',
        barcode: '8901030722309',
        username,
        createdAt: fiveDaysAgo
      },
      {
        name: 'Nescafe Classic Instant Coffee Jar 100g',
        category: 'Dairy & Beverages',
        salePrice: 340,
        purchasePrice: 290,
        gstRate: 18,
        hsnCode: '2101',
        stock: 40,
        minStock: 8,
        unit: 'Pcs',
        barcode: '8901058863008',
        username,
        createdAt: fiveDaysAgo
      },
      {
        name: 'Dettol Original Germ Protection Bathing Soap (125g x 4)',
        category: 'Personal Care',
        salePrice: 195,
        purchasePrice: 160,
        gstRate: 18,
        hsnCode: '3401',
        stock: 70,
        minStock: 12,
        unit: 'Pack',
        barcode: '8901396001002',
        username,
        createdAt: fiveDaysAgo
      },
      {
        name: 'Colgate Strong Teeth Toothpaste 200g',
        category: 'Personal Care',
        salePrice: 115,
        purchasePrice: 92,
        gstRate: 18,
        hsnCode: '3306',
        stock: 110,
        minStock: 20,
        unit: 'Pcs',
        barcode: '8901314002008',
        username,
        createdAt: fiveDaysAgo
      },
      {
        name: 'Surf Excel Easy Wash Detergent Powder 1kg',
        category: 'Household Essentials',
        salePrice: 140,
        purchasePrice: 115,
        gstRate: 18,
        hsnCode: '3402',
        stock: 80,
        minStock: 15,
        unit: 'Pcs',
        barcode: '8901030700109',
        username,
        createdAt: fiveDaysAgo
      },
      {
        name: 'Vim Dishwash Liquid Gel Lemon 500ml Bottle',
        category: 'Household Essentials',
        salePrice: 120,
        purchasePrice: 98,
        gstRate: 18,
        hsnCode: '3402',
        stock: 95,
        minStock: 15,
        unit: 'Pcs',
        barcode: '8901030712058',
        username,
        createdAt: fiveDaysAgo
      }
    ];

    await db.collection('products').deleteMany({ username });
    await db.collection('products').insertMany(products);
    console.log('✅ [1/9] Products section populated with authentic items.');

    // 2. PARTIES (Suppliers & Customers)
    const parties = [
      {
        name: 'Mahalaxmi Wholesale FMCG Traders',
        type: 'supplier',
        phone: '+91 9822011223',
        email: 'supply@mahalaxmitraders.in',
        gstin: '27AAACM4512H1Z8',
        address: 'Plot 42, Wholesale Market Yard, Gultekdi, Pune, MH 411037',
        balance: 18500,
        username,
        createdAt: fiveDaysAgo
      },
      {
        name: 'Apex Dairy & Food Distributors',
        type: 'supplier',
        phone: '+91 9423588990',
        email: 'orders@apexdairy.com',
        gstin: '27AABCA9876E1ZQ',
        address: 'Gat No. 108, Hadapsar Industrial Estate, Pune, MH 411013',
        balance: 12400,
        username,
        createdAt: fiveDaysAgo
      },
      {
        name: 'Shree Ganesh Retail Store',
        type: 'customer',
        phone: '+91 9890123456',
        email: 'ganeshretail.pune@gmail.com',
        gstin: '27AABCU1234A1ZP',
        address: 'Shop No. 4, MG Road, Camp, Pune, MH 411001',
        balance: -6800,
        username,
        createdAt: fiveDaysAgo
      },
      {
        name: 'Rajendra Prasad (Regular Customer)',
        type: 'customer',
        phone: '+91 9765432109',
        email: 'rprasad1984@gmail.com',
        gstin: '',
        address: 'Flat 302, Green Acres Society, Kothrud, Pune, MH 411038',
        balance: 0,
        username,
        createdAt: fiveDaysAgo
      }
    ];

    await db.collection('parties').deleteMany({ username });
    await db.collection('parties').insertMany(parties);
    console.log('✅ [2/9] Parties section populated (Suppliers & Customers).');

    // 3. SALES INVOICES & BILLING
    const sales = [
      {
        invoiceNumber: 'INV-2026-001',
        customerName: 'Shree Ganesh Retail Store',
        customerPhone: '+91 9890123456',
        customerGstin: '27AABCU1234A1ZP',
        items: [
          { name: 'Fortune Sunlite Refined Sunflower Oil 1L', quantity: 10, price: 145, gstRate: 5, amount: 1450 },
          { name: 'Aashirvaad Shuddh Chakki Atta 5kg', quantity: 5, price: 260, gstRate: 5, amount: 1300 },
          { name: 'Red Label Natural Care Tea 500g', quantity: 4, price: 310, gstRate: 5, amount: 1240 }
        ],
        subtotal: 3990,
        cgst: 99.75,
        sgst: 99.75,
        igst: 0,
        totalAmount: 4189.50,
        paymentStatus: 'Paid',
        paymentMethod: 'UPI',
        transactionRef: 'UPI/3891029102/PAYTM',
        username,
        createdAt: yesterday
      },
      {
        invoiceNumber: 'INV-2026-002',
        customerName: 'Rajendra Prasad',
        customerPhone: '+91 9765432109',
        customerGstin: '',
        items: [
          { name: 'Amul Butter Pasteurised 500g', quantity: 2, price: 275, gstRate: 12, amount: 550 },
          { name: 'Nescafe Classic Instant Coffee Jar 100g', quantity: 1, price: 340, gstRate: 18, amount: 340 },
          { name: 'Dettol Original Germ Protection Bathing Soap', quantity: 1, price: 195, gstRate: 18, amount: 195 }
        ],
        subtotal: 1085,
        cgst: 72.15,
        sgst: 72.15,
        igst: 0,
        totalAmount: 1229.30,
        paymentStatus: 'Paid',
        paymentMethod: 'Cash',
        username,
        createdAt: now
      }
    ];

    await db.collection('sales').deleteMany({ username });
    await db.collection('sales').insertMany(sales);
    console.log('✅ [3/9] Sales & Billing section populated with real invoice transactions.');

    // 4. PURCHASES (Stock Receiving Bills)
    const purchases = [
      {
        purchaseBillNo: 'PUR-8821',
        supplierName: 'Mahalaxmi Wholesale FMCG Traders',
        supplierGstin: '27AAACM4512H1Z8',
        items: [
          { name: 'Fortune Sunlite Refined Sunflower Oil 1L', quantity: 100, costPrice: 125, amount: 12500 },
          { name: 'Aashirvaad Shuddh Chakki Atta 5kg', quantity: 50, costPrice: 220, amount: 11000 }
        ],
        subtotal: 23500,
        gstTotal: 1175,
        totalAmount: 24675,
        paymentStatus: 'Paid',
        username,
        createdAt: threeDaysAgo
      }
    ];

    await db.collection('purchases').deleteMany({ username });
    await db.collection('purchases').insertMany(purchases);
    console.log('✅ [4/9] Purchase Inward section populated.');

    // 5. EXPENSES
    const expenses = [
      {
        title: 'Monthly Showroom Commercial Electricity Bill',
        amount: 8450,
        category: 'Utilities',
        paidVia: 'Bank Transfer',
        vendor: 'MSEDCL Pune',
        date: yesterday,
        username,
        createdAt: yesterday
      },
      {
        title: 'Store High Speed Fiber Internet Broadband',
        amount: 1499,
        category: 'Utilities',
        paidVia: 'UPI',
        vendor: 'Airtel Broadband',
        date: threeDaysAgo,
        username,
        createdAt: threeDaysAgo
      },
      {
        title: 'Daily Staff Refreshments & Tea Expense',
        amount: 650,
        category: 'Staff Expenses',
        paidVia: 'Cash',
        vendor: 'Local Tea Stall',
        date: now,
        username,
        createdAt: now
      }
    ];

    await db.collection('expenses').deleteMany({ username });
    await db.collection('expenses').insertMany(expenses);
    console.log('✅ [5/9] Expenses section populated.');

    // 6. DELIVERY & DISPATCH
    const deliveryBoys = [
      {
        driverId: 'DRV-101',
        name: 'Ramesh Pawar',
        phone: '+91 9123456780',
        vehicleType: 'Two Wheeler (Honda Activa)',
        vehicleNo: 'MH-12-HV-4921',
        status: 'Active',
        username,
        createdAt: fiveDaysAgo
      }
    ];

    const deliveries = [
      {
        orderId: 'ORD-9901',
        customerName: 'Rajendra Prasad',
        deliveryAddress: 'Flat 302, Green Acres Society, Kothrud, Pune',
        customerPhone: '+91 9765432109',
        driverName: 'Ramesh Pawar',
        partner: 'in-house',
        status: 'Delivered',
        amount: 1229.30,
        assignedAt: yesterday,
        deliveredAt: yesterday,
        username,
        createdAt: yesterday
      }
    ];

    await db.collection('delivery_boys').deleteMany({ username });
    await db.collection('delivery_boys').insertMany(deliveryBoys);
    await db.collection('deliveries').deleteMany({ username });
    await db.collection('deliveries').insertMany(deliveries);
    console.log('✅ [6/9] Deliveries & Driver Dispatch section populated.');

    // 7. ACCOUNTANT MODULE LEDGERS & GST FILINGS
    const ledgers = [
      { name: 'Cash Account', type: 'asset', balance: 25400, username },
      { name: 'HDFC Bank Main Account', type: 'asset', balance: 142000, username },
      { name: 'Accounts Receivable', type: 'asset', balance: 6800, username },
      { name: 'Accounts Payable', type: 'liability', balance: 30900, username },
      { name: 'Sales Revenue Account', type: 'income', balance: 185000, username },
      { name: 'Cost of Goods Sold', type: 'expense', balance: 120000, username },
      { name: 'Retained Earnings', type: 'equity', balance: 23300, username }
    ];

    const gstFilings = [
      {
        period: 'Q4 FY26',
        cgst: 8450,
        sgst: 8450,
        igst: 3200,
        totalGstPaid: 20100,
        filedAt: yesterday,
        status: 'Filed',
        arnNumber: 'AA270326098124Z',
        username
      }
    ];

    await db.collection('ledgers').deleteMany({ username });
    await db.collection('ledgers').insertMany(ledgers);
    await db.collection('gstfilings').deleteMany({ username });
    await db.collection('gstfilings').insertMany(gstFilings);
    console.log('✅ [7/9] Accountant Ledgers & GST Filings populated.');

    // 8. OFFERS & PROMOTIONAL COUPONS
    const offers = [
      {
        code: 'WELCOME100',
        description: 'Flat ₹100 Off on orders above ₹1,000',
        discountType: 'flat',
        discountValue: 100,
        minOrderValue: 1000,
        status: 'Active',
        validTill: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        username
      },
      {
        code: 'FESTIVE10',
        description: '10% Discount on Grocery Staples',
        discountType: 'percentage',
        discountValue: 10,
        minOrderValue: 500,
        status: 'Active',
        validTill: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
        username
      }
    ];

    await db.collection('offers').deleteMany({ username });
    await db.collection('offers').insertMany(offers);
    console.log('✅ [8/9] Offers & Coupons section populated.');

    // 9. SHOP PROFILE SETTINGS
    const shopSettings = {
      username,
      businessName: 'Vyapar Supermart & General Traders',
      tagline: 'Your Trusted Neighborhood Superstore',
      gstin: '27ABCDE1234F1Z5',
      address: 'Shop 1-3, Royal Plaza, FC Road, Shivaji Nagar, Pune, MH 411005',
      phone: '+91 9888877777',
      email: 'contact@vyaparsupermart.com',
      upiId: 'vyapar.supermart@icici',
      invoicePrefix: 'INV-2026-',
      updatedAt: now
    };

    await db.collection('settings').updateOne(
      { username },
      { $set: shopSettings },
      { upsert: true }
    );
    console.log('✅ [9/9] Settings & Shop Profile section updated.');

    console.log('\n🎉 ALL SECTIONS POPULATED WITH ORIGINAL ENTERPRISE DATA SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding enterprise data:', err);
    process.exit(1);
  }
}

seedFullEnterpriseData();
