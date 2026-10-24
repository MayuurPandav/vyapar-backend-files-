const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendSMS, sendEmail, sendWhatsApp } = require('../utils/notifyAdapters');

// Accountant Mongoose Models
const Customer = require('../models/accountant/Customer');
const Ledger = require('../models/accountant/Ledger');
const Invoice = require('../models/accountant/Invoice');
const JournalEntry = require('../models/accountant/JournalEntry');

// Status Options & Failed Reasons
const statusOptions = ["Assigned", "Out for delivery", "Delivered", "Failed", "Rescheduled"];
const failedReasonOptions = [
  "Customer not available",
  "Customer refused order",
  "Wrong address",
  "Payment not ready",
  "Damaged item",
  "Other"
];

// Helper to normalize items format
function normalizeItems(items) {
  if (Array.isArray(items)) {
    return items.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof items === "string") {
    return items.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

// Helper to sanitize profile (removes hash)
function sanitizeProfile(profile) {
  const data = { ...profile };
  delete data.passwordHash;
  return data;
}

// Driver auth middleware
async function driverAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const db = getDB();

    let driver = null;
    if (decoded.id && ObjectId.isValid(decoded.id)) {
      driver = await db.collection('driver_profiles').findOne({ _id: new ObjectId(decoded.id) });
    }

    if (!driver && decoded.username) {
      driver = await db.collection('driver_profiles').findOne({
        $or: [
          { employeeId: decoded.username },
          { email: decoded.username }
        ]
      });
    }

    if (!driver && decoded.id && ObjectId.isValid(decoded.id)) {
      const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.id) });
      if (user) {
        driver = await db.collection('driver_profiles').findOne({
          $or: [
            { employeeId: user.username },
            { email: user.username },
            { email: user.email }
          ]
        });
      }
    }

    if (!driver) {
      return res.status(401).json({ message: "Driver profile not found" });
    }

    req.driver = driver;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired session token" });
  }
}

// Register Driver
async function registerDriver(req, res, next) {
  try {
    const { fullName, phone, email, employeeId, vehicleType, vehicleNumber, assignedZone, password } = req.body;
    if (!fullName || !email || !employeeId || !password) {
      return res.status(400).json({ message: "All fields except Phone are required" });
    }

    const db = getDB();
    const existingDriver = await db.collection('driver_profiles').findOne({ employeeId });
    if (existingDriver) {
      return res.status(400).json({ message: "Employee ID already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newDriver = {
      fullName,
      phone: phone || "",
      email,
      employeeId,
      vehicleType: vehicleType || "Bike",
      vehicleNumber: vehicleNumber || "",
      assignedZone: assignedZone || "",
      joinedDate: new Date(),
      commissionPerDelivery: 45,
      profilePhotoUrl: "",
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const jwtToken = jwt.sign(
      { id: insertedId.toString(), role: 'delivery_boy' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ driver: sanitizeProfile(driverDoc), token: jwtToken });
  } catch (error) {
    next(error);
  }
}

// Login Driver
async function loginDriver(req, res, next) {
  try {
    const { loginId, password } = req.body;
    if (!loginId || !password) {
      return res.status(400).json({ message: "Employee ID and password are required" });
    }

    const db = getDB();
    const driver = await db.collection('driver_profiles').findOne({ employeeId: loginId });
    if (!driver) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, driver.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const jwtToken = jwt.sign(
      { id: driver._id.toString(), role: 'delivery_boy' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ driver: sanitizeProfile(driver), token: jwtToken });
  } catch (error) {
    next(error);
  }
}

// Get Driver Profile
async function getProfile(req, res) {
  res.json(sanitizeProfile(req.driver));
}

// Update Driver Profile
async function updateProfile(req, res, next) {
  try {
    const db = getDB();
    const driverId = req.driver._id;
    const fields = [
      "fullName",
      "phone",
      "email",
      "employeeId",
      "vehicleType",
      "vehicleNumber",
      "assignedZone",
      "commissionPerDelivery"
    ];

    const updates = { updatedAt: new Date() };
    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (req.body.joinedDate) {
      updates.joinedDate = new Date(req.body.joinedDate);
    }

    await db.collection('driver_profiles').updateOne({ _id: driverId }, { $set: updates });
    const updatedDriver = await db.collection('driver_profiles').findOne({ _id: driverId });
    res.json(sanitizeProfile(updatedDriver));
  } catch (error) {
    next(error);
  }
}

// Change Password
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const db = getDB();
    const driver = req.driver;
    const isMatch = await bcrypt.compare(currentPassword, driver.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.collection('driver_profiles').updateOne({ _id: driver._id }, { $set: { passwordHash, updatedAt: new Date() } });

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    next(error);
  }
}

// Upload Profile Photo
async function uploadProfilePhoto(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Profile photo is required" });
    }

    const db = getDB();
    const driverId = req.driver._id;
    const profilePhotoUrl = `/uploads/profiles/${req.file.filename}`;

    await db.collection('driver_profiles').updateOne({ _id: driverId }, { $set: { profilePhotoUrl, updatedAt: new Date() } });
    const updatedDriver = await db.collection('driver_profiles').findOne({ _id: driverId });
    res.json(sanitizeProfile(updatedDriver));
  } catch (error) {
    next(error);
  }
}

