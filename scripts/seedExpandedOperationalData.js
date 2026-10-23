const { connectDB, getDB } = require('../config/db');
require('dotenv').config();

async function seedExpandedData() {
  console.log('=== SEEDING EXPANDED REALISTIC INVOICES, PURCHASES & DELIVERIES ===');
  try {
    await connectDB();
    const db = getDB();

    const username = 'admin@example.com';
    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);
    const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
    const twoDaysAgoStr = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
    const threeDaysAgoStr = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
    const fiveDaysAgoStr = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

    // 1. PARTIES DIRECTORY (Suppliers & Customers)
    const parties = [
      {
        id: 'PRT-101',
        name: 'Mahalaxmi Wholesale FMCG Traders',
        type: 'supplier',
        phone: '+91 9822011223',
        email: 'supply@mahalaxmitraders.in',
        gstin: '27AAACM4512H1Z8',
        address: 'Plot 42, Wholesale Market Yard, Gultekdi, Pune, MH 411037',
        balance: 18500,
        username,
        createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'PRT-102',
        name: 'Apex Dairy & Food Distributors',
        type: 'supplier',
        phone: '+91 9423588990',
        email: 'orders@apexdairy.com',
        gstin: '27AABCA9876E1ZQ',
        address: 'Gat No. 108, Hadapsar Industrial Estate, Pune, MH 411013',
        balance: 12400,
        username,
        createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'PRT-103',
        name: 'Patanjali Wholesale Depot',
        type: 'supplier',
        phone: '+91 9890909090',
        email: 'depot.pune@patanjali.in',
        gstin: '27AAACP1122K1Z9',
        address: 'Sector 5, Transport Nagar, Nigdi, Pune, MH 411044',
        balance: 18400,
        username,
        createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'PRT-104',
        name: 'Shree Ganesh Retail Store',
        type: 'customer',
        phone: '+91 9890123456',
        email: 'ganeshretail.pune@gmail.com',
        gstin: '27AABCU1234A1ZP',
        address: 'Shop No. 4, MG Road, Camp, Pune, MH 411001',
        balance: -6800,
        username,
        createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'PRT-105',
        name: 'Kothrud Bakers & Foods',
        type: 'customer',
        phone: '+91 9823114455',
        email: 'orders@kothrudbakers.com',
        gstin: '27AABCK9988D1Z2',
        address: 'Shop 12, Karve Road, Kothrud, Pune, MH 411038',
        balance: -8500,
        username,
        createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'PRT-106',
        name: 'Swiggy Stores Pune Central',
        type: 'customer',
        phone: '+91 9922330011',
        email: 'hub.pune@swiggy.in',
        gstin: '27AACCS4512H1ZK',
        address: 'Hub 4, Viman Nagar Tech Park, Pune, MH 411014',
        balance: 0,
        username,
        createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'PRT-107',
        name: 'Rajendra Prasad',
        type: 'customer',
        phone: '+91 9765432109',
        email: 'rprasad1984@gmail.com',
        gstin: '',
        address: 'Flat 302, Green Acres Society, Kothrud, Pune, MH 411038',
        balance: 0,
        username,
        createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'PRT-108',
        name: 'Pooja Sharma',
        type: 'customer',
        phone: '+91 9822998877',
        email: 'pooja.sharma88@yahoo.com',
        gstin: '',
        address: 'Flat 102, Sun City Phase 2, Anand Nagar, Pune, MH 411051',
        balance: 0,
        username,
        createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
      }
    ];

    await db.collection('parties').deleteMany({ username });
    await db.collection('parties').insertMany(parties);
    console.log('✅ Parties directory populated (Suppliers & Customers).');

    // 2. EXPANDED SALES INVOICES
    const sales = [
      {
        id: 'INV-1',
        invoiceNumber: 'INV-1',
        customer: 'Shree Ganesh Retail Store',
        customerName: 'Shree Ganesh Retail Store',
        customerPhone: '+91 9890123456',
        customerGstin: '27AABCU1234A1ZP',
        date: fiveDaysAgoStr,
        items: [
          { name: 'Fortune Sunlite Refined Sunflower Oil 1L', quantity: 10, qty: 10, rate: 145, price: 145, gstRate: 5, amount: 1450 },
          { name: 'Aashirvaad Shuddh Chakki Atta 5kg', quantity: 5, qty: 5, rate: 260, price: 260, gstRate: 5, amount: 1300 },
          { name: 'Red Label Natural Care Tea 500g', quantity: 4, qty: 4, rate: 310, price: 310, gstRate: 5, amount: 1240 }
        ],
        subtotal: 3990,
        taxAmount: 199.50,
        cgst: 99.75,
        sgst: 99.75,
        igst: 0,
        amount: 4189.50,
        totalAmount: 4189.50,
        status: 'Paid',
        paymentStatus: 'Paid',
        paymentMethod: 'UPI',
        transactionRef: 'UPI/3891029102/PAYTM',
        username,
        createdAt: new Date(fiveDaysAgoStr)
      },
      {
        id: 'INV-2',
        invoiceNumber: 'INV-2',
        customer: 'Rajendra Prasad',
        customerName: 'Rajendra Prasad',
        customerPhone: '+91 9765432109',
        customerGstin: '',
        date: threeDaysAgoStr,
        items: [
          { name: 'Amul Butter Pasteurised 500g', quantity: 2, qty: 2, rate: 275, price: 275, gstRate: 12, amount: 550 },
          { name: 'Nescafe Classic Instant Coffee Jar 100g', quantity: 1, qty: 1, rate: 340, price: 340, gstRate: 18, amount: 340 },
          { name: 'Dettol Original Bathing Soap Pack', quantity: 1, qty: 1, rate: 195, price: 195, gstRate: 18, amount: 195 }
        ],
        subtotal: 1085,
        taxAmount: 144.30,
        cgst: 72.15,
        sgst: 72.15,
        igst: 0,
        amount: 1229.30,
        totalAmount: 1229.30,
        status: 'Paid',
        paymentStatus: 'Paid',
        paymentMethod: 'Cash',
        username,
        createdAt: new Date(threeDaysAgoStr)
      },
      {
        id: 'INV-3',
        invoiceNumber: 'INV-3',
        customer: 'Pooja Sharma',
        customerName: 'Pooja Sharma',
        customerPhone: '+91 9822998877',
        customerGstin: '',
        date: twoDaysAgoStr,
        items: [
          { name: 'India Gate Feast Rozana Basmati Rice 5kg', quantity: 2, qty: 2, rate: 480, price: 480, gstRate: 5, amount: 960 },
          { name: 'Fortune Sunlite Refined Sunflower Oil 1L', quantity: 4, qty: 4, rate: 145, price: 145, gstRate: 5, amount: 580 },
          { name: 'Surf Excel Easy Wash Detergent Powder 1kg', quantity: 3, qty: 3, rate: 140, price: 140, gstRate: 18, amount: 420 },
          { name: 'Colgate Strong Teeth Toothpaste 200g', quantity: 2, qty: 2, rate: 115, price: 115, gstRate: 18, amount: 230 }
        ],
        subtotal: 2190,
        taxAmount: 260.00,
        cgst: 130.00,
        sgst: 130.00,
        igst: 0,
        amount: 2450.00,
        totalAmount: 2450.00,
        status: 'Paid',
        paymentStatus: 'Paid',
        paymentMethod: 'Card',
        username,
        createdAt: new Date(twoDaysAgoStr)
      },
      {
        id: 'INV-4',
        invoiceNumber: 'INV-4',
        customer: 'Kothrud Bakers & Foods',
        customerName: 'Kothrud Bakers & Foods',
        customerPhone: '+91 9823114455',
        customerGstin: '27AABCK9988D1Z2',
        date: yesterdayStr,
        items: [
          { name: 'Aashirvaad Shuddh Chakki Atta 5kg', quantity: 30, qty: 30, rate: 260, price: 260, gstRate: 5, amount: 7800 },
          { name: 'Madhur Pure & Hygiene Sugar 1kg', quantity: 100, qty: 100, rate: 52, price: 52, gstRate: 5, amount: 5200 },
          { name: 'Amul Butter Pasteurised 500g', quantity: 20, qty: 20, rate: 275, price: 275, gstRate: 12, amount: 5500 }
        ],
        subtotal: 18500,
        taxAmount: 1310.00,
        cgst: 655.00,
        sgst: 655.00,
        igst: 0,
        amount: 19810.00,
        totalAmount: 19810.00,
        paymentReceived: 10000,
        balanceDue: 9810,
        status: 'Partial',
        paymentStatus: 'Partial',
        paymentMethod: 'Credit (Due)',
        username,
        createdAt: new Date(yesterdayStr)
      },
      {
        id: 'INV-5',
        invoiceNumber: 'INV-5',
        customer: 'Swiggy Stores Pune Central',
        customerName: 'Swiggy Stores Pune Central',
        customerPhone: '+91 9922330011',
        customerGstin: '27AACCS4512H1ZK',
        date: todayStr,
        items: [
          { name: 'Fortune Sunlite Refined Sunflower Oil 1L', quantity: 100, qty: 100, rate: 145, price: 145, gstRate: 5, amount: 14500 },
          { name: 'Red Label Natural Care Tea 500g', quantity: 50, qty: 50, rate: 310, price: 310, gstRate: 5, amount: 15500 },
          { name: 'Surf Excel Easy Wash Detergent Powder 1kg', quantity: 90, qty: 90, rate: 140, price: 140, gstRate: 18, amount: 12600 }
        ],
        subtotal: 42600,
        taxAmount: 3768.00,
        cgst: 1884.00,
        sgst: 1884.00,
        igst: 0,
        amount: 46368.00,
        totalAmount: 46368.00,
        status: 'Paid',
        paymentStatus: 'Paid',
        paymentMethod: 'NetBanking',
        transactionRef: 'HDFC/N291048129/IMPS',
        username,
        createdAt: new Date(todayStr)
      }
    ];

    await db.collection('sales').deleteMany({ username });
    await db.collection('sales').insertMany(sales);
    await db.collection('invoices').deleteMany({ username });
    await db.collection('invoices').insertMany(sales);
    console.log('✅ Sales & Invoices section populated with 5 rich invoice records.');

    // 3. EXPANDED PURCHASES INWARD
    const purchases = [
      {
        id: 'PO-101',
        purchaseBillNo: 'PUR-2026-101',
        supplierName: 'Mahalaxmi Wholesale FMCG Traders',
        supplierGstin: '27AAACM4512H1Z8',
        date: fiveDaysAgoStr,
        items: [
          { name: 'Fortune Sunlite Refined Sunflower Oil 1L', quantity: 100, qty: 100, costPrice: 125, price: 125, amount: 12500 },
          { name: 'Aashirvaad Shuddh Chakki Atta 5kg', quantity: 50, qty: 50, costPrice: 220, price: 220, amount: 11000 }
        ],
        subtotal: 23500,
        gstTotal: 1175,
        totalAmount: 24675,
        status: 'Paid',
        paymentStatus: 'Paid',
        paymentMode: 'Bank Transfer',
        username,
        createdAt: new Date(fiveDaysAgoStr)
      },
      {
        id: 'PO-102',
        purchaseBillNo: 'PUR-2026-102',
        supplierName: 'Apex Dairy & Food Distributors',
        supplierGstin: '27AABCA9876E1ZQ',
        date: threeDaysAgoStr,
        items: [
          { name: 'Amul Taaza Homogenised Toned Milk 1L', quantity: 100, qty: 100, costPrice: 62, price: 62, amount: 6200 },
          { name: 'Amul Butter Pasteurised 500g', quantity: 45, qty: 45, costPrice: 240, price: 240, amount: 10800 }
        ],
        subtotal: 17000,
        gstTotal: 1606,
        totalAmount: 18606,
        status: 'Paid',
        paymentStatus: 'Paid',
        paymentMode: 'UPI',
        username,
        createdAt: new Date(threeDaysAgoStr)
      },
      {
        id: 'PO-103',
        purchaseBillNo: 'PUR-2026-103',
        supplierName: 'Patanjali Wholesale Depot',
        supplierGstin: '27AAACP1122K1Z9',
        date: yesterdayStr,
        items: [
          { name: 'India Gate Feast Rozana Basmati Rice 5kg', quantity: 50, qty: 50, costPrice: 410, price: 410, amount: 20500 },
          { name: 'Madhur Pure & Hygiene Sugar 1kg', quantity: 150, qty: 150, costPrice: 44, price: 44, amount: 6600 },
          { name: 'Tata Salt Vacuum Evaporated Salt 1kg', quantity: 200, qty: 200, costPrice: 22, price: 22, amount: 4400 }
        ],
        subtotal: 31500,
        gstTotal: 1355,
        totalAmount: 32855,
        paymentReceived: 15000,
        balanceDue: 17855,
        status: 'Partial',
        paymentStatus: 'Partial',
        paymentMode: 'Bank Transfer',
        username,
        createdAt: new Date(yesterdayStr)
      }
    ];

    await db.collection('purchases').deleteMany({ username });
    await db.collection('purchases').insertMany(purchases);
    console.log('✅ Purchase Inward section populated with 3 supplier bills.');

    // 4. EXPANDED DELIVERIES & DRIVER DISPATCH
    const drivers = [
      {
        driverId: 'DRV-101',
        name: 'Ramesh Pawar',
        phone: '+91 9123456780',
        vehicleType: 'Two Wheeler (Honda Activa)',
        vehicleNo: 'MH-12-HV-4921',
        status: 'Active',
        activeDeliveries: 1,
        completedDeliveries: 12,
        rating: 4.8,
        username,
        createdAt: new Date(fiveDaysAgoStr)
      },
      {
        driverId: 'DRV-102',
        name: 'Suresh More',
        phone: '+91 9822119944',
        vehicleType: 'Three Wheeler (Piaggio Ape Cargo)',
        vehicleNo: 'MH-12-EQ-8812',
        status: 'Active',
        activeDeliveries: 1,
        completedDeliveries: 28,
        rating: 4.9,
        username,
        createdAt: new Date(fiveDaysAgoStr)
      }
    ];

    const deliveries = [
      {
        id: 'DEL-9901',
        orderId: 'ORD-9901',
        customerName: 'Rajendra Prasad',
        deliveryAddress: 'Flat 302, Green Acres Society, Kothrud, Pune, MH 411038',
        customerPhone: '+91 9765432109',
        driverName: 'Ramesh Pawar',
        driverPhone: '+91 9123456780',
        partner: 'in-house',
        status: 'Delivered',
        amount: 1229.30,
        assignedAt: threeDaysAgoStr,
        deliveredAt: threeDaysAgoStr,
        username,
        createdAt: new Date(threeDaysAgoStr)
      },
      {
        id: 'DEL-9902',
        orderId: 'ORD-9902',
        customerName: 'Pooja Sharma',
        deliveryAddress: 'Flat 102, Sun City Phase 2, Anand Nagar, Pune, MH 411051',
        customerPhone: '+91 9822998877',
        driverName: 'Ramesh Pawar',
        driverPhone: '+91 9123456780',
        partner: 'in-house',
        status: 'Delivered',
        amount: 2450.00,
        assignedAt: twoDaysAgoStr,
        deliveredAt: twoDaysAgoStr,
        username,
        createdAt: new Date(twoDaysAgoStr)
      },
      {
        id: 'DEL-9903',
        orderId: 'ORD-9903',
        customerName: 'Kothrud Bakers & Foods',
        deliveryAddress: 'Shop 12, Karve Road, Kothrud, Pune, MH 411038',
        customerPhone: '+91 9823114455',
        driverName: 'Suresh More',
        driverPhone: '+91 9822119944',
        partner: 'in-house',
        status: 'Out for Delivery',
        amount: 19810.00,
        assignedAt: yesterdayStr,
        deliveredAt: null,
        username,
        createdAt: new Date(yesterdayStr)
      },
      {
        id: 'DEL-9904',
        orderId: 'ORD-9904',
        customerName: 'Swiggy Stores Pune Central',
        deliveryAddress: 'Hub 4, Viman Nagar Tech Park, Pune, MH 411014',
        customerPhone: '+91 9922330011',
        driverName: 'Shiprocket Express 3PL',
        driverPhone: '+91 1800102030',
        partner: 'shiprocket',
        status: 'Delivered',
        amount: 46368.00,
        assignedAt: todayStr,
        deliveredAt: todayStr,
        username,
        createdAt: new Date(todayStr)
      },
      {
        id: 'DEL-9905',
        orderId: 'ORD-9905',
        customerName: 'Shree Ganesh Retail Store',
        deliveryAddress: 'Shop No. 4, MG Road, Camp, Pune, MH 411001',
        customerPhone: '+91 9890123456',
        driverName: 'Ramesh Pawar',
        driverPhone: '+91 9123456780',
        partner: 'in-house',
        status: 'Pending Pickup',
        amount: 4189.50,
        assignedAt: todayStr,
        deliveredAt: null,
        username,
        createdAt: new Date(todayStr)
      }
    ];

    await db.collection('delivery_boys').deleteMany({ username });
    await db.collection('delivery_boys').insertMany(drivers);
    await db.collection('driver_profiles').deleteMany({ username });
    await db.collection('driver_profiles').insertMany(drivers);
    await db.collection('deliveries').deleteMany({ username });
    await db.collection('deliveries').insertMany(deliveries);
    await db.collection('driver_deliveries').deleteMany({ username });
    await db.collection('driver_deliveries').insertMany(deliveries);
    console.log('✅ Deliveries & Driver Dispatch section populated with 5 dispatch orders & 2 drivers.');

    console.log('\n🎉 ALL INVOICES, PURCHASES & DELIVERIES POPULATED SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding expanded data:', err);
    process.exit(1);
  }
}

seedExpandedData();
