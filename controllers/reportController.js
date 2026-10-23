const { getDB } = require('../config/db');
const { parse } = require('json2csv');

// Dynamically generate report data based on type
async function generateReportData(db, type, startDate, endDate) {
  const query = {};
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Use 'date' instead of 'createdAt' for collections like sales
  const dateQuery = {};
  if (startDate || endDate) {
    dateQuery.date = {};
    if (startDate) dateQuery.date.$gte = startDate.includes('T') ? startDate.split('T')[0] : startDate;
    if (endDate) dateQuery.date.$lte = endDate.includes('T') ? endDate.split('T')[0] : endDate;
  }

  switch (type) {
    case 'shop_growth':
      return await db.collection('users').find({ role: 'admin', ...query }).toArray();
    case 'revenue':
      return await db.collection('sa_payments').find({ ...query }).toArray();
    case 'users':
      return await db.collection('users').find({ ...query }).toArray();
    case 'invoices':
      return await db.collection('sales').find({ ...dateQuery }).toArray();
    case 'purchases':
      return await db.collection('purchases').find({ ...dateQuery }).toArray();
    case 'inventory':
      // Inventory usually doesn't filter by date created for current snapshot, 
      // but we apply it if they want items created in that range.
      return await db.collection('products').find({ ...query }).toArray();
    case 'gst':
      return await db.collection('sales').find({
        ...dateQuery,
        $or: [
          { cgst: { $gt: 0 } },
          { sgst: { $gt: 0 } },
          { igst: { $gt: 0 } },
          { totalTax: { $gt: 0 } },
          { taxAmount: { $gt: 0 } }
        ]
      }).toArray();
    case 'payments':
      return await db.collection('transactions').find({
        ...dateQuery,
        type: { $in: ['Payment Receive', 'Sale'] }
      }).toArray();
    case 'expenses':
      return await db.collection('expenses').find({ ...dateQuery }).toArray();
    case 'deliveries':
      return await db.collection('deliveries').find({ ...query }).toArray();
    case 'offers':
      return await db.collection('offers').find({ ...query }).toArray();
    case 'support':
      return await db.collection('sa_tickets').find({ ...query }).toArray();
    default:
      return [];
  }
}

