const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const { logAudit } = require('./authController');
const PDFDocument = require('pdfkit');

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
    const expenses = await db.collection('expenses').find({ username }).project({ _id: 0 }).toArray();
    const offers = await db.collection('offers').find({ username }).project({ _id: 0 }).toArray();
    const settings = await db.collection('settings').findOne({ username }, { projection: { _id: 0 } }) || {};

    return res.json({
      products,
      sales,
      purchases,
      parties,
      transactions,
      expenses,
      offers,
      settings
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Save complete business state for a user
async function saveFullDB(req, res) {
  const { username, products, sales, purchases, parties, transactions, expenses, offers, settings } = req.body;
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
        hsnSac: p.hsnSac || '',
        barcode: p.barcode || '',
        subCategory: p.subCategory || '',
        brand: p.brand || '',
        unit: p.unit || 'pcs',
        purchasePrice: Number(p.purchasePrice) || 0,
        wholesalePrice: Number(p.wholesalePrice) || 0,
        lowStockLevel: Number(p.lowStockLevel) || 5,
        expiryDate: p.expiryDate || null,
        description: p.description || '',
        rackLocation: p.rackLocation || '',
        godownName: p.godownName || '',
        serialNumber: p.serialNumber || '',
        batchNumber: p.batchNumber || ''
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
        notes: p.notes, username,
        purchaseType: p.purchaseType || 'Purchase Invoice',
        items: p.items || [],
        additionalCharges: Number(p.additionalCharges) || 0,
        dueDate: p.dueDate || null
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
        state: p.state || 'Karnataka',
        email: p.email || '',
        whatsappNumber: p.whatsappNumber || '',
        billingAddress: p.billingAddress || '',
        shippingAddress: p.shippingAddress || '',
        gstin: p.gstin || '',
        pan: p.pan || '',
        customerGroup: p.customerGroup || 'Retail',
        creditLimit: Number(p.creditLimit) || 0,
        paymentTerms: p.paymentTerms || 'Net 30',
        openingBalance: Number(p.openingBalance) || 0,
        bankDetails: p.bankDetails || ''
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

    // 5.5 Save expenses
    await db.collection('expenses').deleteMany({ username });
    if (expenses && expenses.length) {
      const expsToInsert = expenses.map(e => ({
        id: e.id, date: e.date, category: e.category,
        amount: Number(e.amount) || 0, paymentMode: e.paymentMode || 'Cash',
        description: e.description || '', username
      }));
      await db.collection('expenses').insertMany(expsToInsert);
    }

    // 5.6 Save offers
    await db.collection('offers').deleteMany({ username });
    if (offers && offers.length) {
      const offersToInsert = offers.map(o => ({
        id: o.id, code: o.code, type: o.type, value: Number(o.value) || 0,
        startDate: o.startDate, endDate: o.endDate, minBillAmount: Number(o.minBillAmount) || 0,
        applicableCategory: o.applicableCategory || '', applicableProduct: o.applicableProduct || '',
        usageLimit: Number(o.usageLimit) || 0, usedCount: Number(o.usedCount) || 0,
        isActive: !!o.isActive, username
      }));
      await db.collection('offers').insertMany(offersToInsert);
    }

    // 6. Save settings
    const s = settings || {};
    const existingSettings = await db.collection('settings').findOne({ username }) || {};
    await db.collection('settings').updateOne(
      { username },
      {
        $set: {
          ...s,
          username,
          subscriptionExpiry: existingSettings.subscriptionExpiry || s.subscriptionExpiry,
          planName: existingSettings.planName || s.planName,
          planCycle: existingSettings.planCycle || s.planCycle
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

// Create a sale (single-record endpoint)
async function createSale(req, res) {
  const sale = req.body;
  const username = sale.username;
  if (!username) return res.status(400).json({ status: 'error', message: 'Username required' });
  try {
    const db = getDB();
    // generate invoice id
    const id = `INV-${Date.now()}`;
    const saleDoc = { ...sale, id, username };
    await db.collection('sales').insertOne(saleDoc);

    // create transaction
    const lastTxn = await db.collection('transactions').find({ username }).sort({ _id: -1 }).limit(1).toArray();
    const lastBalance = lastTxn[0]?.balance || 0;
    const txnId = `TXN-${Date.now()}`;
    const credit = Number(sale.amount) || 0;
    const newTxn = { id: txnId, date: sale.date || new Date().toISOString().substring(0,10), type: 'Sale', party: sale.customer || '', debit: 0, credit, balance: lastBalance + credit, username };
    await db.collection('transactions').insertOne(newTxn);

    // update product stocks
    const products = sale.items || [];
    for (const it of products) {
      if (!it.name) continue;
      await db.collection('products').updateOne({ username, name: it.name }, { $inc: { stock: -(Number(it.qty) || 0) } });
    }

    // update party balance if credit
    if ((sale.mode || '').toLowerCase().includes('credit')) {
      await db.collection('parties').updateOne({ username, name: sale.customer }, { $inc: { balance: -(Number(sale.amount) || 0) }, $set: { lastTxn: sale.date || new Date().toISOString().substring(0,10) } });
    }

    return res.json({ status: 'success', sale: saleDoc, txn: newTxn });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Create a purchase (single-record endpoint)
async function createPurchase(req, res) {
  const pur = req.body;
  const username = pur.username;
  if (!username) return res.status(400).json({ status: 'error', message: 'Username required' });
  try {
    const db = getDB();
    const id = `PO-${Date.now()}`;
    const purDoc = { ...pur, id, username };
    await db.collection('purchases').insertOne(purDoc);

    // create transaction
    const lastTxn = await db.collection('transactions').find({ username }).sort({ _id: -1 }).limit(1).toArray();
    const lastBalance = lastTxn[0]?.balance || 0;
    const txnId = `TXN-${Date.now()}`;
    const debit = Number(pur.amount) || 0;
    const newTxn = { id: txnId, date: pur.date || new Date().toISOString().substring(0,10), type: 'Purchase', party: pur.supplier || '', debit, credit: 0, balance: lastBalance - debit, username };
    await db.collection('transactions').insertOne(newTxn);

    // update product stocks (increase)
    const products = pur.items || [];
    for (const it of products) {
      if (!it.name) continue;
      await db.collection('products').updateOne({ username, name: it.name }, { $inc: { stock: Number(it.qty) || 0 } });
    }

    // update supplier balance if credit
    if ((pur.mode || '').toLowerCase().includes('credit')) {
      await db.collection('parties').updateOne({ username, name: pur.supplier }, { $inc: { balance: (Number(pur.amount) || 0) }, $set: { lastTxn: pur.date || new Date().toISOString().substring(0,10) } });
    }

    return res.json({ status: 'success', purchase: purDoc, txn: newTxn });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Get purchase by id
async function getPurchaseById(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ status: 'error', message: 'purchase id required' });
  try {
    const db = getDB();
    let pur = null;
    if (ObjectId.isValid(id)) pur = await db.collection('purchases').findOne({ _id: new ObjectId(id) });
    if (!pur) pur = await db.collection('purchases').findOne({ id });
    if (!pur) return res.status(404).json({ status: 'error', message: 'not found' });
    return res.json(pur);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Edit purchase and adjust stock accordingly
async function editPurchase(req, res) {
  const { id } = req.params;
  const data = req.body;
  if (!id) return res.status(400).json({ status: 'error', message: 'purchase id required' });
  if (!data || !data.username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    // find existing purchase
    let existing = null;
    if (ObjectId.isValid(id)) existing = await db.collection('purchases').findOne({ _id: new ObjectId(id) });
    if (!existing) existing = await db.collection('purchases').findOne({ id });
    if (!existing) return res.status(404).json({ status: 'error', message: 'not found' });

    const oldItems = existing.items || [];
    const newItems = data.items || [];

    // build maps by product name (or sku if present)
    const mapQty = (arr) => {
      const m = {};
      for (const it of arr) {
        const key = (it.sku || it.name || '').toString();
        m[key] = (m[key] || 0) + (Number(it.qty) || 0);
      }
      return m;
    };
    const oldMap = mapQty(oldItems);
    const newMap = mapQty(newItems);

    const keys = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
    for (const k of keys) {
      const oldQ = oldMap[k] || 0;
      const newQ = newMap[k] || 0;
      const diff = newQ - oldQ; // positive -> increase stock, negative -> decrease
      if (diff === 0) continue;
      // try update by sku first, then by name
      const filterBySku = { username: data.username, sku: k };
      const filterByName = { username: data.username, name: k };
      const resu = await db.collection('products').updateOne(filterBySku, { $inc: { stock: Number(diff) } });
      if (resu.matchedCount === 0) {
        await db.collection('products').updateOne(filterByName, { $inc: { stock: Number(diff) } });
      }
    }

    // update purchase record
    if (ObjectId.isValid(id)) {
      await db.collection('purchases').updateOne({ _id: new ObjectId(id) }, { $set: data });
    } else {
      await db.collection('purchases').updateOne({ id }, { $set: data });
    }

    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Delete (soft) purchase and rollback stock
async function deletePurchase(req, res) {
  const { id } = req.params;
  const username = req.query.username || req.body.username;
  if (!id) return res.status(400).json({ status: 'error', message: 'purchase id required' });
  try {
    const db = getDB();
    let existing = null;
    if (ObjectId.isValid(id)) existing = await db.collection('purchases').findOne({ _id: new ObjectId(id) });
    if (!existing) existing = await db.collection('purchases').findOne({ id });
    if (!existing) return res.status(404).json({ status: 'error', message: 'not found' });

    const items = existing.items || [];
    for (const it of items) {
      const key = (it.sku || it.name || '').toString();
      const qty = Number(it.qty) || 0;
      if (!qty) continue;
      const filterBySku = { username, sku: key };
      const filterByName = { username, name: key };
      const resu = await db.collection('products').updateOne(filterBySku, { $inc: { stock: -qty } });
      if (resu.matchedCount === 0) {
        await db.collection('products').updateOne(filterByName, { $inc: { stock: -qty } });
      }
    }

    // soft delete
    if (existing._id) {
      await db.collection('purchases').updateOne({ _id: existing._id }, { $set: { active: false, deletedAt: new Date().toISOString().substring(0,10) } });
    } else if (existing.id) {
      await db.collection('purchases').updateOne({ id: existing.id }, { $set: { active: false, deletedAt: new Date().toISOString().substring(0,10) } });
    }

    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Add a product
async function addProduct(req, res) {
  const prod = req.body;
  const username = prod.username;
  if (!username) return res.status(400).json({ status: 'error', message: 'Username required' });
  try {
    const db = getDB();
    const doc = { ...prod, username };
    await db.collection('products').insertOne(doc);
    return res.json({ status: 'success', product: doc });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Bulk import products (array)
async function bulkImportProducts(req, res) {
  const { username, products } = req.body;
  if (!username || !Array.isArray(products)) return res.status(400).json({ status: 'error', message: 'username and products[] required' });
  try {
    const db = getDB();
    const docs = products.map(p => ({
      username,
      name: p.name || '',
      sku: p.sku || p.code || '',
      hsnSac: p.hsnSac || '',
      category: p.category || '',
      brand: p.brand || '',
      unit: p.unit || 'pcs',
      price: Number(p.price) || 0,
      purchasePrice: Number(p.purchasePrice) || 0,
      wholesalePrice: Number(p.wholesalePrice) || 0,
      taxSlab: p.taxSlab || '18%',
      stock: Number(p.stock) || 0,
      lowStockLevel: Number(p.lowStockLevel) || 5,
      expiryDate: p.expiryDate || null,
      image: p.image || '',
      notes: p.notes || ''
    }));
    if (docs.length) await db.collection('products').insertMany(docs);
    return res.json({ status: 'success', inserted: docs.length });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Export products as CSV
async function exportProductsCSV(req, res) {
  const { username, filter } = req.query;
  if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    const q = { username };
    if (filter && filter.trim()) {
      const f = filter.trim();
      q.$or = [ { sku: { $regex: f, $options: 'i' } }, { name: { $regex: f, $options: 'i' } } ];
    }
    const prods = await db.collection('products').find(q).toArray();
    // build CSV
    const cols = ['name','sku','hsnSac','category','brand','unit','price','purchasePrice','wholesalePrice','taxSlab','stock','lowStockLevel','expiryDate','notes'];
    const rows = [cols.join(',')];
    for (const p of prods) {
      const vals = cols.map(c => {
        const v = p[c] == null ? '' : String(p[c]);
        // escape quotes
        return '"' + v.replace(/"/g, '""') + '"';
      });
      rows.push(vals.join(','));
    }
    const csv = rows.join('\n');
    res.setHeader('Content-Disposition', `attachment; filename=products-${username}.csv`);
    res.setHeader('Content-Type', 'text/csv');
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Low-stock and expiry alerts
async function getProductAlerts(req, res) {
  const { username } = req.query;
  if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    const prods = await db.collection('products').find({ username }).toArray();
    const lowStock = prods.filter(p => (Number(p.stock) || 0) <= (Number(p.lowStockLevel) || 5)).map(p => ({ id: p.id || p._id, name: p.name, stock: p.stock, lowStockLevel: p.lowStockLevel }));
    const today = new Date().toISOString().substring(0,10);
    const expirySoon = prods.filter(p => p.expiryDate && p.expiryDate <= today).map(p => ({ id: p.id || p._id, name: p.name, expiryDate: p.expiryDate }));
    return res.json({ status: 'success', lowStock, expirySoon });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Get product by id
async function getProductById(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ status: 'error', message: 'product id required' });
  try {
    const db = getDB();
    let prod = null;
    if (ObjectId.isValid(id)) prod = await db.collection('products').findOne({ _id: new ObjectId(id) });
    if (!prod) prod = await db.collection('products').findOne({ id });
    if (!prod) return res.status(404).json({ status: 'error', message: 'not found' });
    return res.json(prod);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Edit product
async function editProduct(req, res) {
  const { id } = req.params;
  const data = req.body;
  if (!id) return res.status(400).json({ status: 'error', message: 'product id required' });
  if (!data || !data.username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    if (ObjectId.isValid(id)) {
      await db.collection('products').updateOne({ _id: new ObjectId(id) }, { $set: data });
    } else {
      await db.collection('products').updateOne({ id }, { $set: data });
    }
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Delete (soft) product
async function deleteProduct(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ status: 'error', message: 'product id required' });
  try {
    const db = getDB();
    if (ObjectId.isValid(id)) {
      await db.collection('products').updateOne({ _id: new ObjectId(id) }, { $set: { active: false, deletedAt: new Date().toISOString().substring(0,10) } });
    } else {
      await db.collection('products').updateOne({ id }, { $set: { active: false, deletedAt: new Date().toISOString().substring(0,10) } });
    }
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Add a party (customer/supplier)
async function addParty(req, res) {
  const party = req.body;
  const username = party.username;
  if (!username) return res.status(400).json({ status: 'error', message: 'Username required' });
  try {
    const db = getDB();
    const doc = { ...party, username };
    await db.collection('parties').insertOne(doc);
    return res.json({ status: 'success', party: doc });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports.createSale = createSale;
module.exports.createPurchase = createPurchase;
module.exports.addProduct = addProduct;
module.exports.addParty = addParty;

// Paginated list endpoint: sales, purchases, products, parties
async function getList(req, res) {
  const { username, type = 'sales', page = 1, limit = 20 } = req.query;
  if (!username) return res.status(400).json({ status: 'error', message: 'Username required' });
  try {
    const db = getDB();
    const pageNum = Math.max(1, Number(page) || 1);
    const lim = Math.max(1, Number(limit) || 20);
    const collectionMap = { sales: 'sales', purchases: 'purchases', products: 'products', parties: 'parties' };
    const coll = collectionMap[type] || 'sales';
    const query = { username };
    const total = await db.collection(coll).countDocuments(query);
    const data = await db.collection(coll).find(query).project({ _id: 0 }).skip((pageNum - 1) * lim).limit(lim).toArray();
    return res.json({ status: 'success', total, page: pageNum, limit: lim, data });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Revenue timeseries: sum of sales amounts grouped by date (daily/weekly/monthly)
async function revenueTimeseries(req, res) {
  const { username, period = 'daily' } = req.query;
  if (!username) return res.status(400).json({ status: 'error', message: 'Username required' });
  try {
    const db = getDB();
    const sales = await db.collection('sales').find({ username }).project({ _id: 0, date: 1, amount: 1 }).toArray();
    const toNumber = v => Number(v) || 0;
    const parseDate = d => {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return new Date(d + 'T00:00:00');
      return dt;
    };
    const map = {};
    for (const s of sales) {
      const dt = parseDate(s.date || new Date().toISOString());
      let key;
      if (period === 'monthly') key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      else if (period === 'weekly') {
        const wStart = new Date(dt);
        const day = wStart.getDay();
        wStart.setDate(wStart.getDate() - day);
        key = wStart.toISOString().substring(0,10);
      } else {
        key = dt.toISOString().substring(0,10);
      }
      map[key] = (map[key] || 0) + toNumber(s.amount);
    }
    const labels = Object.keys(map).sort();
    const data = labels.map(l => map[l]);
    return res.json({ status: 'success', period, labels, data });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports.getList = getList;
module.exports.revenueTimeseries = revenueTimeseries;

// Server-side Dashboard Summary for Admin
async function getDashboardSummary(req, res) {
  const { username } = req.query;
  if (!username) return res.status(400).json({ status: 'error', message: 'Username required' });
  try {
    const db = getDB();
    const [products, sales, purchases, parties, transactions, settings] = await Promise.all([
      db.collection('products').find({ username }).project({ _id: 0 }).toArray(),
      db.collection('sales').find({ username }).project({ _id: 0 }).toArray(),
      db.collection('purchases').find({ username }).project({ _id: 0 }).toArray(),
      db.collection('parties').find({ username }).project({ _id: 0 }).toArray(),
      db.collection('transactions').find({ username }).project({ _id: 0 }).toArray(),
      db.collection('settings').findOne({ username }, { projection: { _id: 0 } })
    ]);

    const toNumber = v => Number(v) || 0;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - 6); // 7-day window
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const parseDate = (d) => {
      if (!d) return new Date(0);
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return new Date(d + 'T00:00:00');
      return dt;
    };

    // Totals
    const totalSales = sales.reduce((s, x) => s + toNumber(x.amount), 0);
    const totalPurchases = purchases.reduce((s, x) => s + toNumber(x.amount), 0);
    const profit = totalSales - totalPurchases;

    // Period totals
    const salesToday = sales.filter(s => parseDate(s.date) >= startOfDay).reduce((a,b) => a + toNumber(b.amount), 0);
    const salesWeek = sales.filter(s => parseDate(s.date) >= startOfWeek).reduce((a,b) => a + toNumber(b.amount), 0);
    const salesMonth = sales.filter(s => parseDate(s.date) >= startOfMonth).reduce((a,b) => a + toNumber(b.amount), 0);

    const expensesToday = purchases.filter(p => parseDate(p.date) >= startOfDay).reduce((a,b) => a + toNumber(b.amount), 0);
    const expensesMonth = purchases.filter(p => parseDate(p.date) >= startOfMonth).reduce((a,b) => a + toNumber(b.amount), 0);

    // Receivables / Payables
    const pendingReceivables = sales.filter(s => (s.status || '').toLowerCase() === 'pending').reduce((a,b) => a + toNumber(b.amount), 0);
    const pendingPurchases = purchases.filter(p => (p.status || '').toLowerCase() === 'pending').reduce((a,b) => a + toNumber(b.amount), 0);
    const suppliersOutstanding = parties.filter(p => (p.type || '').toLowerCase() === 'supplier').reduce((a,b) => a + Math.max(0, toNumber(b.balance)), 0);
    const totalOutstandingPayables = pendingPurchases + suppliersOutstanding;

    // Stock alerts
    const lowStockCount = products.filter(p => toNumber(p.stock) <= 5).length;
    const outOfStockCount = products.filter(p => toNumber(p.stock) <= 0).length;

    // Counts
    const totalCustomers = parties.filter(p => (p.type || '').toLowerCase() === 'customer').length;
    const totalSuppliers = parties.filter(p => (p.type || '').toLowerCase() === 'supplier').length;

    // Orders / delivery summary
    const orders = { pending: 0, completed: 0, cancelled: 0 };
    sales.forEach(s => {
      const st = (s.deliveryStatus || s.status || 'unknown').toLowerCase();
      if (st.includes('cancel')) orders.cancelled += 1;
      else if (st.includes('pending')) orders.pending += 1;
      else orders.completed += 1;
    });

    // Top selling products
    const productSalesMap = {};
    sales.forEach(s => {
      (s.items || []).forEach(it => {
        const name = it.name || it.item || 'Unknown';
        const qty = toNumber(it.qty) || 0;
        const amt = toNumber(it.total) || toNumber(it.amount) || 0;
        if (!productSalesMap[name]) productSalesMap[name] = { qty: 0, revenue: 0 };
        productSalesMap[name].qty += qty;
        productSalesMap[name].revenue += amt;
      });
    });
    const topSelling = Object.entries(productSalesMap).map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue })).sort((a,b)=>b.revenue-a.revenue).slice(0,10);

    // Top customers
    const custMap = {};
    sales.forEach(s => {
      const name = s.customer || 'Unknown';
      custMap[name] = (custMap[name] || 0) + toNumber(s.amount);
    });
    const topCustomers = Object.entries(custMap).map(([name,total])=>({ name, total })).sort((a,b)=>b.total-a.total).slice(0,10);

    // Recent transactions & invoices (latest 10)
    const recentTxns = transactions.slice().sort((a,b)=> new Date(b.date) - new Date(a.date)).slice(0,10);
    const recentInvoices = sales.slice().sort((a,b)=> new Date(b.date) - new Date(a.date)).slice(0,10);

    // Cash flow summary (in/out) for last 30 days
    const start30 = new Date(); start30.setDate(start30.getDate() - 29);
    const cashIn = transactions.filter(t => parseDate(t.date) >= start30).reduce((a,b)=> a + toNumber(b.credit), 0);
    const cashOut = transactions.filter(t => parseDate(t.date) >= start30).reduce((a,b)=> a + toNumber(b.debit), 0);

    return res.json({
      totals: { totalSales, totalPurchases, profit },
      periods: { today: salesToday, week: salesWeek, month: salesMonth },
      expenses: { today: expensesToday, month: expensesMonth },
      receivables: pendingReceivables,
      payables: totalOutstandingPayables,
      stock: { lowStockCount, outOfStockCount },
      counts: { customers: totalCustomers, suppliers: totalSuppliers, products: products.length },
      orders,
      deliverySummary: orders,
      topSelling,
      topCustomers,
      recent: { transactions: recentTxns, invoices: recentInvoices },
      cashflow: { in: cashIn, out: cashOut },
      settings: settings || {}
    });

  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// export the new function
module.exports.getDashboardSummary = getDashboardSummary;

// ---- Staff Management APIs ----
// Quick permission helper — ensure the username belongs to an active admin or super_admin
async function ensureAdminByUsername(username) {
  if (!username) return false;
  const db = getDB();
  const u = await db.collection('users').findOne({ username });
  if (!u) return false;
  if (u.status !== 'active') return false;
  return (u.role === 'admin' || u.role === 'super_admin');
}

// Add staff member
async function addStaff(req, res) {
  const staff = req.body;
  const username = staff.username;
  if (!username || !staff.name) return res.status(400).json({ status: 'error', message: 'username and staff.name required' });
  try {
    const ok = await ensureAdminByUsername(req.body.actor || username);
    if (!ok) return res.status(403).json({ status: 'error', message: 'Permission denied' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
  try {
    const db = getDB();
    const doc = { ...staff, createdAt: new Date().toISOString().substring(0,10), active: true };
    const result = await db.collection('staff').insertOne(doc);
    return res.json({ status: 'success', staffId: String(result.insertedId) });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Edit staff member
async function editStaff(req, res) {
  const { id } = req.params;
  const data = req.body;
  if (!id) return res.status(400).json({ status: 'error', message: 'staff id required' });
  try {
    const ok = await ensureAdminByUsername(req.body.actor || data.username || req.body.username);
    if (!ok) return res.status(403).json({ status: 'error', message: 'Permission denied' });
    const db = getDB();
    await db.collection('staff').updateOne({ _id: new ObjectId(id) }, { $set: data });
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Delete (soft) staff member
async function deleteStaff(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ status: 'error', message: 'staff id required' });
  try {
    const ok = await ensureAdminByUsername(req.body.actor || req.query.actor || req.body.username || req.query.username);
    if (!ok) return res.status(403).json({ status: 'error', message: 'Permission denied' });
    const db = getDB();
    await db.collection('staff').updateOne({ _id: new ObjectId(id) }, { $set: { active: false, deletedAt: new Date().toISOString().substring(0,10) } });
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// List staff for a shop (username)
async function getStaffList(req, res) {
  const { username } = req.query;
  if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    const staff = await db.collection('staff').find({ username }).toArray();
    const mapped = staff.map(s => ({ ...s, _id: String(s._id) }));
    return res.json(mapped);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Activate / Deactivate staff
async function toggleStaffActive(req, res) {
  const { id } = req.params;
  const { active } = req.body;
  if (!id) return res.status(400).json({ status: 'error', message: 'staff id required' });
  try {
    const ok = await ensureAdminByUsername(req.body.actor || req.body.username || req.query.username);
    if (!ok) return res.status(403).json({ status: 'error', message: 'Permission denied' });
    const db = getDB();
    await db.collection('staff').updateOne({ _id: new ObjectId(id) }, { $set: { active: !!active } });
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Log staff activity
async function logStaffActivity(req, res) {
  const { username, staffId, action, detail } = req.body;
  if (!username || !staffId || !action) return res.status(400).json({ status: 'error', message: 'username, staffId and action required' });
  try {
    const db = getDB();
    await db.collection('staff_activity').insertOne({ username, staffId, action, detail: detail || '', timestamp: new Date() });
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Get staff activity logs
async function getStaffActivities(req, res) {
  const { username, staffId, limit = 50 } = req.query;
  if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    const query = { username };
    if (staffId) query.staffId = staffId;
    const logs = await db.collection('staff_activity').find(query).sort({ timestamp: -1 }).limit(Number(limit)).toArray();
    return res.json(logs.map(l => ({ ...l, _id: String(l._id), timestamp: l.timestamp })));
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Record attendance
async function addAttendance(req, res) {
  const { username, staffId, date, status } = req.body; // status: present/absent/leave
  if (!username || !staffId || !date) return res.status(400).json({ status: 'error', message: 'username, staffId, date required' });
  try {
    // attendance can be recorded by admin or the staff themselves; no strict enforcement here
    const db = getDB();
    await db.collection('staff_attendance').insertOne({ username, staffId, date, status: status || 'present' });
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Get attendance for staff
async function getAttendance(req, res) {
  const { username, staffId, from, to } = req.query;
  if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    const q = { username };
    if (staffId) q.staffId = staffId;
    if (from || to) q.date = {};
    if (from) q.date.$gte = from;
    if (to) q.date.$lte = to;
    const rows = await db.collection('staff_attendance').find(q).toArray();
    return res.json(rows.map(r => ({ ...r, _id: String(r._id) })));
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Set or update salary details on staff record
async function setSalary(req, res) {
  const { id } = req.params;
  const { salary } = req.body;
  if (!id || salary == null) return res.status(400).json({ status: 'error', message: 'staff id and salary required' });
  try {
    const ok = await ensureAdminByUsername(req.body.actor || req.body.username || req.query.username);
    if (!ok) return res.status(403).json({ status: 'error', message: 'Permission denied' });
    const db = getDB();
    await db.collection('staff').updateOne({ _id: new ObjectId(id) }, { $set: { salary } });
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Simple staff performance summary (activity count + attendance days)
async function getStaffPerformance(req, res) {
  const { username, staffId } = req.query;
  if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    const q = { username };
    if (staffId) q.staffId = staffId;
    const activityCount = await db.collection('staff_activity').countDocuments(q);
    const attendanceCount = await db.collection('staff_attendance').countDocuments({ ...q, status: 'present' });
    return res.json({ status: 'success', activityCount, attendanceCount });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// export staff functions
module.exports.addStaff = addStaff;
module.exports.editStaff = editStaff;
module.exports.deleteStaff = deleteStaff;
module.exports.getStaffList = getStaffList;
module.exports.toggleStaffActive = toggleStaffActive;
module.exports.logStaffActivity = logStaffActivity;
module.exports.getStaffActivities = getStaffActivities;
module.exports.addAttendance = addAttendance;
module.exports.getAttendance = getAttendance;
module.exports.setSalary = setSalary;
module.exports.getStaffPerformance = getStaffPerformance;

// purchases & products exports
module.exports.getPurchaseById = getPurchaseById;
module.exports.editPurchase = editPurchase;
module.exports.deletePurchase = deletePurchase;

module.exports.getProductById = getProductById;
module.exports.editProduct = editProduct;
module.exports.deleteProduct = deleteProduct;
module.exports.bulkImportProducts = bulkImportProducts;
module.exports.exportProductsCSV = exportProductsCSV;
module.exports.getProductAlerts = getProductAlerts;

// ---- Billing & Invoicing APIs ----
// Create invoice
async function createInvoice(req, res) {
  const inv = req.body;
  const username = inv.username;
  if (!username || !inv.type) return res.status(400).json({ status: 'error', message: 'username and type required' });
  try {
    const db = getDB();
    const id = `INV-${Date.now()}`;
    const invoiceNumber = inv.invoiceNumber || id;
    const doc = { ...inv, id, invoiceNumber, status: inv.status || 'Unpaid', createdAt: new Date().toISOString().substring(0,10) };
    await db.collection('invoices').insertOne(doc);

    // create transaction if payment received
    if (inv.paymentReceived && Number(inv.paymentReceived) > 0) {
      const lastTxn = await db.collection('transactions').find({ username }).sort({ _id: -1 }).limit(1).toArray();
      const lastBalance = lastTxn[0]?.balance || 0;
      const txnId = `TXN-${Date.now()}`;
      const credit = Number(inv.paymentReceived) || 0;
      const newTxn = { id: txnId, date: inv.date || new Date().toISOString().substring(0,10), type: 'InvoicePayment', party: inv.customer || '', debit: 0, credit, balance: lastBalance + credit, username };
      await db.collection('transactions').insertOne(newTxn);
    }

    return res.json({ status: 'success', invoiceId: id });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Edit invoice
async function editInvoice(req, res) {
  const { id } = req.params;
  const data = req.body;
  if (!id) return res.status(400).json({ status: 'error', message: 'invoice id required' });
  try {
    const db = getDB();
    await db.collection('invoices').updateOne({ id }, { $set: data });
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Delete invoice
async function deleteInvoice(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ status: 'error', message: 'invoice id required' });
  try {
    const db = getDB();
    await db.collection('invoices').deleteOne({ id });
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Get invoices (list + filter)
async function getInvoices(req, res) {
  const { username, page = 1, limit = 20, type, status, search } = req.query;
  if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    const q = { username };
    if (type) q.type = type;
    if (status) q.status = status;
    if (search) q.$or = [ { invoiceNumber: { $regex: search, $options: 'i' } }, { customer: { $regex: search, $options: 'i' } } ];
    const p = Math.max(1, Number(page));
    const l = Math.max(1, Number(limit));
    const total = await db.collection('invoices').countDocuments(q);
    const data = await db.collection('invoices').find(q).skip((p-1)*l).limit(l).toArray();
    return res.json({ status: 'success', total, page: p, limit: l, data });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Get invoice by id
async function getInvoiceById(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ status: 'error', message: 'invoice id required' });
  try {
    const db = getDB();
    const inv = await db.collection('invoices').findOne({ id });
    return res.json(inv || {});
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Generate PDF for invoice and stream to response
async function getInvoicePDF(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ status: 'error', message: 'invoice id required' });
  try {
    const db = getDB();
    // Attempt to find invoice by multiple possible identifiers: id, invoiceNumber, or Mongo _id
    let inv = await db.collection('invoices').findOne({ id });
    if (!inv) inv = await db.collection('invoices').findOne({ invoiceNumber: id });
    if (!inv) {
      // try treating id as an ObjectId string
      try {
        const { ObjectId } = require('mongodb');
        if (ObjectId.isValid(id)) {
          inv = await db.collection('invoices').findOne({ _id: new ObjectId(id) });
        }
      } catch (e) {
        // ignore ObjectId conversion errors
      }
    }
    if (!inv) {
      console.warn('getInvoicePDF: invoice not found for identifier', id);
      return res.status(404).json({ status: 'error', message: 'not found' });
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${inv.invoiceNumber || inv.id}.pdf`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).text('Vyapar', { align: 'left' });
    doc.moveDown(0.2);
    doc.fontSize(12).text(`Invoice: ${inv.invoiceNumber || inv.id}`);
    doc.text(`Date: ${inv.date || ''}`);
    doc.text(`Customer: ${inv.customer || ''}`);
    doc.moveDown(0.5);

    // Items table (if present)
    if (Array.isArray(inv.items) && inv.items.length) {
      doc.fontSize(12).text('Items:', { underline: true });
      doc.moveDown(0.2);
      inv.items.forEach((it, idx) => {
        const name = it.name || `Item ${idx+1}`;
        const qty = it.qty || it.quantity || 1;
        const rate = Number(it.rate || it.price || it.amount || 0);
        const lineTotal = qty * rate;
        doc.text(`${name} — ${qty} x ${fmtCurrency(rate)} = ${fmtCurrency(lineTotal)}`);
      });
      doc.moveDown(0.5);
    }

    // Totals
    const total = Number(inv.totalAmount || inv.amount || 0);
    doc.fontSize(12).text(`Total: ${fmtCurrency(total)}`, { align: 'right' });
    doc.moveDown(0.5);

    // Notes
    if (inv.notes) {
      doc.fontSize(10).text('Notes:', { underline: true });
      doc.text(inv.notes);
    }

    doc.end();
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

function fmtCurrency(v) { return '₹' + (Number(v) || 0).toFixed(2); }

// Duplicate invoice
async function duplicateInvoice(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ status: 'error', message: 'invoice id required' });
  try {
    const db = getDB();
    const inv = await db.collection('invoices').findOne({ id });
    if (!inv) return res.status(404).json({ status: 'error', message: 'not found' });
    const newId = `INV-${Date.now()}`;
    const copy = { ...inv, id: newId, invoiceNumber: `COPY-${newId}`, createdAt: new Date().toISOString().substring(0,10) };
    delete copy._id;
    await db.collection('invoices').insertOne(copy);
    return res.json({ status: 'success', invoiceId: newId });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Convert quotation/proforma to invoice (simple type change)
async function convertToInvoice(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ status: 'error', message: 'invoice id required' });
  try {
    const db = getDB();
    await db.collection('invoices').updateOne({ id }, { $set: { type: 'Sale Invoice', convertedAt: new Date().toISOString().substring(0,10) } });
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Setup recurring invoice (store recurring settings)
async function setupRecurring(req, res) {
  const { id } = req.params;
  const { intervalDays, endDate } = req.body;
  if (!id || !intervalDays) return res.status(400).json({ status: 'error', message: 'invoice id and intervalDays required' });
  try {
    const db = getDB();
    await db.collection('invoices').updateOne({ id }, { $set: { recurring: { intervalDays: Number(intervalDays), endDate: endDate || null, nextRun: new Date().toISOString().substring(0,10) } } });
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Invoice aging report
async function invoiceAgingReport(req, res) {
  const { username } = req.query;
  if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    const invoices = await db.collection('invoices').find({ username }).toArray();
    const today = new Date();
    const buckets = { '0-30':0, '31-60':0, '61-90':0, '90+':0 };
    invoices.forEach(inv => {
      const due = inv.dueDate ? new Date(inv.dueDate) : null;
      if (!due) return;
      const age = Math.ceil((today - due)/(1000*60*60*24));
      const amt = Number(inv.totalAmount || inv.amount || 0);
      if (age <= 30) buckets['0-30'] += amt;
      else if (age <= 60) buckets['31-60'] += amt;
      else if (age <= 90) buckets['61-90'] += amt;
      else buckets['90+'] += amt;
    });
    return res.json({ status: 'success', buckets });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Exports for invoices
module.exports.createInvoice = createInvoice;
module.exports.editInvoice = editInvoice;
module.exports.deleteInvoice = deleteInvoice;
module.exports.getInvoices = getInvoices;
module.exports.getInvoiceById = getInvoiceById;
module.exports.duplicateInvoice = duplicateInvoice;
module.exports.convertToInvoice = convertToInvoice;
module.exports.setupRecurring = setupRecurring;
module.exports.invoiceAgingReport = invoiceAgingReport;
module.exports.getInvoicePDF = getInvoicePDF;

// ---- Stock Adjustment API ----
async function adjustStock(req, res) {
  const { id } = req.params;
  const { username, qty, reason } = req.body;
  if (!id || !username || qty == null) return res.status(400).json({ status: 'error', message: 'id, username, qty required' });
  try {
    const db = getDB();
    const delta = Number(qty);
    let result;
    if (ObjectId.isValid(id)) {
      result = await db.collection('products').updateOne({ _id: new ObjectId(id), username }, { $inc: { stock: delta } });
    } else {
      result = await db.collection('products').updateOne({ id, username }, { $inc: { stock: delta } });
    }
    // log the adjustment
    await db.collection('stock_adjustments').insertOne({
      productId: id, username, qty: delta, reason: reason || 'manual',
      timestamp: new Date().toISOString()
    });
    return res.json({ status: 'success', matched: result.matchedCount });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// ---- Stock Transfer API ----
async function transferStock(req, res) {
  const { id } = req.params;
  const { username, qty, fromBranch, toBranch } = req.body;
  if (!id || !username || !qty || !toBranch) return res.status(400).json({ status: 'error', message: 'id, username, qty, toBranch required' });
  try {
    const db = getDB();
    const transferQty = Number(qty);
    // Decrease stock in source product
    if (ObjectId.isValid(id)) {
      await db.collection('products').updateOne({ _id: new ObjectId(id), username }, { $inc: { stock: -transferQty } });
    } else {
      await db.collection('products').updateOne({ id, username }, { $inc: { stock: -transferQty } });
    }
    // Log the transfer
    await db.collection('stock_transfers').insertOne({
      productId: id, username, qty: transferQty,
      fromBranch: fromBranch || 'Main Warehouse', toBranch,
      timestamp: new Date().toISOString()
    });
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// ---- Purchase Report API ----
async function purchaseReport(req, res) {
  const { username } = req.query;
  if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
  try {
    const db = getDB();
    const purchases = await db.collection('purchases').find({ username }).toArray();
    const toNumber = v => Number(v) || 0;
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - 6);

    const totalPurchases = purchases.reduce((s, p) => s + toNumber(p.amount), 0);
    const monthPurchases = purchases.filter(p => new Date(p.date) >= startOfMonth).reduce((s, p) => s + toNumber(p.amount), 0);
    const weekPurchases = purchases.filter(p => new Date(p.date) >= startOfWeek).reduce((s, p) => s + toNumber(p.amount), 0);
    const pendingDues = purchases.filter(p => (p.status || '').toLowerCase() === 'pending').reduce((s, p) => s + toNumber(p.amount), 0);
    const totalCount = purchases.length;

    // By type breakdown
    const byType = {};
    purchases.forEach(p => {
      const t = p.purchaseType || 'Purchase Invoice';
      byType[t] = (byType[t] || 0) + toNumber(p.amount);
    });

    // Top suppliers
    const supplierMap = {};
    purchases.forEach(p => {
      const name = p.supplier || 'Unknown';
      supplierMap[name] = (supplierMap[name] || 0) + toNumber(p.amount);
    });
    const topSuppliers = Object.entries(supplierMap).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 10);

    // Supplier dues
    const parties = await db.collection('parties').find({ username, type: { $regex: /supplier/i } }).toArray();
    const supplierDues = parties.filter(p => toNumber(p.balance) > 0).map(p => ({ name: p.name, balance: toNumber(p.balance), phone: p.phone || '' }));

    return res.json({
      status: 'success',
      totalPurchases, monthPurchases, weekPurchases, pendingDues, totalCount,
      byType, topSuppliers, supplierDues
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports.adjustStock = adjustStock;
module.exports.transferStock = transferStock;
module.exports.purchaseReport = purchaseReport;
