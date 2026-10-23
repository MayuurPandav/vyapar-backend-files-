const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const { logAudit } = require('./authController');
const { verifyGSTNumber } = require('../services/gstService');
const PDFDocument = require('pdfkit');

// Accountant Mongoose Models
const Customer = require('../models/accountant/Customer');
const Ledger = require('../models/accountant/Ledger');
const Invoice = require('../models/accountant/Invoice');
const JournalEntry = require('../models/accountant/JournalEntry');

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
    const accounts = await db.collection('accounts').find({ username }).project({ _id: 0 }).toArray();
    const bankAccounts = await db.collection('bankAccounts').find({ username }).project({ _id: 0 }).toArray();
    const cheques = await db.collection('cheques').find({ username }).project({ _id: 0 }).toArray();
    const settings = await db.collection('settings').findOne({ username }, { projection: { _id: 0 } }) || {};

    return res.json({
      products,
      sales,
      purchases,
      parties,
      transactions,
      expenses,
      offers,
      accounts,
      bankAccounts,
      cheques,
      settings
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}

// Save complete business state for a user
async function saveFullDB(req, res) {
  const { username, products, sales, purchases, parties, transactions, expenses, offers, accounts, settings, bankAccounts, cheques } = req.body;
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
        batchNumber: p.batchNumber || '',
        batches: p.batches || [],
        hasSerialTracking: p.hasSerialTracking === true || p.hasSerialTracking === 'true',
        serialNumbers: Array.isArray(p.serialNumbers) ? p.serialNumbers : [],
        active: p.active !== false,
        deletedAt: p.deletedAt || null
      }));
      await db.collection('products').insertMany(prodsToInsert);
    }

    // 2. Save sales
    await db.collection('sales').deleteMany({ username });
    if (sales && sales.length) {
      const salesToInsert = sales.map(s => ({
        id: s.id, customer: s.customer, date: s.date,
        amount: s.amount, mode: s.mode, status: s.status,
        notes: s.notes, items: s.items || [], username,
        subtotal: Number(s.subtotal) || 0,
        taxAmount: Number(s.taxAmount) || 0,
        cgst: Number(s.cgst) || 0,
        sgst: Number(s.sgst) || 0,
        igst: Number(s.igst) || 0,
        discountCode: s.discountCode || '',
        discountAmount: Number(s.discountAmount) || 0
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
        dueDate: p.dueDate || null,
        subtotal: Number(p.subtotal) || 0,
        taxAmount: Number(p.taxAmount) || 0,
        cgst: Number(p.cgst) || 0,
        sgst: Number(p.sgst) || 0,
        igst: Number(p.igst) || 0
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
        creditAccount: t.creditAccount || '',
        isReconciled: t.isReconciled === true
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
        isActive: !!o.isActive, username,
        buyQty: Number(o.buyQty) || 0,
        getQty: Number(o.getQty) || 0,
        bundleProducts: Array.isArray(o.bundleProducts) ? o.bundleProducts : [],
        seasonName: o.seasonName || '',
        applicableCustomer: o.applicableCustomer || '',
        applicableCustomerGroup: o.applicableCustomerGroup || ''
      }));
      await db.collection('offers').insertMany(offersToInsert);
    }

    // 5.7 Save accounts
    await db.collection('accounts').deleteMany({ username });
    if (accounts && accounts.length) {
      const accountsToInsert = accounts.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        description: a.description || '',
        isSystem: a.isSystem === true,
        openingBalance: Number(a.openingBalance) || 0,
        username
      }));
      await db.collection('accounts').insertMany(accountsToInsert);
    }

    // 5.8 Save bankAccounts
    await db.collection('bankAccounts').deleteMany({ username });
    if (bankAccounts && bankAccounts.length) {
      const bankAccountsToInsert = bankAccounts.map(b => ({
        id: b.id,
        accountName: b.accountName,
        bankName: b.bankName,
        accountNumber: b.accountNumber || '',
        ifscCode: b.ifscCode || '',
        branchName: b.branchName || '',
        openingBalance: Number(b.openingBalance) || 0,
        username
      }));
      await db.collection('bankAccounts').insertMany(bankAccountsToInsert);
    }

    // 5.9 Save cheques
    await db.collection('cheques').deleteMany({ username });
    if (cheques && cheques.length) {
      const chequesToInsert = cheques.map(c => ({
        id: c.id,
        chequeNumber: c.chequeNumber,
        bankName: c.bankName,
        issueDate: c.issueDate,
        dueDate: c.dueDate,
        partyName: c.partyName,
        amount: Number(c.amount) || 0,
        type: c.type,
        status: c.status || 'Pending',
        bankAccountId: c.bankAccountId,
        bounceCharge: Number(c.bounceCharge) || 0,
        notes: c.notes || '',
        username
      }));
      await db.collection('cheques').insertMany(chequesToInsert);
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
  if (!gstin) {
    return res.status(400).json({ status: 'error', message: 'GSTIN is required.' });
  }

  try {
    const result = await verifyGSTNumber(gstin);
    await logAudit("SYSTEM", "GST_VERIFY", `Verified GSTIN: ${gstin} (State: ${result.data.state}, Authoritative: ${result.authoritative})`);

    return res.json({
      status: "success",
      message: result.authoritative ? "GSTIN Verified Successfully with External Provider" : "GSTIN Validated Successfully (Local Fallback)",
      data: result.data
    });
  } catch (err) {
    const isExternalError = err.message.includes('failed') || err.message.includes('authentication') || err.message.includes('lookup');
    return res.status(isExternalError ? 502 : 400).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  getFullDB,
  saveFullDB,
  verifyGST
};

// Helper to adjust stock for product batches and root level
async function adjustProductBatchStock(db, username, name, sku, batchNumber, qtyChange, batchDetails = null, serialNumbers = null) {
  const query = { username };
  if (sku) query.sku = sku;
  else query.name = name;

  const product = await db.collection('products').findOne(query);
  if (!product) return;

  const delta = Number(qtyChange);

  if (product.hasSerialTracking) {
    let currentSerials = Array.isArray(product.serialNumbers) ? product.serialNumbers : [];
    if (delta > 0) {
      if (Array.isArray(serialNumbers) && serialNumbers.length > 0) {
        const uniqueNew = serialNumbers.filter(sn => sn && !currentSerials.includes(sn));
        currentSerials = [...currentSerials, ...uniqueNew];
      } else {
        for (let i = 0; i < delta; i++) {
          currentSerials.push(`SN-AUTO-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`);
        }
      }
    } else if (delta < 0) {
      const removeCount = Math.abs(delta);
      if (Array.isArray(serialNumbers) && serialNumbers.length > 0) {
        currentSerials = currentSerials.filter(sn => !serialNumbers.includes(sn));
      } else {
        for (let i = 0; i < removeCount; i++) {
          currentSerials.pop();
        }
      }
    }
    await db.collection('products').updateOne(
      { _id: product._id },
      { $set: { serialNumbers: currentSerials, stock: currentSerials.length } }
    );
  } else if (batchNumber) {
    const batches = Array.isArray(product.batches) ? product.batches : [];
    const existingIdx = batches.findIndex(b => b.batchNumber === batchNumber);
    if (existingIdx > -1) {
      // Update existing batch stock
      const oldStock = Number(batches[existingIdx].stock) || 0;
      const newStock = Math.max(0, oldStock + delta);
      const updateDoc = {
        $set: { [`batches.${existingIdx}.stock`]: newStock },
        $inc: { stock: delta }
      };
      
      // Update metadata on purchase stock-in
      if (batchDetails) {
        if (batchDetails.expiryDate) updateDoc.$set[`batches.${existingIdx}.expiryDate`] = batchDetails.expiryDate;
        if (batchDetails.mfgDate) updateDoc.$set[`batches.${existingIdx}.mfgDate`] = batchDetails.mfgDate;
        if (batchDetails.purchasePrice != null) updateDoc.$set[`batches.${existingIdx}.purchasePrice`] = Number(batchDetails.purchasePrice);
      }
      
      await db.collection('products').updateOne({ _id: product._id }, updateDoc);
    } else {
      // Push new batch
      const newBatch = {
        batchNumber,
        mfgDate: batchDetails?.mfgDate || null,
        expiryDate: batchDetails?.expiryDate || null,
        stock: Math.max(0, delta),
        purchasePrice: Number(batchDetails?.purchasePrice) || Number(product.purchasePrice) || 0,
        sellingPrice: Number(product.price) || 0
      };
      
      await db.collection('products').updateOne(
        { _id: product._id },
        { 
          $push: { batches: newBatch },
          $inc: { stock: delta }
        }
      );
    }
  } else {
    // Standard non-batched product update
    await db.collection('products').updateOne({ _id: product._id }, { $inc: { stock: delta } });
  }

  // Auto-update root expiryDate to nearest expiring batch expiry date if batch tracking is active
  const updatedProduct = await db.collection('products').findOne({ _id: product._id });
  if (updatedProduct && Array.isArray(updatedProduct.batches) && updatedProduct.batches.length > 0) {
    const validExpiries = updatedProduct.batches
      .map(b => b.expiryDate)
      .filter(Boolean)
      .sort();
    if (validExpiries.length > 0) {
      await db.collection('products').updateOne(
        { _id: product._id },
        { $set: { expiryDate: validExpiries[0] } }
      );
    }
  }

  // Real-time stock alerts check & socket broadcast
  const finalProduct = await db.collection('products').findOne({ _id: product._id });
  if (finalProduct) {
    const stock = Number(finalProduct.stock) || 0;
    const threshold = Number(finalProduct.lowStockLevel) || 5;
    if (stock < threshold && global.io) {
      global.io.emit('low_stock_alert', {
        productId: String(finalProduct._id),
        name: finalProduct.name,
        sku: finalProduct.sku || '',
        stock: stock,
        lowStockLevel: threshold,
        username: username
      });
    }
  }
}

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

    // 1. Double-Entry Sync Trigger for Accountant Ledgers
    try {
      const isCreditSale = (sale.mode || '').toLowerCase().includes('credit');
      let customerObj = await Customer.findOne({ name: sale.customer });
      if (!customerObj && sale.customer) {
        const mainParty = await db.collection('parties').findOne({ username, name: sale.customer });
        customerObj = await Customer.create({
          name: sale.customer,
          email: mainParty?.email || '',
          phone: mainParty?.phone || '',
          address: mainParty?.billingAddress || mainParty?.address || '',
          openingBalance: Number(mainParty?.balance) || 0
        });
      }

      await Invoice.create({
        invoiceNumber: id,
        customer: customerObj ? customerObj._id : null,
        customerName: sale.customer || 'Walk-in Customer',
        amount: Number(sale.amount),
        dueDate: sale.dueDate || sale.date || new Date(),
        status: isCreditSale ? 'unpaid' : 'paid'
      });

      const cashLedger = await Ledger.findOne({ name: 'Cash' });
      const bankLedger = await Ledger.findOne({ name: 'Bank' });
      const arLedger = await Ledger.findOne({ name: 'Accounts Receivable' });
      const salesLedger = await Ledger.findOne({ name: 'Sales Revenue' }) || await Ledger.findOne({ name: 'Sales' });

      let debitLedger = cashLedger;
      if (isCreditSale) {
        debitLedger = arLedger;
      } else if ((sale.mode || '').toLowerCase().match(/bank|upi|card|online/)) {
        debitLedger = bankLedger;
      }

      if (debitLedger && salesLedger) {
        await JournalEntry.create({
          narration: `Sale Invoice ${id} to ${sale.customer || 'Walk-in Customer'}`,
          entries: [
            { ledger: debitLedger._id, type: 'debit', amount: Number(sale.amount) },
            { ledger: salesLedger._id, type: 'credit', amount: Number(sale.amount) }
          ],
          date: sale.date || new Date()
        });

        debitLedger.balance = (debitLedger.balance || 0) + Number(sale.amount);
        await debitLedger.save();

        salesLedger.balance = (salesLedger.balance || 0) + Number(sale.amount);
        await salesLedger.save();
      }

      if (isCreditSale && customerObj) {
        customerObj.openingBalance = (customerObj.openingBalance || 0) + Number(sale.amount);
        await customerObj.save();
      }
    } catch (acctErr) {
      console.error('Accountant sales sync failed:', acctErr.message || acctErr);
    }

    // create transaction
    const lastTxn = await db.collection('transactions').find({ username }).sort({ _id: -1 }).limit(1).toArray();
    const lastBalance = lastTxn[0]?.balance || 0;
    const txnId = `TXN-${Date.now()}`;
    const credit = Number(sale.amount) || 0;
    const isCreditSale = (sale.mode || '').toLowerCase().includes('credit');
    const newTxn = {
      id: txnId,
      date: sale.date || new Date().toISOString().substring(0,10),
      type: 'Sale',
      party: sale.customer || '',
      debit: 0,
      credit,
      balance: lastBalance + credit,
      debitAccount: isCreditSale 
        ? 'Accounts Receivable (Asset)' 
        : ((sale.mode || '').toLowerCase().match(/bank|upi|card/) 
          ? 'Bank/UPI Account (Asset)' 
          : 'Cash in Hand (Asset)'),
      creditAccount: 'Sales Revenue (Income)',
      username
    };
    await db.collection('transactions').insertOne(newTxn);

    // update product stocks and batches if applicable
    const products = sale.items || [];
    for (const it of products) {
      if (!it.name) continue;
      const qtyChange = -(Number(it.qty) || 0);
      await adjustProductBatchStock(db, username, it.name, it.sku, it.batchNumber, qtyChange, null, it.serialNumbers);
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

    const type = pur.purchaseType || 'Purchase Invoice';
    let newTxn = null;

    if (type !== 'Purchase Order') {
      // create transaction
      const lastTxn = await db.collection('transactions').find({ username }).sort({ _id: -1 }).limit(1).toArray();
      const lastBalance = lastTxn[0]?.balance || 0;
      const txnId = `TXN-${Date.now()}`;
      const amount = Number(pur.amount) || 0;
      const isBankPur = (pur.mode || '').toLowerCase().match(/bank|upi|card/);
      const isCreditPur = (pur.mode || '').toLowerCase().includes('credit');
      const debitAccount = (type === 'Purchase Return' || type === 'Debit Note')
        ? (isCreditPur ? 'Accounts Payable (Liability)' : (isBankPur ? 'Bank/UPI Account (Asset)' : 'Cash in Hand (Asset)'))
        : 'Cost of Goods Sold (Expense)';
      const creditAccount = (type === 'Purchase Return' || type === 'Debit Note')
        ? 'Cost of Goods Sold (Expense)'
        : (isCreditPur ? 'Accounts Payable (Liability)' : (isBankPur ? 'Bank/UPI Account (Asset)' : 'Cash in Hand (Asset)'));

      if (type === 'Purchase Return' || type === 'Debit Note') {
        newTxn = {
          id: txnId,
          date: pur.date || new Date().toISOString().substring(0,10),
          type: type,
          party: pur.supplier || '',
          debit: 0,
          credit: amount,
          balance: lastBalance + amount,
          debitAccount,
          creditAccount,
          username
        };
      } else {
        newTxn = {
          id: txnId,
          date: pur.date || new Date().toISOString().substring(0,10),
          type: 'Purchase',
          party: pur.supplier || '',
          debit: amount,
          credit: 0,
          balance: lastBalance - amount,
          debitAccount,
          creditAccount,
          username
        };
      }
      await db.collection('transactions').insertOne(newTxn);

      // update product stocks (increase for Invoice, decrease for Return/Debit) and batches
      const stockMultiplier = (type === 'Purchase Return' || type === 'Debit Note') ? -1 : 1;
      const products = pur.items || [];
      for (const it of products) {
        if (!it.name) continue;
        const qtyChange = (Number(it.qty) || 0) * stockMultiplier;
        await adjustProductBatchStock(db, username, it.name, it.sku, it.batchNumber, qtyChange, {
          mfgDate: it.mfgDate,
          expiryDate: it.expiryDate,
          purchasePrice: it.rate
        }, it.serialNumbers);
      }

      // update supplier balance if credit
      if ((pur.mode || '').toLowerCase().includes('credit')) {
        const balanceChange = (type === 'Purchase Return' || type === 'Debit Note') ? -amount : amount;
        await db.collection('parties').updateOne({ username, name: pur.supplier }, { $inc: { balance: balanceChange }, $set: { lastTxn: pur.date || new Date().toISOString().substring(0,10) } });
      }
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

    // build maps by product name and batch number
    const mapQty = (arr) => {
      const m = {};
      for (const it of arr) {
        const prodKey = (it.sku || it.name || '').toString();
        const batchKey = it.batchNumber || '';
        const key = `${prodKey}::${batchKey}`;
        m[key] = {
          qty: (m[key]?.qty || 0) + (Number(it.qty) || 0),
          sku: it.sku || '',
          name: it.name || '',
          batchNumber: it.batchNumber || '',
          mfgDate: it.mfgDate || null,
          expiryDate: it.expiryDate || null,
          rate: it.rate || 0,
          serialNumbers: it.serialNumbers || []
        };
      }
      return m;
    };
    const oldMap = mapQty(oldItems);
    const newMap = mapQty(newItems);

    const oldType = existing.purchaseType || 'Purchase Invoice';
    const newType = data.purchaseType || 'Purchase Invoice';

    const getMultiplier = (t) => {
      if (t === 'Purchase Return' || t === 'Debit Note') return -1;
      if (t === 'Purchase Order') return 0;
      return 1; // Purchase Invoice
    };

    const oldMultiplier = getMultiplier(oldType);
    const newMultiplier = getMultiplier(newType);

    const keys = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
    for (const k of keys) {
      const oldItem = oldMap[k] || { qty: 0 };
      const newItem = newMap[k] || { qty: 0 };
      const stockDiff = (newItem.qty * newMultiplier) - (oldItem.qty * oldMultiplier);
      if (stockDiff === 0) continue;
      
      const itemSku = newItem.sku || oldItem.sku || '';
      const itemName = newItem.name || oldItem.name || '';
      const batchNo = newItem.batchNumber || oldItem.batchNumber || '';
      
      let serialsToPass = null;
      if (newItem.serialNumbers || oldItem.serialNumbers) {
        const oldS = Array.isArray(oldItem.serialNumbers) ? oldItem.serialNumbers : [];
        const newS = Array.isArray(newItem.serialNumbers) ? newItem.serialNumbers : [];
        if (stockDiff > 0) {
          serialsToPass = newS.filter(x => !oldS.includes(x));
        } else {
          serialsToPass = oldS.filter(x => !newS.includes(x));
        }
      }
      
      await adjustProductBatchStock(db, data.username, itemName, itemSku, batchNo, stockDiff, {
        mfgDate: newItem.mfgDate,
        expiryDate: newItem.expiryDate,
        purchasePrice: newItem.rate
      }, serialsToPass);
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

    const type = existing.purchaseType || 'Purchase Invoice';
    
    if (type !== 'Purchase Order') {
      const stockMultiplier = (type === 'Purchase Return' || type === 'Debit Note') ? 1 : -1;
      const items = existing.items || [];
      for (const it of items) {
        const qty = Number(it.qty) || 0;
        if (!qty) continue;
        await adjustProductBatchStock(db, username, it.name, it.sku, it.batchNumber, qty * stockMultiplier, null, it.serialNumbers);
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
    const doc = { ...prod, active: true, username };
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
      notes: p.notes || '',
      serialNumber: p.serialNumber || '',
      batchNumber: p.batchNumber || '',
      batches: p.batches || [],
      hasSerialTracking: p.hasSerialTracking === true || p.hasSerialTracking === 'true',
      serialNumbers: Array.isArray(p.serialNumbers) ? p.serialNumbers : (p.serialNumbers ? p.serialNumbers.toString().split(',').map(s => s.trim()) : []),
      active: true
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
    const q = { username, active: { $ne: false } };
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
    const prods = await db.collection('products').find({ username, active: { $ne: false } }).toArray();
    
    const activePOs = await db.collection('purchases').find({
      username,
      purchaseType: 'Purchase Order',
      active: { $ne: false }
    }).toArray();

    const orderedQtyMap = {};
    activePOs.forEach(po => {
      if (Array.isArray(po.items)) {
        po.items.forEach(item => {
          if (item.name) {
            const key = item.name.trim().toLowerCase();
            orderedQtyMap[key] = (orderedQtyMap[key] || 0) + (Number(item.qty) || 0);
          }
          if (item.sku) {
            const key = item.sku.trim().toLowerCase();
            orderedQtyMap[key] = (orderedQtyMap[key] || 0) + (Number(item.qty) || 0);
          }
        });
      }
    });

    const getEffectiveStock = (p) => {
      const pName = (p.name || '').trim().toLowerCase();
      const pSku = (p.sku || '').trim().toLowerCase();
      const orderedQty = (orderedQtyMap[pName] || 0) || (pSku ? (orderedQtyMap[pSku] || 0) : 0);
      return (Number(p.stock) || 0) + orderedQty;
    };

    const outOfStock = prods.filter(p => getEffectiveStock(p) <= 0).map(p => ({ id: p.id || p._id, name: p.name }));
    const lowStock = prods.filter(p => {
      const effStock = getEffectiveStock(p);
      return effStock > 0 && effStock <= (Number(p.lowStockLevel) || 5);
    }).map(p => ({ id: p.id || p._id, name: p.name, stock: p.stock, lowStockLevel: p.lowStockLevel }));
    
    const todayDate = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(todayDate.getDate() + 30);
    const todayStr = todayDate.toISOString().substring(0,10);
    const thirtyDaysStr = thirtyDaysLater.toISOString().substring(0,10);

    const expired = [];
    const expiringSoon = [];

    prods.forEach(p => {
      // Check root expiry
      if (p.expiryDate) {
        if (p.expiryDate <= todayStr) {
          expired.push({ id: p.id || p._id, name: p.name, expiryDate: p.expiryDate });
        } else if (p.expiryDate > todayStr && p.expiryDate <= thirtyDaysStr) {
          expiringSoon.push({ id: p.id || p._id, name: p.name, expiryDate: p.expiryDate });
        }
      }

      // Check nested batch expiries
      if (Array.isArray(p.batches)) {
        p.batches.forEach(b => {
          if (b.expiryDate) {
            if (b.expiryDate <= todayStr) {
              expired.push({ id: p.id || p._id, name: `${p.name} (Batch: ${b.batchNumber})`, expiryDate: b.expiryDate, batchNumber: b.batchNumber });
            } else if (b.expiryDate > todayStr && b.expiryDate <= thirtyDaysStr) {
              expiringSoon.push({ id: p.id || p._id, name: `${p.name} (Batch: ${b.batchNumber})`, expiryDate: b.expiryDate, batchNumber: b.batchNumber });
            }
          }
        });
      }
    });
    
    return res.json({ status: 'success', outOfStock, lowStock, expired, expiringSoon });
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

    // Auto-sync customer/supplier ledger to Accountant
    try {
      if ((party.type || '').toLowerCase() === 'customer') {
        await Customer.create({
          name: party.name,
          email: party.email || '',
          phone: party.phone || '',
          address: party.billingAddress || party.address || '',
          openingBalance: Number(party.balance) || 0
        });
      } else if ((party.type || '').toLowerCase() === 'supplier') {
        // Create supplier ledger as liability accounts payable ledger in Accountant Ledgers
        await Ledger.create({
          name: party.name,
          type: 'liability',
          balance: Number(party.balance) || 0
        });
      }
    } catch (acctErr) {
      console.error('Accountant party sync failed:', acctErr.message || acctErr);
    }

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
    if (type === 'products' || type === 'purchases') {
      query.active = { $ne: false };
    }
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
    const activePOs = purchases.filter(p => p.active !== false && p.purchaseType === 'Purchase Order');
    const orderedQtyMap = {};
    activePOs.forEach(po => {
      if (Array.isArray(po.items)) {
        po.items.forEach(item => {
          if (item.name) {
            const key = item.name.trim().toLowerCase();
            orderedQtyMap[key] = (orderedQtyMap[key] || 0) + (toNumber(item.qty) || 0);
          }
          if (item.sku) {
            const key = item.sku.trim().toLowerCase();
            orderedQtyMap[key] = (orderedQtyMap[key] || 0) + (toNumber(item.qty) || 0);
          }
        });
      }
    });

    const getEffectiveStock = (p) => {
      const pName = (p.name || '').trim().toLowerCase();
      const pSku = (p.sku || '').trim().toLowerCase();
      const orderedQty = (orderedQtyMap[pName] || 0) || (pSku ? (orderedQtyMap[pSku] || 0) : 0);
      return toNumber(p.stock) + orderedQty;
    };

    const lowStockCount = products.filter(p => getEffectiveStock(p) <= (toNumber(p.lowStockLevel) || 5)).length;
    const outOfStockCount = products.filter(p => getEffectiveStock(p) <= 0).length;

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

    // Sync to staffusers credentials collection
    if (staff.email) {
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(staff.password || 'vyapar123', salt);

      const permissions = {
        canDiscount: !!(staff.permissions?.canApplyDiscounts),
        canViewAllInvoices: !!(staff.permissions?.canViewReports),
        canEditInventory: !!(staff.permissions?.canManageInventory),
        canManageDelivery: !!(staff.permissions?.canManageDeliveries),
        canViewReports: !!(staff.permissions?.canViewReports),
        canEditRate: !!(staff.permissions?.canEditBills),
        canIssueCredit: !!(staff.permissions?.canDeleteBills),
        canAcceptPayment: !!(staff.permissions?.canCreateBills),
        canManageParties: !!(staff.permissions?.canManageParties),
        canViewAccounts: !!(staff.permissions?.canViewAccounts)
      };

      await db.collection('staffusers').updateOne(
        { email: staff.email.toLowerCase().trim() },
        {
          $set: {
            name: staff.name,
            email: staff.email.toLowerCase().trim(),
            password: passwordHash,
            phone: staff.phone || '',
            address: staff.address || '',
            role: (staff.role || 'staff').toLowerCase().includes('accountant') ? 'accountant' : ( (staff.role || 'staff').toLowerCase().includes('delivery') ? 'delivery_boy' : 'staff' ),
            permissions,
            isActive: true
          }
        },
        { upsert: true }
      );
    }

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

    // Sync update to staffusers credentials collection
    const staffDoc = await db.collection('staff').findOne({ _id: new ObjectId(id) });
    if (staffDoc && staffDoc.email) {
      const permissions = {
        canDiscount: !!(staffDoc.permissions?.canApplyDiscounts),
        canViewAllInvoices: !!(staffDoc.permissions?.canViewReports),
        canEditInventory: !!(staffDoc.permissions?.canManageInventory),
        canManageDelivery: !!(staffDoc.permissions?.canManageDeliveries),
        canViewReports: !!(staffDoc.permissions?.canViewReports),
        canEditRate: !!(staffDoc.permissions?.canEditBills),
        canIssueCredit: !!(staffDoc.permissions?.canDeleteBills),
        canAcceptPayment: !!(staffDoc.permissions?.canCreateBills),
        canManageParties: !!(staffDoc.permissions?.canManageParties),
        canViewAccounts: !!(staffDoc.permissions?.canViewAccounts)
      };

      const updatePayload = {
        name: staffDoc.name,
        phone: staffDoc.phone || '',
        address: staffDoc.address || '',
        role: (staffDoc.role || 'staff').toLowerCase().includes('accountant') ? 'accountant' : ( (staffDoc.role || 'staff').toLowerCase().includes('delivery') ? 'delivery_boy' : 'staff' ),
        permissions,
        isActive: staffDoc.active !== false
      };

      if (data.password) {
        const bcrypt = require('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        updatePayload.password = await bcrypt.hash(data.password, salt);
      }

      await db.collection('staffusers').updateOne(
        { email: staffDoc.email.toLowerCase().trim() },
        { $set: updatePayload }
      );
    }

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
    const staffDoc = await db.collection('staff').findOne({ _id: new ObjectId(id) });
    await db.collection('staff').updateOne({ _id: new ObjectId(id) }, { $set: { active: false, deletedAt: new Date().toISOString().substring(0,10) } });
    
    if (staffDoc && staffDoc.email) {
      await db.collection('staffusers').updateOne(
        { email: staffDoc.email.toLowerCase().trim() },
        { $set: { isActive: false } }
      );
    }

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
    const staff = await db.collection('staff').find({ username, deletedAt: { $exists: false } }).toArray();
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

    const staffDoc = await db.collection('staff').findOne({ _id: new ObjectId(id) });
    if (staffDoc && staffDoc.email) {
      await db.collection('staffusers').updateOne(
        { email: staffDoc.email.toLowerCase().trim() },
        { $set: { isActive: !!active } }
      );
    }

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

// Get login history for a staff member by email
async function getStaffLogins(req, res) {
  const { id } = req.params;
  const { username } = req.query;
  if (!id || !username) return res.status(400).json({ status: 'error', message: 'staff id and username required' });
  try {
    const db = getDB();
    const staffMember = await db.collection('staff').findOne({ _id: new ObjectId(id), username });
    if (!staffMember) return res.status(404).json({ status: 'error', message: 'Staff member not found' });
    
    if (!staffMember.email) {
      return res.json([]);
    }
    
    const logins = await db.collection('loginhistories')
      .find({ email: staffMember.email.toLowerCase() })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
      
    return res.json(logins.map(l => ({
      _id: String(l._id),
      email: l.email,
      ipAddress: l.ipAddress || 'unknown',
      userAgent: l.userAgent || 'unknown',
      successful: !!l.successful,
      timestamp: l.createdAt || l.timestamp || new Date()
    })));
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
module.exports.getStaffLogins = getStaffLogins;


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

function buildInvoiceQuery(id) {
  const conditions = [{ id }, { invoiceNumber: id }, { _id: id }];
  if (ObjectId.isValid(id)) {
    try { conditions.push({ _id: new ObjectId(id) }); } catch (e) {}
  }
  return { $or: conditions };
}

// Edit invoice
async function editInvoice(req, res) {
  const { id } = req.params;
  const data = req.body;
  if (!id) return res.status(400).json({ status: 'error', message: 'invoice id required' });
  try {
    const db = getDB();
    await db.collection('invoices').updateOne(buildInvoiceQuery(id), { $set: data });
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
    await db.collection('invoices').deleteOne(buildInvoiceQuery(id));
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

    // Automatically process recurring invoices
    try {
      const todayStr = new Date().toISOString().substring(0, 10);
      const recurringDue = await db.collection('invoices').find({
        username,
        'recurring.nextRun': { $lte: todayStr }
      }).toArray();

      for (const inv of recurringDue) {
        const interval = Number(inv.recurring.intervalDays);
        if (interval > 0) {
          // Calculate new nextRun date
          const currentNextRun = new Date(inv.recurring.nextRun);
          currentNextRun.setDate(currentNextRun.getDate() + interval);
          const newNextRunStr = currentNextRun.toISOString().substring(0, 10);

          // Update the original invoice's nextRun
          await db.collection('invoices').updateOne(
            { _id: inv._id },
            { $set: { 'recurring.nextRun': newNextRunStr } }
          );

          // Insert a new duplicate invoice for the current run
          const newId = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const newInvoiceNumber = `INV-${Math.floor(100000 + Math.random() * 900000)}`;
          const newInvoice = {
            ...inv,
            id: newId,
            invoiceNumber: newInvoiceNumber,
            date: inv.recurring.nextRun,
            dueDate: inv.recurring.nextRun,
            createdAt: todayStr,
            paymentReceived: 0,
            balanceDue: inv.totalAmount,
            status: 'Unpaid'
          };
          delete newInvoice._id;
          delete newInvoice.recurring;

          await db.collection('invoices').insertOne(newInvoice);
        }
      }
    } catch (recurringErr) {
      console.error('Error processing recurring invoices:', recurringErr);
    }

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
    const inv = await db.collection('invoices').findOne(buildInvoiceQuery(id));
    return res.json(inv || {});
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Generate PDF for invoice and stream to response
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

    const fs = require('fs');
    const path = require('path');

    // Fetch central shop profile
    const shopProfile = await db.collection('sa_shop_profile').findOne({ isCentral: true }) || {};

    // Fetch customer party details if possible
    let customerParty = {};
    if (inv.customer) {
      const query = { name: { $regex: new RegExp("^" + inv.customer.trim() + "$", "i") } };
      if (inv.username) query.username = inv.username;
      customerParty = await db.collection('parties').findOne(query) || {};
    }

    const printSize = inv.printSize || 'A4';
    const templateStyle = inv.templateStyle || 'Classic';

    let pageSize = 'A4';
    let margin = 40;
    let width = 595.28;
    let height = 841.89;

    if (printSize === 'A5') {
      pageSize = 'A5';
      margin = 24;
      width = 419.53;
      height = 595.28;
    } else if (printSize === '80mm') {
      margin = 10;
      width = 226.77;
      height = Math.max(400, 150 + (inv.items ? inv.items.length : 0) * 45 + 280);
      pageSize = [width, height];
    } else if (printSize === '58mm') {
      margin = 6;
      width = 164.41;
      height = Math.max(380, 150 + (inv.items ? inv.items.length : 0) * 55 + 280);
      pageSize = [width, height];
    }

    const usableWidth = width - margin * 2;
    const isThermal = printSize === '80mm' || printSize === '58mm';
    const fontName = isThermal ? 'Courier' : 'Helvetica';
    const fontBold = isThermal ? 'Courier-Bold' : 'Helvetica-Bold';

    // Scale font & sizes for A5 page
    const scale = printSize === 'A5' ? 0.75 : 1.0;
    const fSize = (pt) => pt * scale;

    // Colors
    let primaryColor = '#1e3a8a'; // Slate Navy
    let secondaryColor = '#475569'; // Slate Grey
    let highlightColor = '#cbd5e1'; // Accent Grey
    let textMuted = '#64748b';
    let textDark = '#1e293b';

    if (templateStyle === 'Modern') {
      primaryColor = '#1e3a8a';
      secondaryColor = '#3b82f6';
      highlightColor = '#f8fafc';
    } else if (templateStyle === 'Minimal') {
      primaryColor = '#10b981'; // Emerald
      secondaryColor = '#0f172a'; // Slate Dark
      highlightColor = '#f1f5f9';
    }

    const doc = new PDFDocument({ size: pageSize, margin: margin });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${inv.invoiceNumber || inv.id}.pdf`);
    doc.pipe(res);

    // Setup basic typography helper
    const setFont = (bold = false, size = 10) => {
      doc.font(bold ? fontBold : fontName).fontSize(fSize(size));
    };

    let yVal = margin;

    // Render logic
    if (isThermal) {
      // Monospace layout
      setFont(true, 13);
      const shopName = shopProfile.shopName || inv.username || 'Vyapar Store';
      doc.text(shopName.toUpperCase(), margin, yVal, { width: usableWidth, align: 'center' });
      yVal += 16;

      setFont(false, 9);
      const addressStr = `${shopProfile.addressLine1 || ''} ${shopProfile.addressLine2 || ''} ${shopProfile.city || ''} ${shopProfile.state || ''} ${shopProfile.pincode || ''}`.trim();
      if (addressStr) {
        doc.text(addressStr, margin, yVal, { width: usableWidth, align: 'center' });
        yVal += doc.heightOfString(addressStr, { width: usableWidth }) + 4;
      }

      const contactStr = `Tel: ${shopProfile.phone || 'N/A'} | Email: ${shopProfile.email || 'N/A'}`;
      doc.text(contactStr, margin, yVal, { width: usableWidth, align: 'center' });
      yVal += 12;

      if (shopProfile.gstin) {
        doc.text(`GSTIN: ${shopProfile.gstin}`, margin, yVal, { width: usableWidth, align: 'center' });
        yVal += 12;
      }

      // Divider line
      setFont(false, 9);
      doc.text('----------------------------------------------------', margin, yVal, { width: usableWidth });
      yVal += 10;

      // Invoice metadata
      setFont(true, 10);
      doc.text((inv.type || 'Sale Invoice').toUpperCase(), margin, yVal);
      yVal += 12;

      setFont(false, 9);
      doc.text(`Bill No: ${inv.invoiceNumber || inv.id}`, margin, yVal);
      yVal += 11;
      doc.text(`Date: ${inv.date || ''} ${inv.dueDate && inv.dueDate !== inv.date ? `| Due: ${inv.dueDate}` : ''}`, margin, yVal);
      yVal += 11;
      doc.text(`Customer: ${inv.customer || ''}`, margin, yVal);
      yVal += 11;
      if (customerParty.phone) {
        doc.text(`Phone: ${customerParty.phone}`, margin, yVal);
        yVal += 11;
      }
      doc.text(`Tax Rule: ${inv.taxType || 'Intra-state'}`, margin, yVal);
      yVal += 14;

      doc.text('----------------------------------------------------', margin, yVal, { width: usableWidth });
      yVal += 10;

      // Table Header/List
      setFont(true, 9);
      if (printSize === '80mm') {
        doc.text('Item Description', margin, yVal);
        doc.text('Qty', margin + 110, yVal);
        doc.text('Rate', margin + 140, yVal, { width: 30, align: 'right' });
        doc.text('Amt', margin + 170, yVal, { width: 36, align: 'right' });
      } else {
        // 58mm has only 150 points usable, so we draw simple text header
        doc.text('Items Details:', margin, yVal);
      }
      yVal += 12;

      doc.text('----------------------------------------------------', margin, yVal, { width: usableWidth });
      yVal += 8;

      // Table items list
      setFont(false, 9);
      if (Array.isArray(inv.items) && inv.items.length) {
        inv.items.forEach((it, idx) => {
          const name = it.name || `Item ${idx+1}`;
          const qty = it.qty || it.quantity || 1;
          const rate = Number(it.rate || it.price || 0);
          const lineDisc = it.discountType === 'flat' ? it.discount : (rate * qty * (it.discount / 100));
          const lineTotal = (qty * rate) - lineDisc;

          setFont(true, 9);
          doc.text(`${idx + 1}. ${name}`, margin, yVal, { width: usableWidth });
          yVal += doc.heightOfString(`${idx + 1}. ${name}`, { width: usableWidth }) + 2;

          setFont(false, 9);
          const detailStr = `   ${qty} ${it.unit || 'pcs'} x ${fmtCurrency(rate)}${it.discount > 0 ? ` (-${it.discountType === 'flat' ? fmtCurrency(it.discount) : `${it.discount}%`})` : ''}`;
          doc.text(detailStr, margin, yVal);
          doc.text(fmtCurrency(lineTotal), margin + usableWidth - 60, yVal, { width: 60, align: 'right' });
          yVal += 12;
        });
      }

      doc.text('----------------------------------------------------', margin, yVal, { width: usableWidth });
      yVal += 10;

      // Calculations summary
      setFont(false, 9);
      const printSumRow = (label, val, bold = false) => {
        setFont(bold, 9);
        doc.text(label, margin, yVal, { width: usableWidth - 70 });
        doc.text(val, margin + usableWidth - 70, yVal, { width: 70, align: 'right' });
        yVal += 12;
      };

      printSumRow('Subtotal:', fmtCurrency(inv.subtotal || 0));
      if (inv.discount > 0) {
        const discAmt = inv.overallDiscountType === 'percent' ? (inv.subtotal * (inv.discount / 100)) : inv.discount;
        printSumRow(`Discount ${inv.overallDiscountType === 'percent' ? `(${inv.discount}%)` : ''}:`, `-${fmtCurrency(discAmt)}`);
      }
      if (inv.additionalCharges > 0) {
        printSumRow(`${inv.chargeLabel || 'Delivery'} Charges:`, `+${fmtCurrency(inv.additionalCharges)}`);
      }

      const cgst = Number(inv.cgst || 0);
      const sgst = Number(inv.sgst || 0);
      const igst = Number(inv.igst || 0);
      if (cgst > 0) printSumRow('  CGST (Central Tax):', fmtCurrency(cgst));
      if (sgst > 0) printSumRow('  SGST (State Tax):', fmtCurrency(sgst));
      if (igst > 0) printSumRow('  IGST (Integrated Tax):', fmtCurrency(igst));

      const roundOff = Number(inv.roundOff || 0);
      if (roundOff !== 0) {
        printSumRow('Round Off:', (roundOff > 0 ? '+' : '') + fmtCurrency(roundOff));
      }

      // Total Amount
      yVal += 2;
      doc.text('----------------------------------------------------', margin, yVal, { width: usableWidth });
      yVal += 6;
      setFont(true, 11);
      doc.text('TOTAL AMOUNT:', margin, yVal);
      doc.text(fmtCurrency(inv.totalAmount || 0), margin + usableWidth - 80, yVal, { width: 80, align: 'right' });
      yVal += 18;

      setFont(false, 9);
      doc.text(`Payment Mode: ${inv.paymentMode || 'Cash'}`, margin, yVal);
      yVal += 11;
      doc.text(`Received Amount: ${fmtCurrency(inv.paymentReceived || 0)}`, margin, yVal);
      yVal += 11;
      
      const bal = Number(inv.balanceDue || 0);
      setFont(true, 9);
      doc.text(bal <= 0 ? `Change Due: ${fmtCurrency(Math.abs(bal))}` : `Balance Due: ${fmtCurrency(bal)}`, margin, yVal);
      yVal += 16;

      doc.text('----------------------------------------------------', margin, yVal, { width: usableWidth });
      yVal += 10;

      setFont(false, 8.5);
      if (inv.notes) {
        doc.text(`Notes: ${inv.notes}`, margin, yVal, { width: usableWidth });
        yVal += doc.heightOfString(`Notes: ${inv.notes}`, { width: usableWidth }) + 6;
      }
      if (inv.terms) {
        doc.text(`Terms: ${inv.terms}`, margin, yVal, { width: usableWidth });
        yVal += doc.heightOfString(`Terms: ${inv.terms}`, { width: usableWidth }) + 6;
      }

      setFont(true, 9);
      doc.text('*** THANK YOU! VISIT AGAIN ***', margin, yVal, { width: usableWidth, align: 'center' });

    } else {
      // A4 / A5 Layouts

      // 1. Header Layout
      if (templateStyle === 'Classic') {
        // Navy top accent bar
        doc.rect(margin, yVal, usableWidth, 4).fill(primaryColor);
        yVal += 12;

        // Brand details
        setFont(true, 20);
        doc.fillColor(primaryColor);
        const shopName = shopProfile.shopName || inv.username || 'Vyapar Store';
        doc.text(shopName.toUpperCase(), margin, yVal, { width: usableWidth * 0.6 });
        
        // Logo checking
        let logoHeightAdjust = 0;
        if (shopProfile.logoUrl) {
          try {
            const cleanUrl = shopProfile.logoUrl.replace(/^\//, '');
            const logoPath = path.join(__dirname, '..', cleanUrl);
            if (fs.existsSync(logoPath)) {
              doc.image(logoPath, margin, yVal, { maxHeight: fSize(40) });
              logoHeightAdjust = fSize(45);
            }
          } catch (e) {
            // Ignore logo draw failures
          }
        }
        
        setFont(false, 11);
        doc.fillColor(textDark);
        const shopAddress = `${shopProfile.addressLine1 || ''} ${shopProfile.addressLine2 || ''} ${shopProfile.city || ''} ${shopProfile.state || ''} ${shopProfile.pincode || ''}`.trim() || 'Vyapar Address';
        
        let infoY = yVal + logoHeightAdjust + fSize(24);
        doc.text(shopAddress, margin, infoY, { width: usableWidth * 0.6 });
        infoY += doc.heightOfString(shopAddress, { width: usableWidth * 0.6 }) + 4;
        
        doc.text(`Phone: ${shopProfile.phone || 'N/A'} | Email: ${shopProfile.email || 'N/A'}`, margin, infoY);
        infoY += 14;
        doc.text(`GSTIN: ${shopProfile.gstin || 'N/A'} | PAN: ${shopProfile.pan || 'N/A'}`, margin, infoY);

        // Invoice type & meta on right
        setFont(true, 24);
        doc.fillColor(primaryColor);
        doc.text((inv.type || 'Sale Invoice').toUpperCase(), margin + usableWidth * 0.6, yVal, { width: usableWidth * 0.4, align: 'right' });
        
        setFont(false, 11);
        doc.fillColor(textDark);
        let metaY = yVal + fSize(32);
        
        const drawMetaRow = (label, val) => {
          setFont(true, 11);
          doc.text(label, margin + usableWidth * 0.6, metaY, { width: usableWidth * 0.18 });
          setFont(false, 11);
          doc.text(val, margin + usableWidth * 0.78, metaY, { width: usableWidth * 0.22, align: 'right' });
          metaY += 14;
        };

        drawMetaRow('Invoice No:', inv.invoiceNumber || inv.id);
        drawMetaRow('Date:', inv.date || '');
        drawMetaRow('Due Date:', inv.dueDate || '');
        drawMetaRow('Tax Type:', inv.taxType || 'Intra-state');

        yVal = Math.max(infoY + 20, metaY + 10);

        // Divider
        doc.moveTo(margin, yVal).lineTo(margin + usableWidth, yVal).strokeColor(primaryColor).lineWidth(1.5).stroke();
        yVal += 16;

      } else if (templateStyle === 'Modern') {
        // Banner block
        doc.rect(margin, yVal, usableWidth, fSize(100)).fill(primaryColor);
        
        // White text on banner
        doc.fillColor('#ffffff');
        
        let logoOffset = 0;
        if (shopProfile.logoUrl) {
          try {
            const cleanUrl = shopProfile.logoUrl.replace(/^\//, '');
            const logoPath = path.join(__dirname, '..', cleanUrl);
            if (fs.existsSync(logoPath)) {
              doc.image(logoPath, margin + fSize(16), yVal + fSize(16), { maxHeight: fSize(40) });
              logoOffset = fSize(55);
            }
          } catch (e) {
            // Ignore logo draw failures
          }
        }

        setFont(true, 18);
        const shopName = shopProfile.shopName || inv.username || 'Vyapar Store';
        doc.text(shopName.toUpperCase(), margin + fSize(16) + logoOffset, yVal + fSize(16), { width: usableWidth * 0.5 - logoOffset });
        
        setFont(false, 9.5);
        const shopAddress = `${shopProfile.addressLine1 || ''} ${shopProfile.addressLine2 || ''} ${shopProfile.city || ''} ${shopProfile.state || ''} ${shopProfile.pincode || ''}`.trim() || 'Vyapar Address';
        doc.text(shopAddress, margin + fSize(16) + logoOffset, yVal + fSize(40), { width: usableWidth * 0.5 - logoOffset });
        doc.text(`Phone: ${shopProfile.phone || 'N/A'} | GSTIN: ${shopProfile.gstin || 'N/A'}`, margin + fSize(16) + logoOffset, yVal + fSize(70));

        // Invoice title pill on right
        setFont(true, 12);
        doc.rect(margin + usableWidth * 0.6, yVal + fSize(16), usableWidth * 0.35, fSize(22)).fillColor(secondaryColor).fill();
        
        doc.fillColor('#ffffff');
        doc.text((inv.type || 'Sale Invoice').toUpperCase(), margin + usableWidth * 0.6, yVal + fSize(21), { width: usableWidth * 0.35, align: 'center' });

        setFont(true, 20);
        doc.text(`#${inv.invoiceNumber || inv.id}`, margin + usableWidth * 0.6, yVal + fSize(46), { width: usableWidth * 0.35, align: 'right' });
        
        setFont(false, 10.5);
        doc.text(`Date: ${inv.date || ''}  |  Due: ${inv.dueDate || ''}`, margin + usableWidth * 0.6, yVal + fSize(74), { width: usableWidth * 0.35, align: 'right' });

        yVal += fSize(100) + 16;

      } else if (templateStyle === 'Minimal') {
        // Emerald top strip
        doc.rect(margin, yVal, usableWidth, 6).fill(primaryColor);
        yVal += 16;

        // Minimal Header
        setFont(true, 22);
        doc.fillColor(secondaryColor);
        const shopName = shopProfile.shopName || inv.username || 'Vyapar Store';
        doc.text(shopName, margin, yVal);
        
        setFont(false, 11);
        doc.fillColor(textMuted);
        const shopAddress = `${shopProfile.addressLine1 || ''} ${shopProfile.addressLine2 || ''} ${shopProfile.city || ''} ${shopProfile.state || ''} ${shopProfile.pincode || ''}`.trim() || 'Vyapar Address';
        
        let miniY = yVal + fSize(28);
        doc.text(shopAddress, margin, miniY, { width: usableWidth * 0.5 });
        miniY += doc.heightOfString(shopAddress, { width: usableWidth * 0.5 }) + 4;
        doc.text(`Phone: ${shopProfile.phone || 'N/A'} | Email: ${shopProfile.email || 'N/A'}`, margin, miniY);
        miniY += 14;
        doc.text(`GSTIN: ${shopProfile.gstin || 'N/A'}`, margin, miniY);

        // Right side minimalist invoice description
        setFont(true, 28);
        doc.fillColor(primaryColor);
        doc.text((inv.type || 'Invoice').split(' ')[0].toUpperCase(), margin + usableWidth * 0.5, yVal, { width: usableWidth * 0.5, align: 'right' });

        setFont(false, 11);
        doc.fillColor(textMuted);
        let rightY = yVal + fSize(36);
        
        const drawMinMeta = (label, val) => {
          setFont(false, 10.5);
          doc.text(label, margin + usableWidth * 0.6, rightY, { width: usableWidth * 0.16 });
          setFont(true, 10.5);
          doc.fillColor(secondaryColor);
          doc.text(val, margin + usableWidth * 0.76, rightY, { width: usableWidth * 0.24, align: 'right' });
          doc.fillColor(textMuted);
          rightY += 14;
        };

        drawMinMeta('Number:', `#${inv.invoiceNumber || inv.id}`);
        drawMinMeta('Issued:', inv.date || '');
        drawMinMeta('Due Date:', inv.dueDate || '');

        yVal = Math.max(miniY + 20, rightY + 10);
        
        // Simple divider
        doc.moveTo(margin, yVal).lineTo(margin + usableWidth, yVal).strokeColor('#cbd5e1').lineWidth(0.8).stroke();
        yVal += 16;
      }

      // 2. Billed To & Customer Info Section
      doc.fillColor(textDark);
      if (templateStyle === 'Classic') {
        const boxWidth = (usableWidth - 20) / 2;
        const boxHeight = fSize(72);
        
        // Billed To Box
        doc.roundedRect(margin, yVal, boxWidth, boxHeight, 4).strokeColor('#cbd5e1').stroke();
        setFont(true, 9.5);
        doc.fillColor(primaryColor);
        doc.text('BILLED TO', margin + 8, yVal + 6);
        
        setFont(true, 12);
        doc.fillColor(textDark);
        doc.text(inv.customer || 'Walking Customer', margin + 8, yVal + 18);
        setFont(false, 10);
        let partyDetailY = yVal + 32;
        if (customerParty.phone) {
          doc.text(`Phone: ${customerParty.phone}`, margin + 8, partyDetailY);
          partyDetailY += 13;
        }
        if (customerParty.email) {
          doc.text(`Email: ${customerParty.email}`, margin + 8, partyDetailY);
          partyDetailY += 13;
        }
        if (customerParty.state) {
          doc.text(`State: ${customerParty.state}`, margin + 8, partyDetailY);
        }

        // Ship To Box
        doc.roundedRect(margin + boxWidth + 20, yVal, boxWidth, boxHeight, 4).strokeColor('#cbd5e1').stroke();
        setFont(true, 9.5);
        doc.fillColor(primaryColor);
        doc.text('SHIP TO', margin + boxWidth + 28, yVal + 6);
        
        setFont(true, 12);
        doc.fillColor(textDark);
        doc.text(inv.customer || 'Walking Customer', margin + boxWidth + 28, yVal + 18);
        setFont(false, 10);
        let shipY = yVal + 32;
        if (customerParty.state) {
          doc.text(`Destination: ${customerParty.state}`, margin + boxWidth + 28, shipY);
          shipY += 13;
        }
        doc.text('Transport: Standard Handover', margin + boxWidth + 28, shipY);

        yVal += boxHeight + 20;

      } else if (templateStyle === 'Modern') {
        const cardWidth = (usableWidth - 20) / 2;
        const cardHeight = fSize(76);

        // Billed Customer card
        doc.roundedRect(margin, yVal, cardWidth, cardHeight, 6).fillColor('#f8fafc').fill();
        setFont(true, 9.5);
        doc.fillColor(secondaryColor);
        doc.text('BILLED CUSTOMER', margin + 12, yVal + 8);
        
        setFont(true, 13);
        doc.fillColor(textDark);
        doc.text(inv.customer || 'Walking Customer', margin + 12, yVal + 20);
        
        setFont(false, 10);
        let cardTextY = yVal + 35;
        if (customerParty.phone) {
          doc.text(`Phone: ${customerParty.phone}`, margin + 12, cardTextY);
          cardTextY += 13;
        }
        if (customerParty.email) {
          doc.text(`Email: ${customerParty.email}`, margin + 12, cardTextY);
          cardTextY += 13;
        }
        if (customerParty.state) {
          doc.text(`State: ${customerParty.state}`, margin + 12, cardTextY);
        }

        // Invoice Metadata card
        doc.roundedRect(margin + cardWidth + 20, yVal, cardWidth, cardHeight, 6).fillColor('#f8fafc').fill();
        setFont(true, 9.5);
        doc.fillColor(secondaryColor);
        doc.text('INVOICE METADATA', margin + cardWidth + 32, yVal + 8);

        setFont(false, 10.5);
        doc.fillColor(textDark);
        let mY = yVal + 22;
        const drawGridRow = (l, v, highlight = false) => {
          doc.fillColor(textMuted).text(l, margin + cardWidth + 32, mY);
          doc.fillColor(highlight ? primaryColor : textDark).font(fontBold).text(v, margin + cardWidth + 120, mY, { align: 'right', width: cardWidth - 132 });
          doc.font(fontName);
          mY += 13;
        };

        drawGridRow('Tax Rule:', inv.taxType || 'Intra-state');
        drawGridRow('Payment Mode:', inv.paymentMode || 'Cash');
        drawGridRow('Payment Status:', inv.paymentReceived >= inv.totalAmount ? 'PAID' : inv.paymentReceived > 0 ? 'PARTIAL' : 'UNPAID', true);

        yVal += cardHeight + 20;

      } else if (templateStyle === 'Minimal') {
        // Simple stacked columns
        setFont(true, 9.5);
        doc.fillColor(textMuted);
        doc.text('BILLED TO', margin, yVal);
        doc.text('TAX & TERMS', margin + usableWidth * 0.6, yVal, { align: 'right', width: usableWidth * 0.4 });
        
        setFont(true, 13);
        doc.fillColor(secondaryColor);
        doc.text(inv.customer || 'Walking Customer', margin, yVal + 14);

        setFont(false, 10.5);
        doc.fillColor(textMuted);
        let clientY = yVal + 30;
        if (customerParty.phone) {
          doc.text(`Phone: ${customerParty.phone}`, margin, clientY);
          clientY += 13;
        }
        if (customerParty.email) {
          doc.text(`Email: ${customerParty.email}`, margin, clientY);
          clientY += 13;
        }
        if (customerParty.state) {
          doc.text(`State: ${customerParty.state}`, margin, clientY);
        }

        let termsY = yVal + 14;
        const drawMinTerms = (l, v) => {
          doc.fillColor(textMuted).text(l, margin + usableWidth * 0.5, termsY, { width: usableWidth * 0.22 });
          doc.fillColor(secondaryColor).font(fontBold).text(v, margin + usableWidth * 0.72, termsY, { align: 'right', width: usableWidth * 0.28 });
          doc.font(fontName);
          termsY += 13;
        };

        drawMinTerms('Tax Rule:', inv.taxType || 'Intra-state');
        drawMinTerms('Due Duration:', 'Same Day');
        drawMinTerms('Payment Mode:', inv.paymentMode || 'Cash');

        yVal = Math.max(clientY + 15, termsY + 15);
      }

      // 3. Items Table Header
      const colWidths = printSize === 'A5' 
        ? [18, 140, 35, 50, 40, 35, 53] 
        : [25, 200, 50, 70, 55, 45, 70];
      const colNames = ['#', 'Item Description', 'Qty', 'Rate', 'Disc', 'GST', 'Amount'];
      
      const xPositions = [];
      let currentX = margin;
      colWidths.forEach(w => {
        xPositions.push(currentX);
        currentX += w;
      });

      // Draw table header block
      const headerHeight = fSize(22);
      if (templateStyle === 'Classic') {
        doc.rect(margin, yVal, usableWidth, headerHeight).fillColor(primaryColor).fill();
        doc.fillColor('#ffffff');
      } else if (templateStyle === 'Modern') {
        doc.rect(margin, yVal, usableWidth, headerHeight).fillColor(primaryColor).fill();
        doc.fillColor('#ffffff');
      } else if (templateStyle === 'Minimal') {
        // Just bottom teal border
        doc.fillColor(secondaryColor);
      }

      setFont(true, 10);
      colNames.forEach((name, idx) => {
        const align = (idx === 0 || idx === 1) ? 'left' : (idx === 2 ? 'center' : 'right');
        doc.text(name, xPositions[idx] + (idx === 0 || idx === 1 ? 4 : 0), yVal + 5, {
          width: colWidths[idx] - (idx === 0 || idx === 1 ? 4 : 4),
          align: align
        });
      });

      if (templateStyle === 'Minimal') {
        doc.moveTo(margin, yVal + headerHeight).lineTo(margin + usableWidth, yVal + headerHeight).strokeColor(primaryColor).lineWidth(1.5).stroke();
      }
      yVal += headerHeight;

      // 4. Table Rows
      doc.fillColor(textDark);
      if (Array.isArray(inv.items) && inv.items.length) {
        inv.items.forEach((it, idx) => {
          const name = it.name || `Item ${idx+1}`;
          const qty = it.qty || it.quantity || 1;
          const rate = Number(it.rate || it.price || 0);
          const lineDisc = it.discountType === 'flat' ? it.discount : (rate * qty * (it.discount / 100));
          const lineTotal = (qty * rate) - lineDisc;

          // Determine row height by description text wrap
          setFont(false, 9.5);
          const nameHeight = doc.heightOfString(name, { width: colWidths[1] - 8 });
          const rowHeight = Math.max(fSize(24), nameHeight + fSize(12));

          // Draw row background for Modern Template
          if (templateStyle === 'Modern' && idx % 2 === 1) {
            doc.rect(margin, yVal, usableWidth, rowHeight).fillColor('#f8fafc').fill();
            doc.fillColor(textDark);
          }

          // Draw cells
          const drawCell = (val, colIdx, bold = false, textCol = textDark, isSub = false) => {
            setFont(bold, isSub ? 8.5 : 9.5);
            doc.fillColor(textCol);
            const align = (colIdx === 0 || colIdx === 1) ? 'left' : (colIdx === 2 ? 'center' : 'right');
            const cellY = yVal + (rowHeight - nameHeight) / 2;
            doc.text(val, xPositions[colIdx] + (colIdx === 0 || colIdx === 1 ? 6 : 0), cellY, {
              width: colWidths[colIdx] - (colIdx === 0 || colIdx === 1 ? 6 : 6),
              align: align
            });
          };

          drawCell(String(idx + 1), 0);
          
          // Double lines for item description: Name + SKU/Unit
          setFont(true, 9.5);
          const descY = yVal + 5;
          doc.text(name, xPositions[1] + 4, descY, { width: colWidths[1] - 8 });
          setFont(false, 8);
          doc.fillColor(textMuted);
          doc.text(`SKU: ${it.sku || 'N/A'} | Unit: ${it.unit || 'pcs'}`, xPositions[1] + 4, descY + nameHeight - 2);

          drawCell(`${qty} ${it.unit || 'pcs'}`, 2);
          drawCell(fmtCurrency(rate), 3);
          drawCell(it.discount > 0 ? (it.discountType === 'flat' ? fmtCurrency(it.discount) : `${it.discount}%`) : '0%', 4);
          drawCell(`${it.gstRate ?? 18}%`, 5);
          drawCell(fmtCurrency(lineTotal), 6, true);

          // Draw bottom borders
          doc.fillColor(textDark);
          if (templateStyle === 'Classic') {
            doc.moveTo(margin, yVal + rowHeight).lineTo(margin + usableWidth, yVal + rowHeight).strokeColor('#e2e8f0').lineWidth(0.8).stroke();
            // Vertical grid lines
            xPositions.forEach(xPos => {
              doc.moveTo(xPos, yVal).lineTo(xPos, yVal + rowHeight).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
            });
            doc.moveTo(margin + usableWidth, yVal).lineTo(margin + usableWidth, yVal + rowHeight).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
          } else if (templateStyle === 'Minimal') {
            doc.moveTo(margin, yVal + rowHeight).lineTo(margin + usableWidth, yVal + rowHeight).strokeColor('#f1f5f9').lineWidth(0.8).stroke();
          }

          yVal += rowHeight;
        });
      }

      // Close the box for classic table
      if (templateStyle === 'Classic') {
        doc.moveTo(margin, yVal).lineTo(margin + usableWidth, yVal).strokeColor('#cbd5e1').lineWidth(1).stroke();
      }

      yVal += 16;

      // 5. Totals & Notes Section
      const leftColWidth = usableWidth * 0.55;
      const rightColWidth = usableWidth * 0.4;
      const rightColX = margin + usableWidth * 0.6;

      // Left Column content: Notes, Terms, and Signatures
      let leftY = yVal;
      if (inv.notes) {
        setFont(true, 9.5);
        doc.fillColor(templateStyle === 'Minimal' ? primaryColor : secondaryColor);
        doc.text('NOTES / REMARKS', margin, leftY);
        leftY += 13;

        setFont(false, 9);
        doc.fillColor(textDark);
        doc.text(inv.notes, margin, leftY, { width: leftColWidth, lineGap: 2 });
        leftY += doc.heightOfString(inv.notes, { width: leftColWidth }) + 12;
      }

      if (inv.terms) {
        setFont(true, 9.5);
        doc.fillColor(templateStyle === 'Minimal' ? primaryColor : secondaryColor);
        doc.text('TERMS & CONDITIONS', margin, leftY);
        leftY += 13;

        setFont(false, 8.5);
        doc.fillColor(textMuted);
        doc.text(inv.terms, margin, leftY, { width: leftColWidth, lineGap: 2 });
        leftY += doc.heightOfString(inv.terms, { width: leftColWidth }) + 20;
      }

      // Add signatory spacing
      leftY += 10;
      setFont(false, 9);
      doc.fillColor(textMuted);
      doc.moveTo(margin, leftY + fSize(30)).lineTo(margin + leftColWidth * 0.4, leftY + fSize(30)).strokeColor('#cbd5e1').stroke();
      doc.text('Customer Signature', margin, leftY + fSize(34));

      doc.moveTo(margin + leftColWidth * 0.6, leftY + fSize(30)).lineTo(margin + leftColWidth, leftY + fSize(30)).strokeColor('#cbd5e1').stroke();
      doc.text('Authorized Signatory', margin + leftColWidth * 0.6, leftY + fSize(34), { align: 'right', width: leftColWidth * 0.4 });

      // Right Column content: Calculation summary card
      let rightY = yVal;
      if (templateStyle === 'Modern') {
        // Draw card background
        doc.roundedRect(rightColX - 8, rightY - 8, rightColWidth + 16, fSize(190), 8).fillColor('#f8fafc').strokeColor('#e2e8f0').fillAndStroke();
      }

      const drawTotalRow = (label, val, isGrand = false, textCol = textDark) => {
        setFont(isGrand, isGrand ? 12 : 9.5);
        doc.fillColor(textCol);
        doc.text(label, rightColX, rightY, { width: rightColWidth * 0.5 });
        doc.text(val, rightColX + rightColWidth * 0.5, rightY, { width: rightColWidth * 0.5, align: 'right' });
        rightY += isGrand ? 20 : 15;
      };

      drawTotalRow('Subtotal', fmtCurrency(inv.subtotal || 0));
      
      if (inv.discount > 0) {
        const discAmt = inv.overallDiscountType === 'percent' ? (inv.subtotal * (inv.discount / 100)) : inv.discount;
        drawTotalRow(`Overall Discount ${inv.overallDiscountType === 'percent' ? `(${inv.discount}%)` : ''}`, `-${fmtCurrency(discAmt)}`, false, '#ef4444');
      }

      if (inv.additionalCharges > 0) {
        drawTotalRow(`${inv.chargeLabel || 'Delivery'} Charges`, `+${fmtCurrency(inv.additionalCharges)}`);
      }

      const cgst = Number(inv.cgst || 0);
      const sgst = Number(inv.sgst || 0);
      const igst = Number(inv.igst || 0);
      if (cgst > 0) drawTotalRow('  CGST (Central Tax)', fmtCurrency(cgst));
      if (sgst > 0) drawTotalRow('  SGST (State Tax)', fmtCurrency(sgst));
      if (igst > 0) drawTotalRow('  IGST (Integrated Tax)', fmtCurrency(igst));

      const roundOff = Number(inv.roundOff || 0);
      if (roundOff !== 0) {
        drawTotalRow('Round Off', (roundOff > 0 ? '+' : '') + fmtCurrency(roundOff));
      }

      // Divider line
      rightY += 2;
      doc.moveTo(rightColX, rightY).lineTo(rightColX + rightColWidth, rightY).strokeColor('#e2e8f0').lineWidth(1).stroke();
      rightY += 6;

      // Grand Total
      drawTotalRow('Grand Total', fmtCurrency(inv.totalAmount || 0), true, templateStyle === 'Minimal' ? primaryColor : primaryColor);

      rightY += 4;
      drawTotalRow('Payment Mode', inv.paymentMode || 'Cash');
      drawTotalRow('Received Amount', fmtCurrency(inv.paymentReceived || 0), false, '#10b981');
      
      const bal = Number(inv.balanceDue || 0);
      drawTotalRow(bal <= 0 ? 'Change Due' : 'Balance Due', fmtCurrency(Math.abs(bal)), true, bal <= 0 ? '#10b981' : '#ef4444');

      yVal = Math.max(leftY + 60, rightY + 10);
    }

    doc.end();
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

function fmtCurrency(v) {
  return 'Rs. ' + (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
    const todayStr = today.toISOString().substring(0, 10);
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    
    let totalInvoices = 0;
    let totalAmount = 0;
    let totalReceived = 0;
    let overdueCount = 0;
    let totalOverdue = 0;

    invoices.forEach(inv => {
      totalInvoices++;
      const amt = Number(inv.totalAmount || inv.amount || 0);
      const rec = Number(inv.paymentReceived || 0);
      const bal = Math.max(0, inv.balanceDue != null ? Number(inv.balanceDue) : (amt - rec));
      
      totalAmount += amt;
      totalReceived += rec;

      const isPaid = (inv.status === 'Paid' || bal <= 0);
      const isOverdue = !isPaid && inv.dueDate && (inv.dueDate < todayStr);

      if (isOverdue) {
        overdueCount++;
        totalOverdue += bal;
      }

      if (bal > 0) {
        const due = inv.dueDate ? new Date(inv.dueDate) : null;
        if (due) {
          const age = Math.ceil((today - due) / (1000 * 60 * 60 * 24));
          if (age <= 0) {
            // Not past due yet, or due today
            buckets['0-30'] += bal;
          } else if (age <= 30) {
            buckets['0-30'] += bal;
          } else if (age <= 60) {
            buckets['31-60'] += bal;
          } else if (age <= 90) {
            buckets['61-90'] += bal;
          } else {
            buckets['90+'] += bal;
          }
        } else {
          buckets['0-30'] += bal;
        }
      }
    });

    return res.json({
      status: 'success',
      buckets,
      summary: {
        totalInvoices,
        totalAmount,
        totalReceived,
        totalOutstanding: Math.max(0, totalAmount - totalReceived),
        overdueCount,
        totalOverdue
      }
    });
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

function buildProductLookupQuery(username, id) {
  const numId = Number(id);
  const conditions = [{ id: id }, { _id: id }];
  if (!isNaN(numId)) {
    conditions.push({ id: numId });
    conditions.push({ _id: numId });
  }
  if (ObjectId.isValid(id)) {
    try { conditions.push({ _id: new ObjectId(id) }); } catch (e) {}
  }
  return { username, $or: conditions };
}

// ---- Stock Adjustment API ----
async function adjustStock(req, res) {
  const { id } = req.params;
  const { username, qty, reason, batchNumber, serialNumbers } = req.body;
  if (!id || !username || qty == null) return res.status(400).json({ status: 'error', message: 'id, username, qty required' });
  try {
    const db = getDB();
    const delta = Number(qty);
    
    const query = buildProductLookupQuery(username, id);
    const product = await db.collection('products').findOne(query);
    if (!product) return res.status(404).json({ status: 'error', message: 'Product not found' });
    
    await adjustProductBatchStock(db, username, product.name, product.sku, batchNumber, delta, null, serialNumbers);
    
    // log the adjustment
    await db.collection('stock_adjustments').insertOne({
      productId: id, username, qty: delta, reason: reason || 'manual',
      batchNumber: batchNumber || '', timestamp: new Date().toISOString()
    });
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// ---- Stock Transfer API ----
async function transferStock(req, res) {
  const { id } = req.params;
  const { username, qty, fromBranch, toBranch, batchNumber, serialNumbers } = req.body;
  if (!id || !username || !qty || !toBranch) return res.status(400).json({ status: 'error', message: 'id, username, qty, toBranch required' });
  try {
    const db = getDB();
    const transferQty = Number(qty);

    // Get the source product
    const query = buildProductLookupQuery(username, id);
    const sourceProduct = await db.collection('products').findOne(query);
    if (!sourceProduct) return res.status(404).json({ status: 'error', message: 'Source product not found' });

    // Decrease stock in source product batch (or root if no batch)
    await adjustProductBatchStock(db, username, sourceProduct.name, sourceProduct.sku, batchNumber, -transferQty, null, serialNumbers);

    // Try to find the matching product in the target godown
    const targetProduct = await db.collection('products').findOne({
      username,
      sku: sourceProduct.sku,
      godownName: toBranch
    });

    const srcBatch = Array.isArray(sourceProduct.batches) ? sourceProduct.batches.find(b => b.batchNumber === batchNumber) : null;

    if (targetProduct) {
      // Increment stock in target product
      await adjustProductBatchStock(db, username, targetProduct.name, targetProduct.sku, batchNumber, transferQty, srcBatch, serialNumbers);
    } else {
      // Create a new product doc for the target branch
      const maxProd = await db.collection('products').find({ username }).sort({ id: -1 }).limit(1).toArray();
      const newId = (maxProd[0]?.id || 0) + 1;
      const { _id, ...newProdDetails } = sourceProduct;
      
      let newBatches = [];
      if (batchNumber) {
        newBatches = [{
          batchNumber,
          mfgDate: srcBatch?.mfgDate || null,
          expiryDate: srcBatch?.expiryDate || null,
          stock: transferQty,
          purchasePrice: srcBatch?.purchasePrice || sourceProduct.purchasePrice || 0,
          sellingPrice: srcBatch?.sellingPrice || sourceProduct.price || 0
        }];
      }

      const newProductDoc = {
        ...newProdDetails,
        id: newId,
        godownName: toBranch,
        stock: transferQty,
        batches: newBatches,
        serialNumbers: serialNumbers || [],
        hasSerialTracking: sourceProduct.hasSerialTracking || false,
        active: true
      };
      await db.collection('products').insertOne(newProductDoc);
    }

    // Log the transfer
    await db.collection('stock_transfers').insertOne({
      productId: id, username, qty: transferQty,
      fromBranch: fromBranch || 'Main Warehouse', toBranch,
      batchNumber: batchNumber || '',
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
    const purchases = await db.collection('purchases').find({ username, active: { $ne: false } }).toArray();
    const toNumber = v => Number(v) || 0;
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - 6);

    const getAmount = (p) => {
      const type = p.purchaseType || 'Purchase Invoice';
      if (type === 'Purchase Order') return 0;
      if (type === 'Purchase Return' || type === 'Debit Note') return -toNumber(p.amount);
      return toNumber(p.amount);
    };

    const totalPurchases = purchases.reduce((s, p) => s + getAmount(p), 0);
    const monthPurchases = purchases.filter(p => new Date(p.date) >= startOfMonth).reduce((s, p) => s + getAmount(p), 0);
    const weekPurchases = purchases.filter(p => new Date(p.date) >= startOfWeek).reduce((s, p) => s + getAmount(p), 0);
    const pendingDues = purchases.filter(p => (p.status || '').toLowerCase() === 'pending').reduce((s, p) => s + getAmount(p), 0);
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
      supplierMap[name] = (supplierMap[name] || 0) + getAmount(p);
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

// Edit a party (customer/supplier)
async function editParty(req, res) {
  const { id } = req.params;
  const data = req.body;
  if (!id) return res.status(400).json({ status: 'error', message: 'Party ID required' });
  if (!data || !data.username) return res.status(400).json({ status: 'error', message: 'Username required' });
  try {
    const db = getDB();
    const query = { username: data.username };
    if (ObjectId.isValid(id)) {
      query._id = new ObjectId(id);
    } else {
      query.id = Number(id) || id;
    }
    const oldParty = await db.collection('parties').findOne(query);

    // Strip ID and username fields from updates to avoid immutable field errors in Mongo
    const { _id, id: tempId, username, ...updates } = data;
    await db.collection('parties').updateOne(query, { $set: updates });

    // Auto-sync customer/supplier ledger to Accountant
    try {
      if (oldParty) {
        if ((oldParty.type || '').toLowerCase() === 'customer') {
          const acctCustomer = await Customer.findOne({ name: oldParty.name });
          if (acctCustomer) {
            acctCustomer.name = updates.name !== undefined ? updates.name : acctCustomer.name;
            acctCustomer.email = updates.email !== undefined ? updates.email : acctCustomer.email;
            acctCustomer.phone = updates.phone !== undefined ? updates.phone : acctCustomer.phone;
            acctCustomer.address = (updates.billingAddress || updates.address) !== undefined
              ? (updates.billingAddress || updates.address || '')
              : acctCustomer.address;
            if (updates.balance !== undefined) {
              acctCustomer.openingBalance = Number(updates.balance) || 0;
            }
            await acctCustomer.save();
          }
        } else if ((oldParty.type || '').toLowerCase() === 'supplier') {
          const acctLedger = await Ledger.findOne({ name: oldParty.name, type: 'liability' });
          if (acctLedger) {
            acctLedger.name = updates.name !== undefined ? updates.name : acctLedger.name;
            if (updates.balance !== undefined) {
              acctLedger.balance = Number(updates.balance) || 0;
            }
            await acctLedger.save();
          }
        }
      }
    } catch (acctErr) {
      console.error('Accountant party edit sync failed:', acctErr.message || acctErr);
    }

    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Delete a party (customer/supplier)
async function deleteParty(req, res) {
  const { id } = req.params;
  const { username } = req.query;
  if (!id) return res.status(400).json({ status: 'error', message: 'Party ID required' });
  if (!username) return res.status(400).json({ status: 'error', message: 'Username required' });
  try {
    const db = getDB();
    const query = { username };
    if (ObjectId.isValid(id)) {
      query._id = new ObjectId(id);
    } else {
      query.id = Number(id) || id;
    }
    const oldParty = await db.collection('parties').findOne(query);
    await db.collection('parties').deleteOne(query);

    // Auto-sync customer/supplier ledger delete to Accountant
    try {
      if (oldParty) {
        if ((oldParty.type || '').toLowerCase() === 'customer') {
          await Customer.deleteOne({ name: oldParty.name });
        } else if ((oldParty.type || '').toLowerCase() === 'supplier') {
          await Ledger.deleteOne({ name: oldParty.name, type: 'liability' });
        }
      }
    } catch (acctErr) {
      console.error('Accountant party delete sync failed:', acctErr.message || acctErr);
    }

    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Send a payment reminder to a party (customer/supplier)
async function sendPartyReminder(req, res) {
  const { id } = req.params;
  const { username, type, message } = req.body;
  if (!id || !username || !type) {
    return res.status(400).json({ status: 'error', message: 'id, username, and type are required' });
  }
  try {
    const db = getDB();
    const query = { username };
    if (ObjectId.isValid(id)) {
      query._id = new ObjectId(id);
    } else {
      query.id = Number(id) || id;
    }
    const party = await db.collection('parties').findOne(query);
    if (!party) return res.status(404).json({ status: 'error', message: 'Party not found' });

    const settings = await db.collection('settings').findOne({ username }) || {};
    const businessName = settings.businessName || 'Our Business';

    let result = null;
    if (type === 'email') {
      if (!party.email) return res.status(400).json({ status: 'error', message: 'Party email address not found' });
      const emailSubject = `Payment Reminder from ${businessName}`;
      const emailHtml = `<p>Dear ${party.name},</p><p>${message}</p><p>Regards,<br/><strong>${businessName}</strong></p>`;
      const { sendEmail } = require('../utils/notifyAdapters');
      result = await sendEmail(party.email, emailSubject, emailHtml);
    } else if (type === 'sms') {
      if (!party.phone) return res.status(400).json({ status: 'error', message: 'Party phone number not found' });
      const { sendSMS } = require('../utils/notifyAdapters');
      result = await sendSMS(party.phone, message);
    } else if (type === 'whatsapp') {
      const whatsappNo = party.whatsappNumber || party.phone;
      if (!whatsappNo) return res.status(400).json({ status: 'error', message: 'Party WhatsApp/phone number not found' });
      const { sendWhatsApp } = require('../utils/notifyAdapters');
      result = await sendWhatsApp(whatsappNo, message);
    } else {
      return res.status(400).json({ status: 'error', message: 'Invalid reminder type' });
    }

    // Log in notifications audit
    const { sendInApp } = require('../utils/notifyAdapters');
    await sendInApp(username, `Reminder Sent`, `Sent ${type} reminder to ${party.name}`, { partyId: id, type });

    return res.json({ status: 'success', result });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Bulk import parties (customers/suppliers)
async function bulkImportParties(req, res) {
  const { username, parties } = req.body;
  if (!username || !Array.isArray(parties)) {
    return res.status(400).json({ status: 'error', message: 'username and parties[] required' });
  }
  try {
    const db = getDB();
    const maxParties = await db.collection('parties').find({ username }).sort({ id: -1 }).limit(1).toArray();
    let currentId = (maxParties[0]?.id || 0);

    const docs = parties.map(p => {
      currentId++;
      const openingBal = Number(p.openingBalance) || 0;
      return {
        id: currentId,
        username,
        name: p.name || '',
        type: p.type || 'Customer',
        phone: p.phone || '',
        email: p.email || '',
        whatsappNumber: p.whatsappNumber || '',
        billingAddress: p.billingAddress || '',
        shippingAddress: p.shippingAddress || '',
        state: p.state || 'Karnataka',
        gstin: p.gstin || '',
        pan: p.pan || '',
        customerGroup: p.customerGroup || 'Retail',
        creditLimit: Number(p.creditLimit) || 0,
        paymentTerms: p.paymentTerms || 'Net 30',
        openingBalance: openingBal,
        balance: openingBal,
        bankDetails: p.bankDetails || '',
        notes: p.notes || '',
        lastTxn: new Date().toISOString().substring(0, 10)
      };
    });

    if (docs.length) {
      await db.collection('parties').insertMany(docs);
    }
    return res.json({ status: 'success', inserted: docs.length });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports.adjustStock = adjustStock;
module.exports.transferStock = transferStock;
module.exports.purchaseReport = purchaseReport;
module.exports.editParty = editParty;
module.exports.deleteParty = deleteParty;
module.exports.sendPartyReminder = sendPartyReminder;
module.exports.bulkImportParties = bulkImportParties;

