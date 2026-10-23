const Bill = require('../models/staff/Bill');
const Order = require('../models/staff/Order');
const Product = require('../models/staff/Product');
const Customer = require('../models/staff/Customer');
const User = require('../models/staff/User');

async function seedStaffData() {
  console.log('=== SEEDING STAFF TRANSACTIONAL DATA ===');
  try {
    // Check if we already have bills seeded
    const billCount = await Bill.countDocuments();
    const orderCount = await Order.countDocuments();

    if (billCount > 0 && orderCount > 0) {
      console.log('Staff transactional data already exists. Skipping...');
      return;
    }

    // Get a staff user to assign as creator
    const staffUser = await User.findOne({ email: 'staff@vyapar.com' });
    const creatorId = staffUser ? staffUser._id : null;

    // Get sample products and customers
    const products = await Product.find({}).limit(5);
    const customers = await Customer.find({}).limit(5);

    if (products.length === 0 || customers.length === 0) {
      console.log('⚠️ Cannot seed bills: Products or Customers collections are empty.');
      return;
    }

    // 1. Seed Bills (Today's Sales & Revenue)
    if (billCount === 0) {
      console.log('Seeding default Staff Bills...');
      const today = new Date();
      
      const sampleBills = [
        {
          invoiceNumber: 'INV-20260001',
          type: 'sale',
          customerId: customers[0]._id,
          customerName: customers[0].name,
          customerPhone: customers[0].phone || '9999988888',
          products: [
            {
              productId: products[0]._id,
              name: products[0].productName || products[0].name,
              price: products[0].price,
              quantity: 1,
              amount: products[0].price,
            }
          ],
          subtotal: products[0].price,
          taxableTotal: products[0].price,
          totalAmount: products[0].price,
          paidAmount: products[0].price,
          dueAmount: 0,
          paymentMode: 'UPI',
          upiAmount: products[0].price,
          billDate: today,
          status: 'Completed',
          createdBy: creatorId,
        },
        {
          invoiceNumber: 'INV-20260002',
          type: 'sale',
          customerId: customers[1]._id,
          customerName: customers[1].name,
          customerPhone: customers[1].phone || '9999977777',
          products: [
            {
              productId: products[1]._id,
              name: products[1].productName || products[1].name,
              price: products[1].price,
              quantity: 2,
              amount: products[1].price * 2,
            }
          ],
          subtotal: products[1].price * 2,
          taxableTotal: products[1].price * 2,
          totalAmount: products[1].price * 2,
          paidAmount: products[1].price * 2,
          dueAmount: 0,
          paymentMode: 'Cash',
          cashAmount: products[1].price * 2,
          billDate: today,
          status: 'Completed',
          createdBy: creatorId,
        },
        {
          invoiceNumber: 'INV-20260003',
          type: 'sale',
          customerId: customers[2]._id,
          customerName: customers[2].name,
          customerPhone: customers[2].phone || '9999966666',
          products: [
            {
              productId: products[0]._id,
              name: products[0].productName || products[0].name,
              price: products[0].price,
              quantity: 1,
              amount: products[0].price,
            }
          ],
          subtotal: products[0].price,
          taxableTotal: products[0].price,
          totalAmount: products[0].price,
          paidAmount: 0,
          dueAmount: products[0].price,
          paymentMode: 'Cash',
          billDate: today,
          status: 'Pending',
          createdBy: creatorId,
        }
      ];

      await Bill.insertMany(sampleBills);
      console.log('Seeded default bills.');
    }

    // 2. Seed Orders
    if (orderCount === 0) {
      console.log('Seeding default Staff Orders...');
      const today = new Date();
      const defaultOrders = [
        {
          orderId: 'ORD-1001',
          customerName: customers[0].name,
          amount: products[0].price,
          status: 'Pending',
          deliveryStatus: 'Pending',
          orderDate: today,
        },
        {
          orderId: 'ORD-1002',
          customerName: customers[1].name,
          amount: products[1].price * 2,
          status: 'Processing',
          deliveryStatus: 'Assigned',
          orderDate: today,
        },
        {
          orderId: 'ORD-1003',
          customerName: customers[2].name,
          amount: products[0].price,
          status: 'Completed',
          deliveryStatus: 'Delivered',
          orderDate: today,
        }
      ];

      await Order.insertMany(defaultOrders);
      console.log('Seeded default orders.');
    }

    console.log('✅ Staff transactional data seeding completed successfully.');
  } catch (err) {
    console.error('❌ Error seeding staff data:', err.message || err);
  }
}

module.exports = seedStaffData;