// Helper to calculate daily earnings history
function buildEarningsHistory(deliveries, commissionPerDelivery) {
  const delivered = deliveries.filter((delivery) => delivery.status === "Delivered");
  const grouped = new Map();

  delivered.forEach((delivery) => {
    const dateObj = delivery.updatedAt ? new Date(delivery.updatedAt) : new Date();
    const date = dateObj.toISOString().slice(0, 10);
    const current = grouped.get(date) || {
      date,
      completedDeliveries: 0,
      commissionPerDelivery,
      commissionEarned: 0,
      codCollected: 0
    };

    current.completedDeliveries += 1;
    current.commissionEarned += commissionPerDelivery;
    current.codCollected += delivery.paymentType === "COD" && delivery.paymentCollected ? (delivery.amountCollected || 0) : 0;
    grouped.set(date, current);
  });

  return Array.from(grouped.values()).sort((a, b) => b.date.localeCompare(a.date));
}

// Get Driver Deliveries History
async function getDeliveryHistory(req, res, next) {
  try {
    const db = getDB();
    const driverIdStr = req.driver._id.toString();
    const deliveries = await db.collection('deliveries')
      .find({ assignedDriver: driverIdStr })
      .sort({ updatedAt: -1 })
      .toArray();
    res.json(deliveries);
  } catch (error) {
    next(error);
  }
}

// Get Driver Earnings History
async function getEarningsHistory(req, res, next) {
  try {
    const db = getDB();
    const profile = req.driver;
    const driverIdStr = profile._id.toString();
    const deliveries = await db.collection('deliveries')
      .find({ assignedDriver: driverIdStr })
      .sort({ updatedAt: -1 })
      .toArray();

    const commission = profile.commissionPerDelivery || 45;
    const totalCommission = deliveries.filter((delivery) => delivery.status === "Delivered").length * commission;

    res.json({
      commissionPerDelivery: commission,
      totalCommission,
      history: buildEarningsHistory(deliveries, commission)
    });
  } catch (error) {
    next(error);
  }
}

// Helper to count dashboard aggregate stats
function buildDashboard(deliveries) {
  const total = deliveries.length;
  const pending = deliveries.filter((item) => ["Assigned", "Out for delivery", "Rescheduled"].includes(item.status)).length;
  const completed = deliveries.filter((item) => item.status === "Delivered").length;
  const failed = deliveries.filter((item) => item.status === "Failed").length;
  const codTotal = deliveries
    .filter((item) => item.paymentType === "COD")
    .reduce((sum, item) => sum + (item.billAmount || 0), 0);
  const codCollected = deliveries
    .filter((item) => item.paymentType === "COD" && item.paymentCollected)
    .reduce((sum, item) => sum + (item.amountCollected || 0), 0);

  return { total, pending, completed, failed, codTotal, codCollected };
}

// Get Driver Dashboard Stats
async function getDriverDashboard(req, res, next) {
  try {
    const db = getDB();
    const driverIdStr = req.driver._id.toString();
    const deliveries = await db.collection('deliveries')
      .find({ assignedDriver: driverIdStr })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(buildDashboard(deliveries));
  } catch (error) {
    next(error);
  }
}

