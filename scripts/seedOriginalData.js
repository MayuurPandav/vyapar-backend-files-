const { connectDB, getDB } = require('../config/db');
require('dotenv').config();

async function seedOriginalData() {
  console.log('=== SEEDING AUTHENTIC ORIGINAL DATA FOR VYAPAR 2.0 ===');
  try {
    await connectDB();
    const db = getDB();

    const username = 'admin@example.com';

    // 1. Realistic Products
    const products = [
      // Grocery & Staples
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
        createdAt: new Date()
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
        createdAt: new Date()
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
        createdAt: new Date()
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
        createdAt: new Date()
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
        createdAt: new Date()
      },

      // Dairy & Beverages
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
        createdAt: new Date()
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
        createdAt: new Date()
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
        createdAt: new Date()
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
        createdAt: new Date()
      },

      // Personal Care & Hygiene
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
        createdAt: new Date()
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
        createdAt: new Date()
      },
      {
        name: 'Head & Shoulders Smooth & Silky Anti Dandruff Shampoo 340ml',
        category: 'Personal Care',
        salePrice: 320,
        purchasePrice: 260,
        gstRate: 18,
        hsnCode: '3305',
        stock: 35,
        minStock: 8,
        unit: 'Pcs',
        barcode: '4902430752009',
        username,
        createdAt: new Date()
      },

      // Household & Cleaning
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
        createdAt: new Date()
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
        createdAt: new Date()
      },
      {
        name: 'Harpic Power Plus Toilet Cleaner Liquid 1L',
        category: 'Household Essentials',
        salePrice: 215,
        purchasePrice: 175,
        gstRate: 18,
        hsnCode: '3402',
        stock: 50,
        minStock: 10,
        unit: 'Pcs',
        barcode: '8901396112005',
        username,
        createdAt: new Date()
      }
    ];

    // Clear existing products and insert new original product catalog
    await db.collection('products').deleteMany({ username });
    const insertedProducts = await db.collection('products').insertMany(products);
    console.log(`📦 Seeded ${insertedProducts.insertedCount} authentic retail products.`);

    // 2. Realistic Parties (Suppliers & Customers)
    const parties = [
      {
        name: 'Mahalaxmi Wholesale FMCG Traders',
        type: 'supplier',
        phone: '+91 9822011223',
        email: 'supply@mahalaxmitraders.in',
        gstin: '27AAACM4512H1Z8',
        address: 'Plot 42, Wholesale Market Yard, Gultekdi, Pune, Maharashtra 411037',
        balance: 18500, // We owe supplier
        username,
        createdAt: new Date()
      },
      {
        name: 'Apex Dairy & Food Distributors',
        type: 'supplier',
        phone: '+91 9423588990',
        email: 'orders@apexdairy.com',
        gstin: '27AABCA9876E1ZQ',
        address: 'Gat No. 108, Hadapsar Industrial Estate, Pune, Maharashtra 411013',
        balance: 12400,
        username,
        createdAt: new Date()
      },
      {
        name: 'Shree Ganesh Retail Store',
        type: 'customer',
        phone: '+91 9890123456',
        email: 'ganeshretail.pune@gmail.com',
        gstin: '27AABCU1234A1ZP',
        address: 'Shop No. 4, MG Road, Camp, Pune, Maharashtra 411001',
        balance: -6800, // Customer owes us
        username,
        createdAt: new Date()
      },
      {
        name: 'Rajendra Prasad (Regular Customer)',
        type: 'customer',
        phone: '+91 9765432109',
        email: 'rprasad1984@gmail.com',
        gstin: '',
        address: 'Flat 302, Green Acres Society, Kothrud, Pune, Maharashtra 411038',
        balance: 0,
        username,
        createdAt: new Date()
      }
    ];

    await db.collection('parties').deleteMany({ username });
    const insertedParties = await db.collection('parties').insertMany(parties);
    console.log(`👥 Seeded ${insertedParties.insertedCount} authentic business parties (Suppliers & Customers).`);

    // 3. Shop Profile Settings
    const shopSettings = {
      username,
      businessName: 'Vyapar Supermart & General Traders',
      tagline: 'Your Trusted Neighborhood Superstore',
      gstin: '27ABCDE1234F1Z5',
      address: 'Shop 1-3, Royal Plaza, FC Road, Shivaji Nagar, Pune, MH 411005',
      phone: '+91 9888877777',
      email: 'contact@vyaparsupermart.com',
      invoicePrefix: 'INV-2026-',
      updatedAt: new Date()
    };

    await db.collection('settings').updateOne(
      { username },
      { $set: shopSettings },
      { upsert: true }
    );
    console.log('⚙️ Updated Shop Profile & Tax Configuration.');

    console.log('\n🎉 Authentic Original Data Seeded Successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding original data:', err);
    process.exit(1);
  }
}

seedOriginalData();
