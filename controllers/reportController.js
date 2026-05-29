const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');

function toCSV(rows) {
  if (!rows || !rows.length) return '';
  const keys = Object.keys(rows[0]);
  const lines = [keys.join(',')];
  for (const r of rows) {
    const vals = keys.map(k => { const v = r[k]==null? '': String(r[k]).replace(/"/g,'""'); return `"${v}"`; });
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

// Sales report: groupBy=day|product
async function salesReport(req, res) {
  try {
    const db = getDB();
    const { from, to, groupBy } = req.query;
    const match = {};
    if (from || to) match.date = {};
    if (from) match.date.$gte = from;
    if (to) match.date.$lte = to;

    if (groupBy === 'product') {
      // unwind items and group by item name
      const pipeline = [
        { $match: match },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', qty: { $sum: { $toDouble: '$items.qty' } }, revenue: { $sum: { $toDouble: '$items.amount' } } } },
        { $project: { product: '$_id', qty: 1, revenue: 1, _id: 0 } },
        { $sort: { revenue: -1 } }
      ];
      const rows = await db.collection('sales').aggregate(pipeline).toArray();
      if (req.query.csv === 'true') {
        const csv = toCSV(rows);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="sales_by_product.csv"`);
        return res.send(csv);
      }
      return res.json(rows);
    }

    // default: group by day
    const pipeline = [
      { $match: match },
      { $group: { _id: '$date', total: { $sum: { $toDouble: '$amount' } }, count: { $sum: 1 } } },
      { $project: { date: '$_id', total: 1, count: 1, _id: 0 } },
      { $sort: { date: 1 } }
    ];
    const rows = await db.collection('sales').aggregate(pipeline).toArray();
    if (req.query.csv === 'true') {
      const csv = toCSV(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="sales_by_day.csv"`);
      return res.send(csv);
    }
    return res.json(rows);
  } catch (err) {
    console.error('salesReport', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function inventoryLowStock(req, res) {
  try {
    const db = getDB();
    const thresh = Number(req.query.threshold || 0);
    const q = { $expr: { $lte: [ { $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockLevel', thresh || 5] } ] } };
    const rows = await db.collection('products').find(q).project({ _id: 0 }).toArray();
    if (req.query.csv === 'true') {
      const csv = toCSV(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="low_stock.csv"`);
      return res.send(csv);
    }
    return res.json(rows);
  } catch (err) {
    console.error('inventoryLowStock', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function deliveryReport(req, res) {
  try {
    const db = getDB();
    const { from, to, status } = req.query;
    const q = {};
    if (status) q.status = status;
    if (from || to) q.createdAt = {};
    if (from) q.createdAt.$gte = from;
    if (to) q.createdAt.$lte = to;
    const rows = await db.collection('deliveries').find(q).sort({ createdAt: -1 }).toArray();
    if (req.query.csv === 'true') {
      const csv = toCSV(rows.map(r => ({ id: r._id, customer: (r.customer||{}).name || '', phone: (r.customer||{}).phone || '', status: r.status, date: r.createdAt })));
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="delivery_report.csv"`);
      return res.send(csv);
    }
    return res.json(rows);
  } catch (err) {
    console.error('deliveryReport', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  salesReport,
  inventoryLowStock,
  deliveryReport
};

// Financial summary: totals for sales, purchases, transactions
async function financialSummary(req, res) {
  try {
    const db = getDB();
    const { from, to } = req.query;
    const match = {};
    if (from || to) match.date = {};
    if (from) match.date.$gte = from;
    if (to) match.date.$lte = to;

    const salesAgg = await db.collection('sales').aggregate([
      { $match: match },
      { $group: { _id: null, revenue: { $sum: { $toDouble: '$amount' } }, count: { $sum: 1 } } },
      { $project: { _id: 0, revenue: 1, count: 1 } }
    ]).toArray();

    const purchasesAgg = await db.collection('purchases').aggregate([
      { $match: match },
      { $group: { _id: null, cost: { $sum: { $toDouble: '$amount' } }, count: { $sum: 1 } } },
      { $project: { _id: 0, cost: 1, count: 1 } }
    ]).toArray();

    const revenue = salesAgg[0]?.revenue || 0;
    const cost = purchasesAgg[0]?.cost || 0;
    const profit = revenue - cost;

    const rows = [{ revenue, cost, profit }];
    if (req.query.csv === 'true') {
      const csv = toCSV(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="financial_summary.csv"`);
      return res.send(csv);
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error('financialSummary', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// GST summary (best-effort): sums gst fields from sales and purchases
async function gstSummary(req, res) {
  try {
    const db = getDB();
    // try to aggregate by gstRate field in sales.items
    const pipeline = [
      { $unwind: '$items' },
      { $group: { _id: '$items.gstRate', gstAmount: { $sum: { $toDouble: '$items.gstAmount' } }, taxable: { $sum: { $toDouble: '$items.amount' } } } },
      { $project: { gstRate: '$_id', gstAmount: 1, taxable: 1, _id: 0 } },
      { $sort: { gstRate: 1 } }
    ];
    const rows = await db.collection('sales').aggregate(pipeline).toArray();
    if (req.query.csv === 'true') {
      const csv = toCSV(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="gst_summary.csv"`);
      return res.send(csv);
    }
    return res.json(rows);
  } catch (err) {
    console.error('gstSummary', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Ageing report for receivables (sales with outstanding)
async function ageingReport(req, res) {
  try {
    const db = getDB();
    const now = new Date();
    const rows = await db.collection('sales').find({ $expr: { $gt: [ { $toDouble: { $ifNull: ['$outstanding', 0] } }, 0 ] } }).project({ _id: 1, customer: 1, amount: 1, outstanding: 1, date: 1 }).toArray();
    const result = rows.map(r => {
      const date = r.date ? new Date(r.date) : new Date(r._id.getTimestamp());
      const days = Math.floor((now - date) / (1000*60*60*24));
      return { id: r._id, customer: r.customer?.name || '', amount: r.amount || 0, outstanding: r.outstanding || 0, daysOverdue: days };
    });
    if (req.query.csv === 'true') {
      const csv = toCSV(result);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="ageing_report.csv"`);
      return res.send(csv);
    }
    return res.json(result);
  } catch (err) {
    console.error('ageingReport', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Party ledger: combine transactions, sales, purchases for a party
async function partyLedger(req, res) {
  try {
    const db = getDB();
    const pid = req.query.partyId;
    const match = pid ? { 'partyId': pid } : {};
    const sales = await db.collection('sales').find(match).project({ _id: 1, date: 1, amount: 1, type: { $literal: 'sale' }, party: 1 }).toArray();
    const purchases = await db.collection('purchases').find(match).project({ _id: 1, date: 1, amount: 1, type: { $literal: 'purchase' }, party: 1 }).toArray();
    const transactions = await db.collection('transactions').find(match).project({ _id: 1, date: 1, amount: 1, type: 1, party: 1 }).toArray();
    const combined = [...sales, ...purchases, ...transactions].map(r => ({ id: r._id, date: r.date || (r._id && r._id.getTimestamp && r._id.getTimestamp()), amount: r.amount || 0, type: r.type || 'txn' }));
    combined.sort((a,b) => new Date(a.date) - new Date(b.date));
    if (req.query.csv === 'true') {
      const csv = toCSV(combined);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="party_ledger.csv"`);
      return res.send(csv);
    }
    return res.json(combined);
  } catch (err) {
    console.error('partyLedger', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// export additions
module.exports.financialSummary = financialSummary;
module.exports.gstSummary = gstSummary;
module.exports.ageingReport = ageingReport;
module.exports.partyLedger = partyLedger;

// --- New Reports (Feature 16) ---
async function purchaseReport(req, res) {
  try {
    const db = getDB();
    const { from, to, groupBy } = req.query;
    const match = {};
    if (from || to) match.date = {};
    if (from) match.date.$gte = from;
    if (to) match.date.$lte = to;

    let pipeline = [];
    if (groupBy === 'supplier') {
      pipeline = [
        { $match: match },
        { $group: { _id: '$party.name', total: { $sum: { $toDouble: '$amount' } }, count: { $sum: 1 } } },
        { $project: { supplier: '$_id', total: 1, count: 1, _id: 0 } },
        { $sort: { total: -1 } }
      ];
    } else if (groupBy === 'month') {
      pipeline = [
        { $match: match },
        { $group: { _id: { $substr: ['$date', 0, 7] }, total: { $sum: { $toDouble: '$amount' } } } },
        { $project: { month: '$_id', total: 1, _id: 0 } },
        { $sort: { month: 1 } }
      ];
    } else {
      pipeline = [
        { $match: match },
        { $sort: { date: -1 } }
      ];
    }
    const rows = await db.collection('purchases').aggregate(pipeline).toArray();
    if (req.query.csv === 'true') {
      const csv = toCSV(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="purchase_report.csv"`);
      return res.send(csv);
    }
    return res.json(rows);
  } catch (err) {
    console.error('purchaseReport', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function inventoryAdvancedReport(req, res) {
  try {
    const db = getDB();
    const { type } = req.query; // 'out_of_stock', 'dead_stock'
    let q = {};
    if (type === 'out_of_stock') {
      q = { $expr: { $lte: [ { $toDouble: { $ifNull: ['$stock', 0] } }, 0 ] } };
    } else if (type === 'dead_stock') {
      // Find products that haven't been sold recently. We approximate by checking if there's any sale in last 90 days.
      // For simplicity in a single query, we just return products with 0 total sales (if tracked) or a random subset as a stub.
      // We will actually aggregate sales and find missing products.
      const recentSales = await db.collection('sales').find({ date: { $gte: new Date(Date.now() - 90*24*60*60*1000).toISOString() } }).toArray();
      const soldSkus = new Set();
      recentSales.forEach(s => s.items && s.items.forEach(i => soldSkus.add(i.sku || i.name)));
      const allProducts = await db.collection('products').find({}).toArray();
      const rows = allProducts.filter(p => !soldSkus.has(p.sku) && !soldSkus.has(p.name));
      if (req.query.csv === 'true') {
        const csv = toCSV(rows);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="dead_stock.csv"`);
        return res.send(csv);
      }
      return res.json(rows);
    }
    
    const rows = await db.collection('products').find(q).toArray();
    if (req.query.csv === 'true') {
      const csv = toCSV(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type||'inventory'}.csv"`);
      return res.send(csv);
    }
    return res.json(rows);
  } catch (err) {
    console.error('inventoryAdvancedReport', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports.purchaseReport = purchaseReport;
module.exports.inventoryAdvancedReport = inventoryAdvancedReport;

