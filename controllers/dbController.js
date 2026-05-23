const { getDB } = require('../config/db');
const { logAudit } = require('./authController');

// Fetch complete business state for a user
async function getFullDB(req, res) {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ status: "error", message: "Username required" });
  }

  try {
    const db = getDB();
    const products = await db.collection('products').find({ username }).project({ _id: 0 }).toArray();
    const sales = await db.collection('sales').find({ username }).project({ _id: 0 }).toArray();
    const purchases = await db.collection('purchases').find({ username }).project({ _id: 0 }).toArray();
    const parties = await db.collection('parties').find({ username }).project({ _id: 0 }).toArray();
    const transactions = await db.collection('transactions').find({ username }).project({ _id: 0 }).toArray();
    const settings = await db.collection('settings').findOne({ username }, { projection: { _id: 0 } }) || {};

    return res.json({
      products,
      sales,
      purchases,
      parties,
      transactions,
      settings
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Save complete business state for a user
async function saveFullDB(req, res) {
  const { username, products, sales, purchases, parties, transactions, settings } = req.body;
  if (!username) {
    return res.status(400).json({ status: "error", message: "Username required" });
  }

  const db = getDB();
  try {
    // 1. Save products
    await db.collection('products').deleteMany({ username });
    if (products && products.length) {
      const prodsToInsert = products.map(p => ({
        id: p.id, name: p.name, sku: p.sku,
        category: p.category, stock: p.stock, price: p.price,
        notes: p.notes, image: p.image, username,
        taxSlab: p.taxSlab || '18%',
        isTaxInclusive: p.isTaxInclusive === true || p.isTaxInclusive === 'true',
        hsnSac: p.hsnSac || ''
      }));
      await db.collection('products').insertMany(prodsToInsert);
    }

    // 2. Save sales
    await db.collection('sales').deleteMany({ username });
    if (sales && sales.length) {
      const salesToInsert = sales.map(s => ({
        id: s.id, customer: s.customer, date: s.date,
        amount: s.amount, mode: s.mode, status: s.status,
        notes: s.notes, items: s.items || [], username
      }));
      await db.collection('sales').insertMany(salesToInsert);
    }

    // 3. Save purchases
    await db.collection('purchases').deleteMany({ username });
    if (purchases && purchases.length) {
      const purchasesToInsert = purchases.map(p => ({
        id: p.id, supplier: p.supplier, date: p.date,
        amount: p.amount, mode: p.mode, status: p.status,
        notes: p.notes, username
      }));
      await db.collection('purchases').insertMany(purchasesToInsert);
    }

    // 4. Save parties
    await db.collection('parties').deleteMany({ username });
    if (parties && parties.length) {
      const partiesToInsert = parties.map(p => ({
        id: p.id, name: p.name, type: p.type,
        phone: p.phone, balance: p.balance, lastTxn: p.lastTxn,
        notes: p.notes, username,
        state: p.state || 'Karnataka'
      }));
      await db.collection('parties').insertMany(partiesToInsert);
    }

    // 5. Save transactions
    await db.collection('transactions').deleteMany({ username });
    if (transactions && transactions.length) {
      const txnsToInsert = transactions.map(t => ({
        id: t.id, date: t.date, type: t.type,
        party: t.party, debit: t.debit, credit: t.credit,
        balance: t.balance, username,
        debitAccount: t.debitAccount || '',
        creditAccount: t.creditAccount || ''
      }));
      await db.collection('transactions').insertMany(txnsToInsert);
    }

    // 6. Save settings
    const s = settings || {};
    await db.collection('settings').updateOne(
      { username },
      {
        $set: {
          username,
          bizName: s.bizName,
          city: s.city,
          pincode: s.pincode,
          state: s.state,
          email: s.email,
          phone: s.phone,
          whatsapp: s.whatsapp,
          address: s.address,
          theme: s.theme || 'light',
          isGstVerified: s.isGstVerified || 0,
          isPhoneVerified: s.isPhoneVerified || 0,
          isEmailVerified: s.isEmailVerified || 0,
          isWhatsappVerified: s.isWhatsappVerified || 0,
          gstin: s.gstin,
          subscriptionExpiry: s.subscriptionExpiry,
          planName: s.planName,
          planCycle: s.planCycle,
          currency: s.currency || 'INR (₹)'
        }
      },
      { upsert: true }
    );

    return res.json({ status: "success" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Verify GST
async function verifyGST(req, res) {
  const gstin = (req.body.gstin || '').trim().toUpperCase();
  if (!gstin || gstin.length !== 15) {
    return res.status(400).json({ status: 'error', message: 'GSTIN must be exactly 15 characters.' });
  }

  const gstPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstPattern.test(gstin)) {
    return res.status(400).json({ status: 'error', message: 'Invalid GSTIN format (Mathematical check failed).' });
  }

  // Fallback state code matching list
  const stateCodes = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
    "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
    "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "27": "Maharashtra", "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
    "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar Islands",
    "36": "Telangana", "37": "Andhra Pradesh (New)", "38": "Ladakh"
  };

  const stateCode = gstin.substring(0, 2);
  const pan = gstin.substring(2, 12);
  const stateName = stateCodes[stateCode] || "Unknown State";

  await logAudit("SYSTEM", "GST_DECODE", `Decoded GSTIN: ${gstin} (State: ${stateName})`);

  return res.json({
    status: "success",
    message: "GSTIN Validated Successfully",
    data: {
      gstin,
      state: stateName,
      pan,
      type: "Decoded from Structure",
      is_valid: true
    }
  });
}

module.exports = {
  getFullDB,
  saveFullDB,
  verifyGST
};