// Get Deliveries assigned to driver
async function listDriverDeliveries(req, res, next) {
  try {
    const db = getDB();
    const driverIdStr = req.driver._id.toString();
    const filter = { assignedDriver: driverIdStr };

    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.paymentType) {
      filter.paymentType = req.query.paymentType;
    }
    if (req.query.q) {
      const q = new RegExp(req.query.q, "i");
      filter.$or = [
        { orderId: q },
        { customerName: q },
        { customerPhone: q },
        { deliveryAddress: q }
      ];
    }

    const deliveries = await db.collection('deliveries')
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();
    res.json(deliveries);
  } catch (error) {
    next(error);
  }
}

// Get single delivery detail
async function getDriverDeliveryDetail(req, res, next) {
  try {
    const db = getDB();
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid delivery id" });
    }
    const delivery = await db.collection('deliveries').findOne({ _id: new ObjectId(id), assignedDriver: req.driver._id.toString() });
    if (!delivery) {
      return res.status(404).json({ message: "Delivery not found or not assigned to you" });
    }
    res.json(delivery);
  } catch (error) {
    next(error);
  }
}

// Add manually custom delivery
async function createDriverDelivery(req, res, next) {
  try {
    const db = getDB();
    const count = await db.collection('deliveries').countDocuments();
    const orderId = `ORD-${String(1001 + count).padStart(4, "0")}`;

    const newDelivery = {
      assignedDriver: req.driver._id.toString(),
      orderId,
      customerName: req.body.customerName,
      customerPhone: req.body.customerPhone,
      deliveryAddress: req.body.deliveryAddress,
      items: normalizeItems(req.body.items),
      billAmount: Number(req.body.billAmount || 0),
      paymentType: req.body.paymentType || "COD",
      deliveryTimeSlot: req.body.deliveryTimeSlot,
      status: "Assigned",
      proofPhotoUrl: "",
      paymentCollected: false,
      amountCollected: 0,
      failedReason: "",
      rescheduleSlot: "",
      returnInitiated: false,
      tip: 0,
      otp: "",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('deliveries').insertOne(newDelivery);
    const io = req.app.get('socketio');
    if (io) io.emit('delivery_updated', newDelivery);
    res.status(201).json(newDelivery);
  } catch (error) {
    next(error);
  }
}

// Update general delivery options
async function updateDriverDelivery(req, res, next) {
  try {
    const db = getDB();
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid delivery id" });
    }
    const delivery = await db.collection('deliveries').findOne({ _id: new ObjectId(id), assignedDriver: req.driver._id.toString() });
    if (!delivery) {
      return res.status(404).json({ message: "Delivery not found or not assigned to you" });
    }

    const fields = [
      "customerName",
      "customerPhone",
      "deliveryAddress",
      "billAmount",
      "paymentType",
      "deliveryTimeSlot",
      "status",
      "failedReason",
      "rescheduleSlot",
      "paymentCollected",
      "amountCollected",
      "returnInitiated",
      "tip"
    ];

    const updates = { updatedAt: new Date() };
    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (req.body.items !== undefined) {
      updates.items = normalizeItems(req.body.items);
    }
    if (req.body.rescheduleDate) {
      updates.rescheduleDate = new Date(req.body.rescheduleDate);
    }
    if (req.body.returnInitiated && !delivery.returnInitiatedAt) {
      updates.returnInitiatedAt = new Date();
    }

    await db.collection('deliveries').updateOne({ _id: new ObjectId(id) }, { $set: updates });
    const updatedDoc = await db.collection('deliveries').findOne({ _id: new ObjectId(id) });
    const io = req.app.get('socketio');
    if (io) io.emit('delivery_updated', updatedDoc);
    res.json(updatedDoc);
  } catch (error) {
    next(error);
  }
}

