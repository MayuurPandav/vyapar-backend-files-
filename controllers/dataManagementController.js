const { getDB } = require('../config/db');
const { parse } = require('json2csv');
const { ObjectId } = require('mongodb');

// Generic helper to send CSV
function sendCsv(res, filename, data, fields) {
  try {
    const csv = parse(data, { fields });
    res.header('Content-Type', 'text/csv');
    res.attachment(filename);
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to generate CSV' });
  }
}

// Data Export
async function exportData(req, res) {
  try {
    const { type } = req.params;
    const { shopUsername } = req.query;
    const db = getDB();
    
    let query = {};
    if (shopUsername) query.username = shopUsername;

    switch (type) {
      case 'shops': {
        const shops = await db.collection('users').find({ role: 'shop_owner' }).toArray();
        return sendCsv(res, 'shops.csv', shops, ['username', 'name', 'phone', 'email', 'createdAt', 'status']);
      }
      case 'invoices': {
        const invoices = await db.collection('sales').find(query).toArray();
        const mappedInvoices = invoices.map(item => ({
          invoiceNo: item.invoiceNo || item.invoiceNumber || item.id || '',
          username: item.username || '',
          date: item.date || '',
          customerName: item.customerName || item.customer || 'Walk-in',
          total: item.total !== undefined ? item.total : (item.amount || 0),
          paymentStatus: item.paymentStatus || item.status || 'Unpaid'
        }));
        return sendCsv(res, 'invoices.csv', mappedInvoices, ['invoiceNo', 'username', 'date', 'customerName', 'total', 'paymentStatus']);
      }
      case 'inventory': {
        const inventory = await db.collection('products').find(query).toArray();
        return sendCsv(res, 'inventory.csv', inventory, ['name', 'barcode', 'username', 'category', 'stock', 'price', 'purchasePrice']);
      }
      case 'transactions': {
        const txns = await db.collection('transactions').find(query).toArray();
        const mappedTxns = txns.map(item => {
          // Determine amount: outflow (Purchase, Payment Pay) is negative, inflow is positive
          const typeLower = (item.type || '').toLowerCase();
          const magnitude = item.credit > 0 ? item.credit : (item.debit > 0 ? item.debit : 0);
          const isOutflow = typeLower.includes('purchase') || typeLower === 'payment pay' || typeLower === 'payment paid' || typeLower.includes('expense');
          const amt = isOutflow ? -magnitude : magnitude;
          
          // Determine description from party
          const desc = item.party || '';
          
          // Determine paymentMode from debitAccount / creditAccount
          let pm = '';
          const accounts = `${item.debitAccount || ''} ${item.creditAccount || ''}`.toLowerCase();
          if (accounts.includes('cash')) pm = 'Cash';
          else if (accounts.includes('upi')) pm = 'UPI';
          else if (accounts.includes('card')) pm = 'Card';
          else if (accounts.includes('bank')) pm = 'Bank Transfer';
          else pm = item.debitAccount || item.creditAccount || 'Other';

          return {
            type: item.type || '',
            username: item.username || '',
            amount: amt,
            date: item.date || '',
            description: desc,
            paymentMode: pm
          };
        });
        return sendCsv(res, 'transactions.csv', mappedTxns, ['type', 'username', 'amount', 'date', 'description', 'paymentMode']);
      }
      case 'gst': {
        const sales = await db.collection('sales').find({ ...query, $or: [ { totalGST: { $gt: 0 } }, { cgst: { $gt: 0 } }, { sgst: { $gt: 0 } }, { igst: { $gt: 0 } } ] }).toArray();
        const mappedSales = sales.map(item => ({
          invoiceNo: item.invoiceNo || item.invoiceNumber || item.id || '',
          username: item.username || '',
          date: item.date || '',
          customerName: item.customerName || item.customer || 'Walk-in',
          customerGST: item.customerGST || item.customerGstin || item.gstin || '',
          totalGST: item.totalGST !== undefined ? item.totalGST : (item.cgst + item.sgst + item.igst || 0),
          total: item.total !== undefined ? item.total : (item.amount || 0)
        }));
        return sendCsv(res, 'gst_data.csv', mappedSales, ['invoiceNo', 'username', 'date', 'customerName', 'customerGST', 'totalGST', 'total']);
      }
      case 'parties': {
        const parties = await db.collection('parties').find(query).toArray();
        const mappedParties = parties.map(item => ({
          name: item.name || '',
          type: item.type || '',
          username: item.username || '',
          phone: item.phone || '',
          gst: item.gst || item.gstin || '',
          balance: item.balance !== undefined ? item.balance : 0
        }));
        return sendCsv(res, 'parties.csv', mappedParties, ['name', 'type', 'username', 'phone', 'gst', 'balance']);
      }
      case 'deliveries': {
        const deliveries = await db.collection('deliveries').find(query).toArray();
        return sendCsv(res, 'deliveries.csv', deliveries, ['orderId', 'username', 'driverName', 'status', 'customerName', 'address']);
      }
      default:
        return res.status(400).json({ status: 'error', message: 'Invalid export type' });
    }
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// DB Health
async function getDbHealth(req, res) {
  try {
    const db = getDB();
    const stats = await db.command({ dbStats: 1 });
    
    // Approximate collection stats
    const collections = ['users', 'products', 'sales', 'purchases', 'transactions'];
    const collectionStats = [];
    for (const c of collections) {
      const count = await db.collection(c).countDocuments();
      collectionStats.push({ name: c, count });
    }

    return res.json({
      status: 'success',
      stats: {
        dbName: stats.db,
        collections: stats.collections,
        objects: stats.objects,
        dataSizeMB: (stats.dataSize / (1024 * 1024)).toFixed(2),
        storageSizeMB: (stats.storageSize / (1024 * 1024)).toFixed(2),
        collectionStats
      }
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Data Purge
async function purgeData(req, res) {
  try {
    const { shopUsername } = req.body;
    if (!shopUsername) return res.status(400).json({ status: 'error', message: 'Shop username required' });

    const db = getDB();
    
    // Move to sa_archived_data first for safety
    const sales = await db.collection('sales').find({ username: shopUsername }).toArray();
    if (sales.length > 0) {
      await db.collection('sa_archived_data').insertMany(sales.map(s => ({ ...s, _archivedAt: new Date(), _originalCollection: 'sales' })));
      await db.collection('sales').deleteMany({ username: shopUsername });
    }

    await db.collection('sa_audit').insertOne({
      username: req.user?.username || 'superadmin',
      action: 'DATA_PURGE',
      details: `Purged sales data for shop ${shopUsername}`,
      timestamp: new Date()
    });

    return res.json({ status: 'success', message: `Data purged for shop ${shopUsername}` });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function aggregateTenantData(db, username) {
  const collections = [
    'products', 'sales', 'invoices', 'purchases', 'parties', 
    'transactions', 'expenses', 'offers', 'accounts', 
    'bankAccounts', 'cheques', 'deliveries', 'custom_reports', 
    'report_schedules', 'notification_configs', 'staff', 'staff_attendance'
  ];
  const data = {};
  for (const coll of collections) {
    data[coll] = await db.collection(coll).find({ username }).project({ _id: 0 }).toArray();
  }
  data.settings = await db.collection('settings').findOne({ username }, { projection: { _id: 0 } }) || {};
  return data;
}

async function restoreTenantData(db, username, data) {
  const collections = [
    'products', 'sales', 'invoices', 'purchases', 'parties', 
    'transactions', 'expenses', 'offers', 'accounts', 
    'bankAccounts', 'cheques', 'deliveries', 'custom_reports', 
    'report_schedules', 'notification_configs', 'staff', 'staff_attendance'
  ];
  for (const coll of collections) {
    await db.collection(coll).deleteMany({ username });
    if (data[coll] && data[coll].length) {
      const docs = data[coll].map(doc => {
        const d = { ...doc };
        d.username = username;
        delete d._id;
        return d;
      });
      await db.collection(coll).insertMany(docs);
    }
  }
  if (data.settings) {
    const existingSettings = await db.collection('settings').findOne({ username }) || {};
    const settingsUpdate = { ...data.settings };
    delete settingsUpdate._id;
    await db.collection('settings').updateOne(
      { username },
      {
        $set: {
          ...settingsUpdate,
          username,
          subscriptionExpiry: existingSettings.subscriptionExpiry || settingsUpdate.subscriptionExpiry,
          planName: existingSettings.planName || settingsUpdate.planName,
          planCycle: existingSettings.planCycle || settingsUpdate.planCycle
        }
      },
      { upsert: true }
    );
  }
}

async function getTenantBackups(req, res) {
  try {
    const username = req.query.username || (req.user && req.user.username);
    if (!username) return res.status(400).json({ status: 'error', message: 'Username required' });
    const db = getDB();
    const backups = await db.collection('db_backups')
      .find({ username })
      .project({ data: 0 })
      .sort({ createdAt: -1 })
      .toArray();
    return res.json({ status: 'success', backups });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getSingleTenantBackup(req, res) {
  try {
    const { backupId } = req.params;
    const username = req.query.username || (req.user && req.user.username);
    if (!username || !backupId) return res.status(400).json({ status: 'error', message: 'Username and backupId required' });
    const db = getDB();
    const backup = await db.collection('db_backups').findOne({ username, backupId });
    if (!backup) return res.status(404).json({ status: 'error', message: 'Backup not found' });
    return res.json({ status: 'success', backup });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function createTenantBackup(req, res) {
  try {
    const username = req.body.username || (req.user && req.user.username);
    const type = req.body.type || 'manual';
    if (!username) return res.status(400).json({ status: 'error', message: 'Username required' });
    
    const db = getDB();
    const data = await aggregateTenantData(db, username);
    const backupId = `BKP-${Date.now()}`;
    
    await db.collection('db_backups').insertOne({
      username,
      backupId,
      type,
      data,
      createdAt: new Date(),
      status: 'success'
    });
    
    return res.json({ status: 'success', backupId });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function restoreTenantBackup(req, res) {
  try {
    const username = req.body.username || (req.user && req.user.username);
    const { backupId } = req.body;
    if (!username || !backupId) return res.status(400).json({ status: 'error', message: 'Username and backupId required' });
    
    const db = getDB();
    const backup = await db.collection('db_backups').findOne({ username, backupId });
    if (!backup) return res.status(404).json({ status: 'error', message: 'Backup not found' });
    
    await restoreTenantData(db, username, backup.data);
    return res.json({ status: 'success', message: 'Backup restored successfully' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function deleteTenantBackup(req, res) {
  try {
    const { backupId } = req.params;
    const username = req.query.username || (req.user && req.user.username);
    if (!username || !backupId) return res.status(400).json({ status: 'error', message: 'Username and backupId required' });
    
    const db = getDB();
    const result = await db.collection('db_backups').deleteOne({ username, backupId });
    if (result.deletedCount === 0) return res.status(404).json({ status: 'error', message: 'Backup not found' });
    return res.json({ status: 'success', message: 'Backup deleted successfully' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function saveBackupConfig(req, res) {
  try {
    const username = req.body.username || (req.user && req.user.username);
    const { backupConfig } = req.body;
    if (!username || !backupConfig) return res.status(400).json({ status: 'error', message: 'Username and backupConfig required' });
    
    const db = getDB();
    const existingSettings = await db.collection('settings').findOne({ username }) || {};
    const updatedConfig = {
      enabled: backupConfig.enabled === true || backupConfig.enabled === 'true',
      schedule: backupConfig.schedule || 'daily',
      email: backupConfig.email || '',
      lastBackupAt: existingSettings.backupConfig?.lastBackupAt || null
    };
    
    await db.collection('settings').updateOne(
      { username },
      { $set: { backupConfig: updatedConfig } },
      { upsert: true }
    );
    
    return res.json({ status: 'success', backupConfig: updatedConfig });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getBackupConfig(req, res) {
  try {
    const username = req.query.username || (req.user && req.user.username);
    if (!username) return res.status(400).json({ status: 'error', message: 'Username required' });
    
    const db = getDB();
    const settings = await db.collection('settings').findOne({ username });
    const config = settings?.backupConfig || { enabled: false, schedule: 'daily', email: '' };
    return res.json({ status: 'success', backupConfig: config });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function exportTenantData(req, res) {
  try {
    const { type } = req.params;
    const username = req.query.username || (req.user && req.user.username);
    const format = (req.query.format || 'csv').toLowerCase();
    
    if (!username) return res.status(400).json({ status: 'error', message: 'Username required' });
    const db = getDB();
    
    let query = { username };
    let data = [];
    let columns = [];
    let filename = `export-${type}-${Date.now()}`;
    
    switch (type) {
      case 'invoices':
        data = await db.collection('invoices').find(query).limit(1000).toArray();
        if (data.length === 0) {
          data = await db.collection('sales').find(query).limit(1000).toArray();
        }
        columns = [
          { header: 'Invoice #', key: 'invoiceNumber', width: 100 },
          { header: 'Date', key: 'date', width: 90 },
          { header: 'Customer', key: 'customer', width: 140 },
          { header: 'Amount', key: 'amount', width: 90 },
          { header: 'Status', key: 'status', width: 90 }
        ];
        data = data.map(item => ({
          invoiceNumber: item.invoiceNumber || item.invoiceNo || item.id || '',
          date: item.date || '',
          customer: item.customer || item.customerName || '',
          amount: item.amount !== undefined ? item.amount : (item.total || 0),
          status: item.status || item.paymentStatus || 'Unpaid'
        }));
        break;
        
      case 'inventory':
        data = await db.collection('products').find(query).limit(1000).toArray();
        columns = [
          { header: 'Product Name', key: 'name', width: 160 },
          { header: 'SKU/Barcode', key: 'sku', width: 110 },
          { header: 'Stock', key: 'stock', width: 70 },
          { header: 'Sales Price', key: 'price', width: 90 },
          { header: 'Purchase Price', key: 'purchasePrice', width: 90 }
        ];
        data = data.map(item => ({
          name: item.name || '',
          sku: item.sku || item.barcode || '',
          stock: item.stock !== undefined ? item.stock : 0,
          price: item.price !== undefined ? item.price : 0,
          purchasePrice: item.purchasePrice !== undefined ? item.purchasePrice : 0
        }));
        break;
        
      case 'transactions':
        data = await db.collection('transactions').find(query).limit(1000).toArray();
        columns = [
          { header: 'Date', key: 'date', width: 90 },
          { header: 'Type', key: 'type', width: 110 },
          { header: 'Party', key: 'party', width: 120 },
          { header: 'Debit', key: 'debit', width: 70 },
          { header: 'Credit', key: 'credit', width: 70 },
          { header: 'Balance', key: 'balance', width: 70 }
        ];
        data = data.map(item => ({
          date: item.date || '',
          type: item.type || '',
          party: item.party || '',
          debit: item.debit !== undefined ? item.debit : 0,
          credit: item.credit !== undefined ? item.credit : 0,
          balance: item.balance !== undefined ? item.balance : 0
        }));
        break;
        
      case 'gst':
        data = await db.collection('sales').find({ ...query, $or: [ { totalGST: { $gt: 0 } }, { cgst: { $gt: 0 } }, { sgst: { $gt: 0 } }, { igst: { $gt: 0 } } ] }).limit(1000).toArray();
        if (data.length === 0) {
          data = await db.collection('invoices').find({ ...query, $or: [ { taxAmount: { $gt: 0 } }, { cgst: { $gt: 0 } }, { sgst: { $gt: 0 } }, { igst: { $gt: 0 } } ] }).limit(1000).toArray();
        }
        columns = [
          { header: 'Invoice #', key: 'invoiceNumber', width: 90 },
          { header: 'Date', key: 'date', width: 80 },
          { header: 'Customer', key: 'customer', width: 110 },
          { header: 'CGST', key: 'cgst', width: 60 },
          { header: 'SGST', key: 'sgst', width: 60 },
          { header: 'IGST', key: 'igst', width: 60 },
          { header: 'Amount', key: 'amount', width: 70 }
        ];
        data = data.map(item => ({
          invoiceNumber: item.invoiceNumber || item.invoiceNo || item.id || '',
          date: item.date || '',
          customer: item.customer || item.customerName || '',
          cgst: item.cgst !== undefined ? item.cgst : 0,
          sgst: item.sgst !== undefined ? item.sgst : 0,
          igst: item.igst !== undefined ? item.igst : 0,
          amount: item.amount !== undefined ? item.amount : (item.total || 0)
        }));
        break;
        
      case 'parties':
        data = await db.collection('parties').find(query).limit(1000).toArray();
        columns = [
          { header: 'Name', key: 'name', width: 140 },
          { header: 'Type', key: 'type', width: 90 },
          { header: 'Phone', key: 'phone', width: 100 },
          { header: 'GSTIN', key: 'gstin', width: 110 },
          { header: 'Balance', key: 'balance', width: 80 }
        ];
        data = data.map(item => ({
          name: item.name || '',
          type: item.type || '',
          phone: item.phone || '',
          gstin: item.gstin || '',
          balance: item.balance !== undefined ? item.balance : 0
        }));
        break;
        
      case 'deliveries':
        data = await db.collection('deliveries').find(query).limit(1000).toArray();
        columns = [
          { header: 'Order ID', key: 'orderId', width: 110 },
          { header: 'Driver', key: 'driverName', width: 110 },
          { header: 'Customer', key: 'customerName', width: 110 },
          { header: 'Status', key: 'status', width: 80 },
          { header: 'Address', key: 'address', width: 110 }
        ];
        data = data.map(item => ({
          orderId: item.orderId || '',
          driverName: item.driverName || '',
          customerName: item.customerName || '',
          status: item.status || '',
          address: item.address || ''
        }));
        break;
        
      default:
        return res.status(400).json({ status: 'error', message: 'Invalid export type' });
    }
    
    if (format === 'csv') {
      const csv = parse(data, { fields: columns.map(c => c.key) });
      res.header('Content-Type', 'text/csv');
      res.attachment(`${filename}.csv`);
      return res.send(csv);
      
    } else if (format === 'excel') {
      const headerLine = columns.map(c => c.header).join('\t');
      const rows = data.map(row => 
        columns.map(col => {
          let val = row[col.key];
          if (val === undefined || val === null) return '';
          if (typeof val === 'object') val = JSON.stringify(val);
          return String(val).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
        }).join('\t')
      );
      const excelText = [headerLine, ...rows].join('\r\n');
      res.header('Content-Type', 'application/vnd.ms-excel');
      res.attachment(`${filename}.xls`);
      return res.send(excelText);
      
    } else if (format === 'pdf') {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 40 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.pdf`);
      doc.pipe(res);
      
      doc.fontSize(18).font('Helvetica-Bold').text(`Vypar 2.0 - ${type.toUpperCase()} Report`, { align: 'center' });
      doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.text(`Tenant: ${username} | Total Records: ${data.length}`, { align: 'center' });
      doc.moveDown(1.5);
      
      let y = doc.y;
      let x = 40;
      columns.forEach(col => {
        doc.fontSize(9).font('Helvetica-Bold').text(col.header, x, y, { width: col.width });
        x += col.width;
      });
      
      doc.moveTo(40, y + 15).lineTo(550, y + 15).stroke();
      y += 20;
      
      data.forEach(item => {
        if (y > 750) {
          doc.addPage();
          y = 40;
          let xH = 40;
          columns.forEach(col => {
            doc.fontSize(9).font('Helvetica-Bold').text(col.header, xH, y, { width: col.width });
            xH += col.width;
          });
          doc.moveTo(40, y + 15).lineTo(550, y + 15).stroke();
          y += 20;
        }
        
        let xVal = 40;
        columns.forEach(col => {
          let val = item[col.key];
          if (val === undefined || val === null) val = '';
          doc.fontSize(8).font('Helvetica').text(String(val), xVal, y, { width: col.width, height: 16, ellipsis: true });
          xVal += col.width;
        });
        y += 16;
      });
      
      doc.end();
      return;
    } else {
      return res.status(400).json({ status: 'error', message: 'Invalid format' });
    }
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getTenantStorageUsage(req, res) {
  try {
    const username = req.query.username || (req.user && req.user.username);
    if (!username) return res.status(400).json({ status: 'error', message: 'Username required' });
    
    const db = getDB();
    const collections = [
      { name: 'products', label: 'Products Inventory' },
      { name: 'sales', label: 'Sales Records' },
      { name: 'invoices', label: 'Sales Invoices' },
      { name: 'purchases', label: 'Purchase Invoices' },
      { name: 'parties', label: 'Parties Directory' },
      { name: 'transactions', label: 'Ledger Transactions' },
      { name: 'expenses', label: 'Expense Records' },
      { name: 'deliveries', label: 'Logistics Deliveries' },
      { name: 'db_backups', label: 'Database Backups' },
      { name: 'staff', label: 'Staff Directory' }
    ];
    
    const usage = [];
    for (const coll of collections) {
      const count = await db.collection(coll.name).countDocuments({ username });
      usage.push({ name: coll.name, label: coll.label, count });
    }
    
    return res.json({ status: 'success', usage });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function purgeTenantData(req, res) {
  try {
    const username = req.body.username || (req.user && req.user.username);
    const { targetType } = req.body;
    
    if (!username || !targetType) {
      return res.status(400).json({ status: 'error', message: 'Username and targetType required' });
    }
    
    const db = getDB();
    let collectionsToPurge = [];
    
    switch (targetType) {
      case 'invoices_transactions':
        collectionsToPurge = ['sales', 'invoices', 'transactions', 'cheques'];
        break;
      case 'inventory':
        collectionsToPurge = ['products'];
        break;
      case 'parties':
        collectionsToPurge = ['parties'];
        break;
      case 'backups':
        collectionsToPurge = ['db_backups'];
        break;
      case 'all':
        collectionsToPurge = [
          'products', 'sales', 'invoices', 'purchases', 'parties', 
          'transactions', 'expenses', 'offers', 'accounts', 
          'bankAccounts', 'cheques', 'deliveries', 'custom_reports', 
          'report_schedules', 'notification_configs', 'staff', 'staff_attendance', 'db_backups'
        ];
        break;
      default:
        return res.status(400).json({ status: 'error', message: 'Invalid purge target type' });
    }
    
    for (const coll of collectionsToPurge) {
      const docs = await db.collection(coll).find({ username }).toArray();
      if (docs.length > 0) {
        const archivedDocs = docs.map(d => {
          const docCopy = { ...d };
          docCopy._archivedAt = new Date();
          docCopy._originalCollection = coll;
          return docCopy;
        });
        await db.collection('sa_archived_data').insertMany(archivedDocs);
        await db.collection(coll).deleteMany({ username });
      }
    }
    
    await db.collection('sa_audit').insertOne({
      username,
      action: 'TENANT_DATA_PURGE',
      details: `Tenant ${username} purged data for target type: ${targetType}`,
      timestamp: new Date()
    });
    
    return res.json({ status: 'success', message: `Data purged successfully for ${targetType}` });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  exportData,
  getDbHealth,
  purgeData,
  getTenantBackups,
  getSingleTenantBackup,
  createTenantBackup,
  restoreTenantBackup,
  deleteTenantBackup,
  saveBackupConfig,
  getBackupConfig,
  exportTenantData,
  aggregateTenantData,
  restoreTenantData,
  getTenantStorageUsage,
  purgeTenantData
};