async function getReport(req, res) {
  try {
    const { type, startDate, endDate } = req.query;
    if (!type) return res.status(400).json({ status: 'error', message: 'Report type is required' });

    const db = getDB();
    const data = await generateReportData(db, type, startDate, endDate);

    // Aggregate some basic stats for the dashboard view
    const stats = {
      totalRecords: data.length,
      generatedAt: new Date()
    };

    if (type === 'revenue' || type === 'invoices' || type === 'purchases') {
      stats.totalValue = data.reduce((sum, item) => sum + (Number(item.total || item.amount || 0)), 0);
    }

    return res.json({ status: 'success', stats, sampleData: data.slice(0, 100) });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function exportReport(req, res) {
  try {
    const { type, startDate, endDate } = req.query;
    if (!type) return res.status(400).json({ status: 'error', message: 'Report type is required' });

    const db = getDB();
    const data = await generateReportData(db, type, startDate, endDate);

    if (!data.length) {
      return res.status(404).json({ status: 'error', message: 'No data found for this report.' });
    }

    const fields = Object.keys(data[0]).filter(k => k !== '_id');
    const csv = parse(data, { fields });

    res.header('Content-Type', 'text/csv');
    res.attachment(`report_${type}_${new Date().getTime()}.csv`);
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Auto report config
async function saveReportConfig(req, res) {
  try {
    const db = getDB();
    const payload = req.body;
    await db.collection('sa_config').updateOne(
      { type: 'auto_reports' },
      { $set: { ...payload, updatedAt: new Date() } },
      { upsert: true }
    );
    return res.json({ status: 'success', message: 'Report schedule saved' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getReportConfig(req, res) {
  try {
    const db = getDB();
    const config = await db.collection('sa_config').findOne({ type: 'auto_reports' });
    return res.json({ status: 'success', data: config || {} });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// ============== Legacy shop-level report stubs (used by reportRoutes.js) ==============
async function salesReport(req, res) {
  try {
    const db = getDB();
    const { username, startDate, endDate, from, to, groupBy } = req.query;
    const query = {};
    if (username) query.username = username;

    const start = startDate || from;
    const end = endDate || to;

    if (start || end) {
      query.date = {};
      if (start) query.date.$gte = start.includes('T') ? start.split('T')[0] : start;
      if (end) query.date.$lte = end.includes('T') ? end.split('T')[0] : end;
    }

    const sales = await db.collection('sales').find(query).toArray();

    if (groupBy === 'product') {
      const productMap = {};
      sales.forEach(sale => {
        if (sale.items && Array.isArray(sale.items)) {
          sale.items.forEach(item => {
            const name = item.name || 'Unknown Product';
            const revenue = Number(item.total || (item.qty * item.rate) || 0);
            productMap[name] = (productMap[name] || 0) + revenue;
          });
        }
      });
      const data = Object.keys(productMap).map(name => ({
        product: name,
        revenue: productMap[name]
      }));
      res.json({ status: 'success', data });
    } else {
      // Default: sales by day, chronological
      const dateMap = {};
      sales.forEach(sale => {
        const d = sale.date || 'Unknown Date';
        const amount = Number(sale.amount || sale.total || 0);
        dateMap[d] = (dateMap[d] || 0) + amount;
      });
      const data = Object.keys(dateMap).sort().map(d => ({
        date: d,
        total: dateMap[d]
      }));
      res.json({ status: 'success', data });
    }
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

async function inventoryLowStock(req, res) {
  try {
    const db = getDB();
    const { username } = req.query;
    const q = username ? { username } : {};
    const products = await db.collection('products').find(q).toArray();
    const data = products.filter(p => Number(p.stock) <= (Number(p.lowStockLevel) || 10));
    res.json({ status: 'success', data });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

async function deliveryReport(req, res) {
  try {
    const db = getDB();
    const { username, startDate, endDate, from, to } = req.query;
    const q = username ? { username } : {};

    const start = startDate || from;
    const end = endDate || to;
    if (start || end) {
      q.createdAt = {};
      if (start) q.createdAt.$gte = new Date(start);
      if (end) q.createdAt.$lte = new Date(end);
    }

    const data = await db.collection('deliveries').find(q).sort({ createdAt: -1 }).limit(500).toArray();

    if (req.query.csv === 'true') {
      if (!data.length) {
        return res.status(404).send('No data found for this report.');
      }
      const csvData = data.map(d => ({
        OrderID: d.orderId || '',
        CustomerName: d.customer?.name || d.customerName || '',
        CustomerPhone: d.customer?.phone || d.customerPhone || '',
        DeliveryAddress: d.customer?.address || d.deliveryAddress || '',
        Status: d.status || '',
        PaymentType: d.paymentType || '',
        BillAmount: d.billAmount || d.charges || 0,
        TimeSlot: d.timeSlot || d.deliveryTimeSlot || '',
        Partner: d.partner || 'in-house',
        FailedReason: d.failedReason || '',
        RescheduleSlot: d.rescheduleSlot || '',
        ReturnReason: d.returnInfo?.reason || '',
        CreatedAt: d.createdAt || ''
      }));
      const fields = Object.keys(csvData[0]);
      const csv = parse(csvData, { fields });
      res.header('Content-Type', 'text/csv');
      res.attachment(`delivery_report_${new Date().getTime()}.csv`);
      return res.send(csv);
    }

    res.json({ status: 'success', data });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

async function financialSummary(req, res) {
  try {
    const db = getDB();
    const { username, startDate, endDate, from, to } = req.query;
    const query = {};
    if (username) query.username = username;

    const start = startDate || from;
    const end = endDate || to;

    if (start || end) {
      query.date = {};
      if (start) query.date.$gte = start.includes('T') ? start.split('T')[0] : start;
      if (end) query.date.$lte = end.includes('T') ? end.split('T')[0] : end;
    }

    const sales = await db.collection('sales').find(query).toArray();
    const purchases = await db.collection('purchases').find(query).toArray();
    const expenses = await db.collection('expenses').find(query).toArray();

    const revenue = sales.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const purchaseCost = purchases.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const expenseCost = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const cost = purchaseCost + expenseCost;
    const profit = revenue - cost;

    res.json({
      status: 'success',
      revenue,
      cost,
      profit,
      income: revenue,
      expense: cost
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

async function gstSummary(req, res) {
  try {
    const db = getDB();
    const { username, startDate, endDate, from, to } = req.query;
    const query = {};
    if (username) query.username = username;

    const start = startDate || from;
    const end = endDate || to;
    if (start || end) {
      query.date = {};
      if (start) query.date.$gte = start.includes('T') ? start.split('T')[0] : start;
      if (end) query.date.$lte = end.includes('T') ? end.split('T')[0] : end;
    }

    const sales = await db.collection('sales').find(query).toArray();

    const prodQuery = username ? { username } : {};
    const products = await db.collection('products').find(prodQuery).toArray();
    const productMap = {};
    products.forEach(p => {
      productMap[p.name] = {
        taxSlab: p.taxSlab || '18%',
        isTaxInclusive: p.isTaxInclusive === true
      };
    });

    const gstMap = {};

    sales.forEach(sale => {
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach(item => {
          const prodDetails = productMap[item.name] || { taxSlab: '18%', isTaxInclusive: false };
          const ratePct = parseFloat(prodDetails.taxSlab) || 18;
          const rateStr = `${ratePct}%`;
          const itemTotal = Number(item.total || (item.qty * item.rate) || 0);

          let taxable = 0;
          let gstAmount = 0;

          if (prodDetails.isTaxInclusive) {
            taxable = itemTotal / (1 + (ratePct / 100));
            gstAmount = itemTotal - taxable;
          } else {
            taxable = itemTotal;
            gstAmount = itemTotal * (ratePct / 100);
          }

          if (!gstMap[rateStr]) {
            gstMap[rateStr] = { gstRate: rateStr, taxable: 0, gstAmount: 0 };
          }
          gstMap[rateStr].taxable += taxable;
          gstMap[rateStr].gstAmount += gstAmount;
        });
      }
    });

    const data = Object.values(gstMap);
    res.json({ status: 'success', data });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

async function ageingReport(req, res) {
  try {
    const db = getDB();
    const { username } = req.query;
    const q = username ? { username } : {};
    const parties = await db.collection('parties').find(q).toArray();

    const data = parties.map(p => {
      let daysOverdue = 0;
      if (p.lastTxn) {
        const diffMs = new Date() - new Date(p.lastTxn);
        daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      } else {
        daysOverdue = 15;
      }
      return {
        customer: p.name,
        amount: Math.abs(p.balance || 0),
        outstanding: p.balance || 0,
        daysOverdue: daysOverdue
      };
    });

    res.json({ status: 'success', data });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

async function partyLedger(req, res) {
  try {
    const db = getDB();
    const { username, partyId } = req.query;
    const query = {};
    if (username) query.username = username;

    if (partyId) {
      const party = await db.collection('parties').findOne({
        username,
        $or: [
          { id: partyId },
          { name: partyId }
        ]
      });
      if (party) {
        query.party = party.name;
      } else {
        query.party = partyId;
      }
    }

    const txns = await db.collection('transactions').find(query).sort({ date: -1 }).limit(500).toArray();

    const data = txns.map(t => ({
      ...t,
      amount: t.credit || t.debit || 0
    }));

    res.json({ status: 'success', data });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

async function purchaseReport(req, res) {
  try {
    const db = getDB();
    const { username, startDate, endDate, from, to, groupBy } = req.query;
    const query = {};
    if (username) query.username = username;

    const start = startDate || from;
    const end = endDate || to;
    if (start || end) {
      query.date = {};
      if (start) query.date.$gte = start.includes('T') ? start.split('T')[0] : start;
      if (end) query.date.$lte = end.includes('T') ? end.split('T')[0] : end;
    }

    const purchases = await db.collection('purchases').find(query).toArray();

    if (groupBy === 'supplier') {
      const supplierMap = {};
      purchases.forEach(p => {
        const sup = p.supplier || 'Unknown Supplier';
        const amt = Number(p.amount || 0);
        if (!supplierMap[sup]) {
          supplierMap[sup] = { supplier: sup, total: 0, count: 0 };
        }
        supplierMap[sup].total += amt;
        supplierMap[sup].count += 1;
      });
      const data = Object.values(supplierMap);
      res.json({ status: 'success', data });
    } else {
      res.json({ status: 'success', data: purchases });
    }
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

async function inventoryAdvancedReport(req, res) {
  try {
    const db = getDB();
    const { username, type } = req.query;
    const q = username ? { username } : {};
    const products = await db.collection('products').find(q).toArray();

    if (type === 'out_of_stock') {
      const filtered = products.filter(p => Number(p.stock) <= (Number(p.lowStockLevel) || 5));
      res.json({ status: 'success', data: filtered });
    } else if (type === 'dead_stock') {
      const saleQuery = username ? { username } : {};
      const sales = await db.collection('sales').find(saleQuery).toArray();
      const soldProductNames = new Set();
      sales.forEach(s => {
        if (s.items && Array.isArray(s.items)) {
          s.items.forEach(item => {
            if (item.name) soldProductNames.add(item.name);
          });
        }
      });
      const filtered = products.filter(p => !soldProductNames.has(p.name));
      res.json({ status: 'success', data: filtered });
    } else {
      res.json({ status: 'success', data: products });
    }
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

// Custom Reports and automated emailing extensions
const { sendEmail } = require('../utils/notifyAdapters');

async function getReportSchedules(req, res) {
  try {
    const db = getDB();
    const { username } = req.query;
    const query = username ? { username } : {};
    const schedules = await db.collection('report_schedules').find(query).toArray();
    res.json({ status: 'success', data: schedules });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

async function saveReportSchedule(req, res) {
  try {
    const db = getDB();
    const { id, username, email, frequency, reportType, customConfig } = req.body;
    
    const doc = {
      username,
      email,
      frequency,
      reportType,
      customConfig: customConfig || null,
      updatedAt: new Date()
    };
    
    if (id) {
      const { ObjectId } = require('mongodb');
      await db.collection('report_schedules').updateOne(
        { _id: new ObjectId(id) },
        { $set: doc }
      );
    } else {
      doc.createdAt = new Date();
      doc.lastSent = null;
      await db.collection('report_schedules').insertOne(doc);
    }
    
    res.json({ status: 'success', message: 'Report schedule saved' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

async function deleteReportSchedule(req, res) {
  try {
    const db = getDB();
    const { id } = req.params;
    const { ObjectId } = require('mongodb');
    await db.collection('report_schedules').deleteOne({ _id: new ObjectId(id) });
    res.json({ status: 'success', message: 'Report schedule deleted' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

async function getCustomReports(req, res) {
  try {
    const db = getDB();
    const { username } = req.query;
    const query = username ? { username } : {};
    const reports = await db.collection('custom_reports').find(query).toArray();
    res.json({ status: 'success', data: reports });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

async function saveCustomReport(req, res) {
  try {
    const db = getDB();
    const { id, username, name, entity, fields, filters, sortBy, sortOrder } = req.body;
    
    const doc = {
      username,
      name,
      entity,
      fields,
      filters,
      sortBy,
      sortOrder,
      updatedAt: new Date()
    };
    
    if (id) {
      const { ObjectId } = require('mongodb');
      await db.collection('custom_reports').updateOne(
        { _id: new ObjectId(id) },
        { $set: doc }
      );
    } else {
      doc.createdAt = new Date();
      await db.collection('custom_reports').insertOne(doc);
    }
    
    res.json({ status: 'success', message: 'Custom report template saved' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

async function deleteCustomReport(req, res) {
  try {
    const db = getDB();
    const { id } = req.params;
    const { ObjectId } = require('mongodb');
    await db.collection('custom_reports').deleteOne({ _id: new ObjectId(id) });
    res.json({ status: 'success', message: 'Custom report template deleted' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

async function triggerReportEmail(req, res) {
  try {
    const db = getDB();
    const { id } = req.params;
    const { ObjectId } = require('mongodb');
    const schedule = await db.collection('report_schedules').findOne({ _id: new ObjectId(id) });
    if (!schedule) return res.status(404).json({ status: 'error', message: 'Schedule not found' });
    
    await sendScheduledReportEmail(db, schedule);
    res.json({ status: 'success', message: 'Report email sent successfully' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}

async function sendScheduledReportEmail(db, schedule) {
  const { username, email, reportType, customConfig, frequency } = schedule;
  
  let dataTitle = '';
  let htmlBody = '';
  
  if (reportType === 'sales') {
    dataTitle = 'Sales Invoice Report';
    const sales = await db.collection('sales').find({ username }).toArray();
    htmlBody = generateHtmlTable(dataTitle, sales.slice(0, 100), ['id', 'date', 'customer', 'amount', 'mode']);
  } else if (reportType === 'purchases') {
    dataTitle = 'Purchase PO Report';
    const purchases = await db.collection('purchases').find({ username }).toArray();
    htmlBody = generateHtmlTable(dataTitle, purchases.slice(0, 100), ['id', 'date', 'supplier', 'amount', 'mode']);
  } else if (reportType === 'inventory') {
    dataTitle = 'Inventory Status Report';
    const products = await db.collection('products').find({ username }).toArray();
    htmlBody = generateHtmlTable(dataTitle, products.slice(0, 100), ['name', 'sku', 'stock', 'price', 'purchasePrice']);
  } else if (reportType === 'custom' && customConfig) {
    dataTitle = `Custom Report: ${customConfig.name || 'Untitled'}`;
    const entity = customConfig.entity || 'sales';
    const rawData = await db.collection(entity).find({ username }).toArray();
    let filtered = applyCustomFilters(rawData, customConfig.filters);
    if (customConfig.sortBy) {
      filtered.sort((a, b) => {
        let valA = a[customConfig.sortBy];
        let valB = b[customConfig.sortBy];
        if (customConfig.sortOrder === 'desc') return valB > valA ? 1 : -1;
        return valA > valB ? 1 : -1;
      });
    }
    const fields = customConfig.fields || ['_id'];
    htmlBody = generateHtmlTable(dataTitle, filtered.slice(0, 100), fields);
  } else {
    dataTitle = 'Financial Ledger Summary';
    const sales = await db.collection('sales').find({ username }).toArray();
    const purchases = await db.collection('purchases').find({ username }).toArray();
    const revenue = sales.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const purchaseCost = purchases.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    htmlBody = `
      <h3>Financial Ledger Summary</h3>
      <p>Gross Sales: INR ${revenue}</p>
      <p>Purchase Cost: INR ${purchaseCost}</p>
      <p>Estimated Net Surplus: INR ${revenue - purchaseCost}</p>
    `;
  }
  
  const subject = `[Vypar Auto-Report] ${dataTitle} (${frequency.toUpperCase()})`;
  const finalHtml = `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.5;">
        <div style="background-color: #2563eb; color: #fff; padding: 15px; text-align: center; border-radius: 4px 4px 0 0;">
          <h2 style="margin: 0;">Vypar Auto-Report</h2>
        </div>
        <div style="padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 4px 4px;">
          <p>Hello,</p>
          <p>This is your scheduled <strong>${frequency}</strong> email containing the latest snapshot of <strong>${dataTitle}</strong>.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          ${htmlBody}
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 11px; color: #777;">This email was automatically generated and sent to you because you set up a report schedule. To manage your auto-reports, go to the <strong>Reports & AI Advisory</strong> tab in the Vypar Admin portal.</p>
        </div>
      </body>
    </html>
  `;
  
  await sendEmail(email, subject, finalHtml);
  
  await db.collection('report_schedules').updateOne(
    { _id: schedule._id },
    { $set: { lastSent: new Date() } }
  );
}

function generateHtmlTable(title, rows, fields) {
  let tableRows = rows.map(r => {
    let cells = fields.map(f => `<td style="padding: 10px; border-bottom: 1px solid #eee; font-size: 13px;">${r[f] !== undefined ? r[f] : '-'}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  
  let headerCells = fields.map(f => `<th style="padding: 12px; background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left; font-size: 12px; font-weight: bold; color: #475569;">${f.toUpperCase()}</th>`).join('');
  
  return `
    <h3 style="color: #1e293b; margin-top: 0; margin-bottom: 15px;">${title}</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr>${headerCells}</tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="' + fields.length + '" style="padding: 15px; text-align: center; color: #94a3b8; font-size: 13px;">No matching records.</td></tr>'}
      </tbody>
    </table>
  `;
}

function applyCustomFilters(data, filters) {
  if (!filters || !Array.isArray(filters)) return data;
  return data.filter(row => {
    return filters.every(f => {
      if (!f.field || !f.operator) return true;
      const val = row[f.field];
      const target = f.value;
      if (val === undefined || val === null) return false;
      
      switch (f.operator) {
        case 'equals': return String(val).toLowerCase() === String(target).toLowerCase();
        case 'contains': return String(val).toLowerCase().includes(String(target).toLowerCase());
        case 'gt': return Number(val) > Number(target);
        case 'lt': return Number(val) < Number(target);
        default: return true;
      }
    });
  });
}

module.exports = {
  // New platform-wide report functions (used by superRoutes.js)
  getReport,
  exportReport,
  saveReportConfig,
  getReportConfig,
  // Legacy shop-level report functions (used by reportRoutes.js)
  salesReport,
  inventoryLowStock,
  deliveryReport,
  financialSummary,
  gstSummary,
  ageingReport,
  partyLedger,
  purchaseReport,
  inventoryAdvancedReport,
  // Custom Reports & Emailing
  getReportSchedules,
  saveReportSchedule,
  deleteReportSchedule,
  getCustomReports,
  saveCustomReport,
  deleteCustomReport,
  triggerReportEmail,
  sendScheduledReportEmail
};