// Update status (e.g. Generated OTP for Out for delivery, verification on Delivered)
async function updateDeliveryStatus(req, res, next) {
  try {
    const db = getDB();
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid delivery id" });
    }
    const delivery = await db.collection('deliveries').findOne({ _id: new ObjectId(id), assignedDriver: req.driver._id.toString() });
    if (!delivery) {
      return res.status(404).json({ message: "Delivery not found or not assigned to you" });
    }

    const { status, failedReason, rescheduleDate, rescheduleSlot } = req.body;
    const updates = { status, updatedAt: new Date() };

    if (status === "Out for delivery" && !delivery.otp) {
      updates.otp = Math.floor(100000 + Math.random() * 900000).toString();
      console.log(`[REAL-TIME OTP] Generated verification OTP: ${updates.otp} for Order: ${delivery.orderId} (Customer: ${delivery.customerName || 'N/A'})`);
      
      // Send notifications asynchronously so it doesn't block the API route response
      (async () => {
        try {
          const username = delivery.username || 'admin@vyapar.com';
          const settings = await db.collection('settings').findOne({ username }) || {};
          const businessName = settings.businessName || settings.bizName || 'Vyapar';

          const config = await db.collection('notification_configs').findOne({ username });
          const notifyVia = config?.notifyVia || { email: true, whatsapp: false, sms: false };

          const customerPhone = delivery.customerPhone || delivery.customer?.phone;
          const customerName = delivery.customerName || delivery.customer?.name || 'Customer';

          let party = null;
          if (customerPhone || customerName) {
            const orQuery = [];
            if (customerPhone) orQuery.push({ phone: customerPhone });
            if (customerName) orQuery.push({ name: customerName });
            party = await db.collection('parties').findOne({
              username,
              $or: orQuery
            });
          }

          const phone = customerPhone || (party && party.phone);
          const email = delivery.customerEmail || delivery.customer?.email || (party && party.email);
          const whatsappNo = delivery.customer?.whatsappNumber || (party && party.whatsappNumber) || phone;

          const smsMessage = `Hello ${customerName}, your order ${delivery.orderId || ''} is out for delivery. Please share OTP ${updates.otp} with the delivery boy to verify your order. Regards, ${businessName}.`;
          const emailSubject = `Order ${delivery.orderId || ''} Out for Delivery - OTP Verification`;
          const emailHtml = `<p>Dear ${customerName},</p><p>Your order <strong>${delivery.orderId || ''}</strong> is out for delivery.</p><p>Please share the verification OTP <strong>${updates.otp}</strong> with the delivery driver to complete the delivery.</p><p>Regards,<br/><strong>${businessName}</strong></p>`;

          if (notifyVia.sms && phone) {
            sendSMS(phone, smsMessage)
              .then(res => console.log(`[REAL-TIME OTP] SMS sent to ${phone}:`, res))
              .catch(err => console.error('[REAL-TIME OTP] Failed to send SMS:', err.message));
          }

          if (notifyVia.whatsapp && whatsappNo) {
            sendWhatsApp(whatsappNo, smsMessage)
              .then(res => console.log(`[REAL-TIME OTP] WhatsApp sent to ${whatsappNo}:`, res))
              .catch(err => console.error('[REAL-TIME OTP] Failed to send WhatsApp:', err.message));
          }

          if (notifyVia.email && email) {
            sendEmail(email, emailSubject, emailHtml)
              .then(res => console.log(`[REAL-TIME OTP] Email sent to ${email}:`, res))
              .catch(err => console.error('[REAL-TIME OTP] Failed to send Email:', err.message));
          }
        } catch (err) {
          console.error('[REAL-TIME OTP] Error in notification worker:', err.message);
        }
      })();
    }

    if (status === "Delivered" && delivery.otp) {
      if (req.body.otp !== delivery.otp) {
        return res.status(400).json({ message: "Invalid Delivery Verification OTP. Please check with the customer!" });
      }
    }

    updates.failedReason = status === "Failed" ? failedReason || "Other" : "";
    if (status === "Rescheduled" && rescheduleDate) {
      updates.rescheduleDate = new Date(rescheduleDate);
    }
    updates.rescheduleSlot = status === "Rescheduled" ? rescheduleSlot || "" : "";

    if (status === "Delivered" && delivery.paymentType === "Prepaid") {
      updates.paymentCollected = true;
      updates.amountCollected = delivery.billAmount;
    }

    if (req.body.tip !== undefined) {
      updates.tip = Number(req.body.tip || 0);
    }

    await db.collection('deliveries').updateOne({ _id: new ObjectId(id) }, { $set: updates });
    const updatedDoc = await db.collection('deliveries').findOne({ _id: new ObjectId(id) });

    // Sync to Accountant in real-time
    if (updatedDoc) {
      await syncDeliveryPaymentToAccountant(updatedDoc, req);
    }

    const io = req.app.get('socketio');
    if (io) io.emit('delivery_updated', updatedDoc);
    res.json(updatedDoc);
  } catch (error) {
    next(error);
  }
}

