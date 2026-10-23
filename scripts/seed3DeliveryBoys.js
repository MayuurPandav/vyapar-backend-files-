const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function seed3DeliveryBoys() {
  console.log('🚀 Starting Delivery Boys & Real Delivery Data Seeding...');
  try {
    const MONGO_URI = process.env.MONGO_URI;
    const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'vyapar_db';

    if (!MONGO_URI) {
      throw new Error('MONGO_URI is missing in .env file!');
    }

    await mongoose.connect(MONGO_URI, { dbName: MONGO_DB_NAME });
    const db = mongoose.connection.db;

    const testPassword = 'pass123';
    const salt = await bcrypt.genSalt(10);
    const bcryptHash = await bcrypt.hash(testPassword, salt);

    // 1. Define 3 Delivery Boys Data
    const deliveryBoys = [
      {
        employeeId: 'DP-1001',
        fullName: 'Rajesh Kumar',
        phone: '+91 98765 12345',
        email: 'rajesh@vyapar.com',
        vehicleType: 'Honda Activa 6G',
        vehicleNumber: 'KA-01-EQ-4582',
        assignedZone: 'Indiranagar & Koramangala (Zone A)',
        commissionPerDelivery: 45,
        joinedDate: new Date('2025-01-15'),
        profilePhotoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        deliveries: [
          {
            orderId: 'ORD-8041',
            customerName: 'Ananya Deshmukh',
            customerPhone: '+91 98112 34567',
            customerEmail: 'ananya.d@gmail.com',
            deliveryAddress: 'Flat 402, Green Glen Layout, Bellandur, Bengaluru',
            items: ['Basmati Rice 5kg x2', 'Fortune Sunflower Oil 5L x1', 'Aashirvaad Atta 10kg x1'],
            billAmount: 2450,
            paymentType: 'COD',
            deliveryTimeSlot: '10:00 AM - 12:00 PM',
            status: 'Out for delivery',
            otp: '482910',
            paymentCollected: false,
            amountCollected: 0,
            tip: 30,
            notes: 'Call before reaching main gate',
            createdAt: new Date(Date.now() - 2 * 3600 * 1000), // 2 hrs ago
            updatedAt: new Date(Date.now() - 30 * 60 * 1000)
          },
          {
            orderId: 'ORD-8038',
            customerName: 'Karan Malhotra',
            customerPhone: '+91 98223 45678',
            customerEmail: 'karan.m@yahoo.com',
            deliveryAddress: 'House 112, 10th Main, 4th Block, Koramangala, Bengaluru',
            items: ['Amul Butter 500g x2', 'Cadbury Celebration Pack x3', 'Nescafe Classic 200g x1'],
            billAmount: 1850,
            paymentType: 'Prepaid',
            deliveryTimeSlot: '09:00 AM - 11:00 AM',
            status: 'Delivered',
            otp: '739102',
            paymentCollected: true,
            amountCollected: 1850,
            tip: 50,
            notes: 'Delivered to security desk as requested',
            createdAt: new Date(Date.now() - 5 * 3600 * 1000),
            updatedAt: new Date(Date.now() - 4 * 3600 * 1000)
          },
          {
            orderId: 'ORD-8035',
            customerName: 'Pooja Hegde',
            customerPhone: '+91 98334 56789',
            customerEmail: 'pooja.h@outlook.com',
            deliveryAddress: 'Villa 14, Palm Meadows, Old Airport Road, Bengaluru',
            items: ['Organic Honey 500g x1', 'Almonds 1kg x1', 'Cashews 500g x1'],
            billAmount: 3200,
            paymentType: 'COD',
            deliveryTimeSlot: '11:00 AM - 01:00 PM',
            status: 'Delivered',
            otp: '194820',
            paymentCollected: true,
            amountCollected: 3200,
            tip: 40,
            notes: 'Payment collected via GPay QR at doorstep',
            createdAt: new Date(Date.now() - 8 * 3600 * 1000),
            updatedAt: new Date(Date.now() - 6 * 3600 * 1000)
          },
          {
            orderId: 'ORD-8045',
            customerName: 'Rohan Sharma',
            customerPhone: '+91 98445 67890',
            customerEmail: 'rohan.sharma@gmail.com',
            deliveryAddress: 'Apt 204, Prestige Lavender Fields, Indiranagar, Bengaluru',
            items: ['Surf Excel Matic 4kg x1', 'Comfort Fabric Conditioner 2L x1'],
            billAmount: 1420,
            paymentType: 'COD',
            deliveryTimeSlot: '02:00 PM - 04:00 PM',
            status: 'Assigned',
            otp: '',
            paymentCollected: false,
            amountCollected: 0,
            tip: 0,
            notes: 'Handle package with care',
            createdAt: new Date(),
            updatedAt: new Date()
          },
          {
            orderId: 'ORD-8022',
            customerName: 'Siddharth Roy',
            customerPhone: '+91 98556 78901',
            customerEmail: 'siddharth.roy@gmail.com',
            deliveryAddress: 'Plot 45, BDA Layout, HSR Sector 1, Bengaluru',
            items: ['Tata Tea Gold 1kg x2', 'Sugar 5kg x1'],
            billAmount: 980,
            paymentType: 'COD',
            deliveryTimeSlot: '04:00 PM - 06:00 PM',
            status: 'Rescheduled',
            failedReason: 'Customer not available - requested evening 7 PM slot',
            rescheduleSlot: '07:00 PM - 09:00 PM',
            paymentCollected: false,
            amountCollected: 0,
            tip: 0,
            notes: 'Rescheduled upon customer request',
            createdAt: new Date(Date.now() - 24 * 3600 * 1000),
            updatedAt: new Date(Date.now() - 18 * 3600 * 1000)
          }
        ]
      },
      {
        employeeId: 'DP-1002',
        fullName: 'Vikram Singh',
        phone: '+91 98765 67890',
        email: 'vikram@vyapar.com',
        vehicleType: 'TVS King Auto',
        vehicleNumber: 'KA-03-MB-9123',
        assignedZone: 'HSR Layout & Bellandur (Zone B)',
        commissionPerDelivery: 50,
        joinedDate: new Date('2025-02-01'),
        profilePhotoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
        deliveries: [
          {
            orderId: 'ORD-8042',
            customerName: 'Meera Nambiar',
            customerPhone: '+91 98667 89012',
            customerEmail: 'meera.nambiar@gmail.com',
            deliveryAddress: 'Flat 501, Sun City Apartments, Outer Ring Road, Ibblur, Bengaluru',
            items: ['Dettol Liquid Soap 1L x2', 'Lysol Surface Cleaner 5L x1', 'Paper Towel Rolls x6'],
            billAmount: 1650,
            paymentType: 'COD',
            deliveryTimeSlot: '11:00 AM - 01:00 PM',
            status: 'Out for delivery',
            otp: '619304',
            paymentCollected: false,
            amountCollected: 0,
            tip: 25,
            notes: 'Ring doorbell twice',
            createdAt: new Date(Date.now() - 1.5 * 3600 * 1000),
            updatedAt: new Date(Date.now() - 20 * 60 * 1000)
          },
          {
            orderId: 'ORD-8039',
            customerName: 'Arjun Menon',
            customerPhone: '+91 98778 90123',
            customerEmail: 'arjun.menon@techcorp.io',
            deliveryAddress: 'Tower B - 1204, Salarpuria Greenage, Hosur Road, Bengaluru',
            items: ['Sony Wireless Earbuds x1', 'Type-C Fast Charger x2'],
            billAmount: 7990,
            paymentType: 'Prepaid',
            deliveryTimeSlot: '10:00 AM - 12:00 PM',
            status: 'Delivered',
            otp: '840192',
            paymentCollected: true,
            amountCollected: 7990,
            tip: 100,
            notes: 'High value electronics order - verified OTP',
            createdAt: new Date(Date.now() - 4 * 3600 * 1000),
            updatedAt: new Date(Date.now() - 3 * 3600 * 1000)
          },
          {
            orderId: 'ORD-8033',
            customerName: 'Deepak Verma',
            customerPhone: '+91 98889 01234',
            customerEmail: 'deepak.v@hotmail.com',
            deliveryAddress: 'No 78, 27th Main Road, HSR Sector 2, Bengaluru',
            items: ['Pampers Diapers Large Pack x2', 'Johnson Baby Wipes x4'],
            billAmount: 2150,
            paymentType: 'COD',
            deliveryTimeSlot: '08:00 AM - 10:00 AM',
            status: 'Delivered',
            otp: '302914',
            paymentCollected: true,
            amountCollected: 2150,
            tip: 30,
            notes: 'Cash received Rs 2200, balance Rs 50 returned',
            createdAt: new Date(Date.now() - 7 * 3600 * 1000),
            updatedAt: new Date(Date.now() - 5 * 3600 * 1000)
          },
          {
            orderId: 'ORD-8046',
            customerName: 'Sneha Rao',
            customerPhone: '+91 98990 12345',
            customerEmail: 'sneha.rao@gmail.com',
            deliveryAddress: 'Flat 103, Ferns Residency, Sarjapur Road, Bengaluru',
            items: ['Nutella 750g x2', 'Kelloggs Chocos 1kg x1'],
            billAmount: 1280,
            paymentType: 'Prepaid',
            deliveryTimeSlot: '03:00 PM - 05:00 PM',
            status: 'Assigned',
            otp: '',
            paymentCollected: false,
            amountCollected: 0,
            tip: 0,
            notes: 'Leave at front door if no answer',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      },
      {
        employeeId: 'DP-1003',
        fullName: 'Amit Sharma',
        phone: '+91 98765 99887',
        email: 'amit@vyapar.com',
        vehicleType: 'Hero Electric Scooter',
        vehicleNumber: 'KA-05-EV-1122',
        assignedZone: 'Whitefield & Marathahalli (Zone C)',
        commissionPerDelivery: 45,
        joinedDate: new Date('2025-03-01'),
        profilePhotoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
        deliveries: [
          {
            orderId: 'ORD-8043',
            customerName: 'Priya Sundaram',
            customerPhone: '+91 99001 23456',
            customerEmail: 'priya.sundaram@gmail.com',
            deliveryAddress: 'Flat 802, Brigade Cosmopolis, ITPL Main Road, Whitefield, Bengaluru',
            items: ['Nescafé Gold Blend 100g x2', 'Dark Chocolate 85% Cocoa x4'],
            billAmount: 1890,
            paymentType: 'COD',
            deliveryTimeSlot: '12:00 PM - 02:00 PM',
            status: 'Out for delivery',
            otp: '592018',
            paymentCollected: false,
            amountCollected: 0,
            tip: 20,
            notes: 'Call before arriving at security gate',
            createdAt: new Date(Date.now() - 1 * 3600 * 1000),
            updatedAt: new Date(Date.now() - 15 * 60 * 1000)
          },
          {
            orderId: 'ORD-8040',
            customerName: 'Vivek Kulkarni',
            customerPhone: '+91 99112 34567',
            customerEmail: 'vivek.kulkarni@wipro.com',
            deliveryAddress: 'Villa 29, Adarsh Palm Retreat, Outer Ring Road, Marathahalli, Bengaluru',
            items: ['Philips Air Fryer XL x1', 'Prestige Induction Cooktop x1'],
            billAmount: 11450,
            paymentType: 'Prepaid',
            deliveryTimeSlot: '09:00 AM - 11:00 AM',
            status: 'Delivered',
            otp: '912403',
            paymentCollected: true,
            amountCollected: 11450,
            tip: 100,
            notes: 'Delivered directly to customer',
            createdAt: new Date(Date.now() - 5 * 3600 * 1000),
            updatedAt: new Date(Date.now() - 3.5 * 3600 * 1000)
          },
          {
            orderId: 'ORD-8036',
            customerName: 'Divya Reddy',
            customerPhone: '+91 99223 45678',
            customerEmail: 'divya.reddy@gmail.com',
            deliveryAddress: 'Tower 4 - 302, Assetz Marq 2.0, Whitefield, Bengaluru',
            items: ['Milton Thermosteel Water Bottle 1L x2', 'Lock & Lock Glass Containers x3'],
            billAmount: 2890,
            paymentType: 'COD',
            deliveryTimeSlot: '02:00 PM - 04:00 PM',
            status: 'Delivered',
            otp: '401928',
            paymentCollected: true,
            amountCollected: 2890,
            tip: 50,
            notes: 'Collected via UPI QR code scan',
            createdAt: new Date(Date.now() - 9 * 3600 * 1000),
            updatedAt: new Date(Date.now() - 7 * 3600 * 1000)
          },
          {
            orderId: 'ORD-8047',
            customerName: 'Nitin Kapoor',
            customerPhone: '+91 99334 56789',
            customerEmail: 'nitin.kapoor@gmail.com',
            deliveryAddress: 'House 56, AECS Layout, Marathahalli, Bengaluru',
            items: ['Pedigree Adult Dog Food 10kg x1', 'Whiskas Cat Food 3kg x1'],
            billAmount: 3100,
            paymentType: 'COD',
            deliveryTimeSlot: '04:00 PM - 06:00 PM',
            status: 'Assigned',
            otp: '',
            paymentCollected: false,
            amountCollected: 0,
            tip: 0,
            notes: 'Pet food items package',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      }
    ];

    console.log('\n--- SEEDING 3 DELIVERY BOYS & ASSIGNED ORDERS ---');

    for (const boy of deliveryBoys) {
      const { deliveries, ...profileData } = boy;

      // 1. Upsert in driver_profiles collection
      const existingProfile = await db.collection('driver_profiles').findOne({ employeeId: profileData.employeeId });
      let driverId;

      if (existingProfile) {
        driverId = existingProfile._id;
        await db.collection('driver_profiles').updateOne(
          { _id: driverId },
          { $set: { ...profileData, passwordHash: bcryptHash, updatedAt: new Date() } }
        );
        console.log(`✅ Updated Driver Profile: ${profileData.fullName} (${profileData.employeeId})`);
      } else {
        const insertRes = await db.collection('driver_profiles').insertOne({
          ...profileData,
          passwordHash: bcryptHash,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        driverId = insertRes.insertedId;
        console.log(`➕ Created Driver Profile: ${profileData.fullName} (${profileData.employeeId})`);
      }

      // 2. Upsert in users collection for authentication
      await db.collection('users').updateOne(
        { username: profileData.employeeId },
        {
          $set: {
            username: profileData.employeeId,
            password: bcryptHash,
            role: 'deliveryboy',
            status: 'active',
            fullName: profileData.fullName,
            phone: profileData.phone,
            email: profileData.email
          }
        },
        { upsert: true }
      );
      console.log(`🔐 Updated User Login Account: ${profileData.employeeId}`);

      // 3. Clear existing deliveries for this driver & re-insert realistic delivery orders
      const driverIdStr = driverId.toString();
      await db.collection('deliveries').deleteMany({ assignedDriver: driverIdStr });

      const deliveryDocs = deliveries.map(d => ({
        ...d,
        assignedDriver: driverIdStr,
        driverName: profileData.fullName,
        driverPhone: profileData.phone
      }));

      await db.collection('deliveries').insertMany(deliveryDocs);
      console.log(`📦 Seeded ${deliveryDocs.length} real delivery orders for ${profileData.fullName}\n`);
    }

    console.log('🎉 ALL 3 DELIVERY BOYS AND REALISTIC DELIVERY DATA SEEDED SUCCESSFULLY!');
    console.log('\nSummary Credentials:');
    console.log('----------------------------------------------------');
    deliveryBoys.forEach(b => {
      console.log(`• ${b.fullName.padEnd(16)} | ID: ${b.employeeId.padEnd(8)} | Pass: ${testPassword} | Zone: ${b.assignedZone}`);
    });
    console.log('----------------------------------------------------\n');

  } catch (err) {
    console.error('❌ Error Seeding Delivery Boys:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed3DeliveryBoys();