// Helper to sync driver payment collections to Accountant models in real-time
async function syncDeliveryPaymentToAccountant(deliveryDoc, req = null) {
  try {
    if (!deliveryDoc.paymentCollected || !deliveryDoc.orderId) {
      return;
    }

    const invoice = await Invoice.findOne({ invoiceNumber: deliveryDoc.orderId, status: 'unpaid' });
    if (!invoice) {
      console.log(`[ACCOUNTANT SYNC] No unpaid Accountant invoice found for order: ${deliveryDoc.orderId}`);
      return;
    }

    invoice.status = 'paid';
    await invoice.save();
    console.log(`[ACCOUNTANT SYNC] Marked Invoice ${invoice.invoiceNumber} as PAID.`);

    if (invoice.customer) {
      const customer = await Customer.findById(invoice.customer);
      if (customer) {
        customer.openingBalance = Math.max(0, (customer.openingBalance || 0) - invoice.amount);
        await customer.save();
        console.log(`[ACCOUNTANT SYNC] Reduced Accountant Customer (${customer.name}) opening balance by ${invoice.amount}.`);
      }
    } else if (invoice.customerName) {
      const customer = await Customer.findOne({ name: invoice.customerName });
      if (customer) {
        customer.openingBalance = Math.max(0, (customer.openingBalance || 0) - invoice.amount);
        await customer.save();
        console.log(`[ACCOUNTANT SYNC] Reduced Accountant Customer (${customer.name}) opening balance by ${invoice.amount}.`);
      }
    }

    const cashLedger = await Ledger.findOne({ name: 'Cash' });
    const bankLedger = await Ledger.findOne({ name: 'Bank' });
    const arLedger = await Ledger.findOne({ name: 'Accounts Receivable' });

    let debitLedger = cashLedger;
    const payMethod = (req?.body?.paymentMethod || req?.body?.paymentMode || deliveryDoc.paymentMethod || deliveryDoc.paymentMode || '').toLowerCase();
    if (payMethod.match(/bank|upi|card|online/)) {
      debitLedger = bankLedger;
    }

    if (debitLedger && arLedger) {
      await JournalEntry.create({
        narration: `Payment settlement for Invoice ${invoice.invoiceNumber} via Driver Collection`,
        entries: [
          { ledger: debitLedger._id, type: 'debit', amount: invoice.amount },
          { ledger: arLedger._id, type: 'credit', amount: invoice.amount }
        ],
        date: new Date()
      });

      debitLedger.balance = (debitLedger.balance || 0) + invoice.amount;
      await debitLedger.save();

      arLedger.balance = (arLedger.balance || 0) - invoice.amount;
      await arLedger.save();
      console.log(`[ACCOUNTANT SYNC] Posted Journal Entry: Debited ${debitLedger.name}, Credited ${arLedger.name} by ${invoice.amount}.`);
    } else {
      console.warn(`[ACCOUNTANT SYNC] Missing Cash, Bank or Accounts Receivable ledger for journal settlement.`);
    }

  } catch (err) {
    console.error('[ACCOUNTANT SYNC] Failed to sync driver payment settlement:', err.message || err);
  }
}

// Collect Cash payment COD
async function collectPayment(req, res, next) {
  try {
    const db = getDB();
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid delivery id" });
    }
    const delivery = await db.collection('deliveries').findOne({ _id: new ObjectId(id), assignedDriver: req.driver._id.toString() });
    if (!delivery) {
      return res.status(404).json({ message: "Delivery not found or not assigned to you" });
    }

    const updates = {
      paymentCollected: Boolean(req.body.paymentCollected),
      amountCollected: Number(req.body.amountCollected || 0),
      updatedAt: new Date()
    };

    if (req.body.tip !== undefined) {
      updates.tip = Number(req.body.tip || 0);
    }

    await db.collection('deliveries').updateOne({ _id: new ObjectId(id) }, { $set: updates });
    const updatedDoc = await db.collection('deliveries').findOne({ _id: new ObjectId(id) });

    // Sync to Accountant in real-time
    if (updatedDoc) {
      await syncDeliveryPaymentToAccountant(updatedDoc, req);
    }

    const io = req.app.get('socketio');
    if (io) io.emit('delivery_updated', updatedDoc);
    res.json(updatedDoc);
  } catch (error) {
    next(error);
  }
}

// Upload proof photo
async function uploadProofPhoto(req, res, next) {
  try {
    const db = getDB();
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid delivery id" });
    }
    const delivery = await db.collection('deliveries').findOne({ _id: new ObjectId(id), assignedDriver: req.driver._id.toString() });
    if (!delivery) {
      return res.status(404).json({ message: "Delivery not found or not assigned to you" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Proof photo is required" });
    }

    const proofPhotoUrl = `/uploads/proofs/${req.file.filename}`;
    await db.collection('deliveries').updateOne({ _id: new ObjectId(id) }, { $set: { proofPhotoUrl, updatedAt: new Date() } });
    const updatedDoc = await db.collection('deliveries').findOne({ _id: new ObjectId(id) });
    const io = req.app.get('socketio');
    if (io) io.emit('delivery_updated', updatedDoc);
    res.json(updatedDoc);
  } catch (error) {
    next(error);
  }
}

// Initiate Return
async function initiateReturn(req, res, next) {
  try {
    const db = getDB();
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid delivery id" });
    }
    const delivery = await db.collection('deliveries').findOne({ _id: new ObjectId(id), assignedDriver: req.driver._id.toString() });
    if (!delivery) {
      return res.status(404).json({ message: "Delivery not found or not assigned to you" });
    }

    await db.collection('deliveries').updateOne({ _id: new ObjectId(id) }, { $set: { returnInitiated: true, returnInitiatedAt: new Date(), updatedAt: new Date() } });
    const updatedDoc = await db.collection('deliveries').findOne({ _id: new ObjectId(id) });
    const io = req.app.get('socketio');
    if (io) io.emit('delivery_updated', updatedDoc);
    res.json(updatedDoc);
  } catch (error) {
    next(error);
  }
}

// Delete delivery
async function deleteDriverDelivery(req, res, next) {
  try {
    const db = getDB();
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid delivery id" });
    }
    const delivery = await db.collection('deliveries').findOne({ _id: new ObjectId(id), assignedDriver: req.driver._id.toString() });
    if (!delivery) {
      return res.status(404).json({ message: "Delivery not found or not assigned to you" });
    }

    await db.collection('deliveries').deleteOne({ _id: new ObjectId(id) });
    res.json({ message: "Delivery deleted successfully" });
  } catch (error) {
    next(error);
  }
}

// Seed / Sync deliveries from Vyapar SQL/Atlas backend sales ledger
async function seedDeliveries(req, res, next) {
  try {
    const db = getDB();
    const driverIdStr = req.driver._id.toString();

    // Delete existing deliveries for this driver
    await db.collection('deliveries').deleteMany({ assignedDriver: driverIdStr });

    let realDeliveries = [];
    try {
      // Fetch sales data from our own unified DB API
      const username = 'admin@vyapar.com';
      const sales = await db.collection('sales').find({ username }).toArray();

      realDeliveries = sales.map((sale, index) => {
        const paymentType = sale.mode === "Credit (Due)" ? "COD" : "Prepaid";
        let status = "Assigned";
        if (sale.status === "Paid") {
          status = "Delivered";
        }

        let itemsList = ["Store Order"];
        if (Array.isArray(sale.items) && sale.items.length) {
          itemsList = sale.items.map(it => `${it.name} x${it.qty}`);
        } else if (sale.notes) {
          itemsList = [sale.notes];
        }

        return {
          orderId: sale.id || `ORD-${1001 + index}`,
          customerName: sale.customer || "Valued Customer",
          customerPhone: "9876543210",
          deliveryAddress: "MG Road, Indiranagar, Bengaluru, Karnataka",
          items: itemsList,
          billAmount: parseFloat(sale.amount) || 0,
          paymentType: paymentType,
          deliveryTimeSlot: "11 AM - 1 PM",
          status: status,
          paymentCollected: sale.status === "Paid",
          amountCollected: sale.status === "Paid" ? parseFloat(sale.amount) : 0
        };
      });
    } catch (err) {
      console.log("Failed to seed from db collection, using fallback:", err.message);
    }

    if (!realDeliveries.length) {
      // Fallback demo data
      const demoDeliveries = [
        {
          orderId: "ORD-1001",
          customerName: "Amit Sharma",
          customerPhone: "9876543210",
          deliveryAddress: "MG Road Metro Station, Bengaluru, Karnataka",
          items: ["Running shoes x1", "Socks pack x1"],
          billAmount: 1499,
          paymentType: "COD",
          deliveryTimeSlot: "9 AM - 11 AM",
          status: "Delivered",
          paymentCollected: true,
          amountCollected: 1499
        },
        {
          orderId: "ORD-1002",
          customerName: "Priya Nair",
          customerPhone: "9988776655",
          deliveryAddress: "12th Main Road, Indiranagar, Bengaluru, Karnataka",
          items: ["Handbag x1"],
          billAmount: 2399,
          paymentType: "Prepaid",
          deliveryTimeSlot: "11 AM - 1 PM",
          status: "Out for delivery"
        },
        {
          orderId: "ORD-1003",
          customerName: "Vikram Rao",
          customerPhone: "9123456780",
          deliveryAddress: "ITPL Main Road, Whitefield, Bengaluru, Karnataka",
          items: ["Laptop stand x1", "Mouse pad x1"],
          billAmount: 899,
          paymentType: "COD",
          deliveryTimeSlot: "1 PM - 3 PM",
          status: "Assigned"
        }
      ];
      realDeliveries = demoDeliveries;
    }

    const seedData = realDeliveries.map((delivery) => ({
      ...delivery,
      assignedDriver: driverIdStr,
      proofPhotoUrl: delivery.proofPhotoUrl || "",
      failedReason: delivery.failedReason || "",
      rescheduleSlot: delivery.rescheduleSlot || "",
      returnInitiated: delivery.returnInitiated || false,
      tip: delivery.tip || 0,
      otp: delivery.otp || "",
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    await db.collection('deliveries').insertMany(seedData);
    res.json({ message: "Real-time active sales loaded from your Vyapar backend!" });
  } catch (error) {
    next(error);
  }
}

// Maps and system options
async function getOptions(req, res) {
  res.json({
    statuses: statusOptions,
    failedReasons: failedReasonOptions,
    paymentTypes: ["COD", "Prepaid"]
  });
}

async function getMapProvider(req, res) {
  res.json({
    provider: "Google Maps",
    portalUrl: "https://www.google.com/maps",
    searchApiUrl: "",
    tokenConfigured: false,
    note: "Ecosystem utilizes live interactive Google Maps embedding and public directional routing interfaces."
  });
}

async function searchMap(req, res) {
  const query = String(req.query.query || "").trim();
  if (!query) {
    return res.status(400).json({ message: "query is required" });
  }
  res.json({
    provider: "Google Maps",
    query,
    portalUrl: "https://www.google.com/maps",
    status: "verified"
  });
}

async function getNavigationUrl(req, res) {
  const destination = String(req.query.destination || "").trim();
  if (!destination) {
    return res.status(400).json({ message: "destination is required" });
  }
  res.json({
    provider: "Google Maps",
    destination,
    url: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`,
    note: "Routes directly to Google Maps navigation directions."
  });
}

// Public customer tracking endpoint (no auth required)
async function getPublicOrderTracking(req, res, next) {
  try {
    const db = getDB();
    const orderIdParam = req.params.orderId;
    if (!orderIdParam) {
      return res.status(400).json({ message: "Order ID or tracking parameter is required" });
    }

    const orQuery = [{ orderId: orderIdParam }];
    if (ObjectId.isValid(orderIdParam)) {
      orQuery.push({ _id: new ObjectId(orderIdParam) });
    }

    const delivery = await db.collection('deliveries').findOne({ $or: orQuery });
    if (!delivery) {
      return res.status(404).json({ message: "Order not found for tracking" });
    }

    let driver = null;
    if (delivery.assignedDriver) {
      if (ObjectId.isValid(delivery.assignedDriver)) {
        driver = await db.collection('driver_profiles').findOne({ _id: new ObjectId(delivery.assignedDriver) });
      } else {
        driver = await db.collection('driver_profiles').findOne({ employeeId: delivery.assignedDriver });
      }
    }

    // Default Bengaluru store coordinates (Merchant Store)
    const storeLocation = { lat: 12.9716, lng: 77.5946, name: "Vyapar Central Warehouse" };
    // Customer location
    const customerLocation = { lat: 12.9352, lng: 77.6245, name: delivery.deliveryAddress || "Customer Address" };

    // Simulated or live driver position
    let driverLocation = { ...storeLocation };
    let isLiveGps = false;

    if (delivery.currentLocation && typeof delivery.currentLocation.lat === 'number') {
      driverLocation = delivery.currentLocation;
      isLiveGps = true;
    } else if (driver && driver.currentLocation && typeof driver.currentLocation.lat === 'number') {
      driverLocation = driver.currentLocation;
      isLiveGps = true;
    } else if (delivery.status === "Out for delivery") {
      driverLocation = { lat: 12.9534, lng: 77.6095 }; // mid-way live marker
    } else if (delivery.status === "Delivered") {
      driverLocation = { ...customerLocation };
    }

    // Calculate real distance & dynamic ETA
    const dLat = (customerLocation.lat - driverLocation.lat) * Math.PI / 180;
    const dLon = (customerLocation.lng - driverLocation.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(driverLocation.lat * Math.PI / 180) * Math.cos(customerLocation.lat * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = Number((6371 * c).toFixed(2));
    const etaMinutes = delivery.status === 'Delivered'
      ? 0
      : Math.max(2, Math.round((distanceKm / 25) * 60 + 3));

    res.json({
      orderId: delivery.orderId,
      customerName: delivery.customerName,
      customerPhone: delivery.customerPhone,
      deliveryAddress: delivery.deliveryAddress,
      items: delivery.items || [],
      billAmount: delivery.billAmount || 0,
      paymentType: delivery.paymentType || "COD",
      paymentCollected: delivery.paymentCollected || false,
      status: delivery.status || "Assigned",
      deliveryTimeSlot: delivery.deliveryTimeSlot || "Today",
      otpRequired: Boolean(delivery.otp),
      proofPhotoUrl: delivery.proofPhotoUrl || "",
      notes: delivery.notes || "",
      updatedAt: delivery.updatedAt,
      distanceKm,
      etaMinutes,
      isLiveGps,
      driver: driver ? {
        fullName: driver.fullName,
        phone: driver.phone,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        assignedZone: driver.assignedZone,
        profilePhotoUrl: driver.profilePhotoUrl || ""
      } : null,
      locations: {
        store: storeLocation,
        customer: customerLocation,
        driver: driverLocation
      }
    });
  } catch (error) {
    next(error);
  }
}

// Live Driver GPS Location update
async function updateDriverLocation(req, res, next) {
  try {
    const db = getDB();
    const { lat, lng, speed, heading, accuracy, orderId } = req.body;
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ message: "Latitude and Longitude are required" });
    }

    const locData = {
      lat: Number(lat),
      lng: Number(lng),
      speed: Number(speed) || 0,
      heading: Number(heading) || 0,
      accuracy: Number(accuracy) || 10,
      updatedAt: new Date()
    };

    const driverId = req.driver?._id;
    if (driverId) {
      await db.collection('driver_profiles').updateOne(
        { _id: new ObjectId(driverId) },
        { $set: { currentLocation: locData, lastActiveAt: new Date() } }
      );
    }

    // Update active deliveries for this driver
    const deliveryQuery = {};
    if (orderId) {
      deliveryQuery.orderId = orderId;
    } else if (driverId) {
      deliveryQuery.$or = [
        { assignedDriver: driverId.toString() },
        { assignedDriver: new ObjectId(driverId) }
      ];
      deliveryQuery.status = { $in: ['Out for delivery', 'Picked Up', 'Assigned'] };
    }

    if (Object.keys(deliveryQuery).length > 0) {
      await db.collection('deliveries').updateMany(
        deliveryQuery,
        { $set: { currentLocation: locData, lastLocationUpdate: new Date() } }
      );
    }

    return res.json({
      status: "success",
      message: "Driver coordinates updated successfully",
      location: locData
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  driverAuthMiddleware,
  registerDriver,
  loginDriver,
  getProfile,
  updateProfile,
  changePassword,
  uploadProfilePhoto,
  getDeliveryHistory,
  getEarningsHistory,
  getDriverDashboard,
  listDriverDeliveries,
  getDriverDeliveryDetail,
  createDriverDelivery,
  updateDriverDelivery,
  updateDeliveryStatus,
  collectPayment,
  uploadProofPhoto,
  initiateReturn,
  deleteDriverDelivery,
  seedDeliveries,
  getOptions,
  getMapProvider,
  searchMap,
  getNavigationUrl,
  getPublicOrderTracking,
  updateDriverLocation
};
