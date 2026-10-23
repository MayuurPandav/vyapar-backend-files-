const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');

exports.getBillingOversight = async (req, res) => {
  try {
    const db = getDB();
    
    const todayStr = new Date().toISOString().substring(0,10);
    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().substring(0,10);

    const [totalToday] = await db.collection('sales').aggregate([
      { $match: { date: { $gte: todayStr } } },
      { $group: { _id: null, count: { $sum: 1 }, totalValue: { $sum: { $toDouble: "$amount" } } } }
    ]).toArray();

    const [totalMonth] = await db.collection('sales').aggregate([
      { $match: { date: { $gte: firstDayOfMonth } } },
      { $group: { _id: null, count: { $sum: 1 }, totalValue: { $sum: { $toDouble: "$amount" } } } }
    ]).toArray();

    const [allTime] = await db.collection('sales').aggregate([
      { $group: { 
          _id: null, 
          count: { $sum: 1 }, 
          totalValue: { $sum: { $toDouble: "$amount" } },
          overdueCount: { $sum: { $cond: [{ $gt: [{ $toDouble: "$outstanding" }, 0] }, 1, 0] } },
          overdueValue: { $sum: { $toDouble: "$outstanding" } },
          cancelledCount: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
          creditNoteCount: { $sum: { $cond: [{ $in: ["$type", ["return", "credit_note"]] }, 1, 0] } }
      } }
    ]).toArray();

    const topShops = await db.collection('sales').aggregate([
      { $group: { _id: "$username", count: { $sum: 1 }, value: { $sum: { $toDouble: "$amount" } } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]).toArray();

    const invoiceTypes = await db.collection('sales').aggregate([
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0,10);
    const trends = await db.collection('sales').aggregate([
      { $match: { date: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $substr: ["$date", 0, 10] }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray();

    res.json({
      today: totalToday || { count: 0, totalValue: 0 },
      month: totalMonth || { count: 0, totalValue: 0 },
      allTime: allTime || { count: 0, totalValue: 0, overdueCount: 0, overdueValue: 0, cancelledCount: 0, creditNoteCount: 0 },
      topShops,
      invoiceTypes,
      trends
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getPurchaseOversight = async (req, res) => {
  try {
    const db = getDB();

    const [allTime] = await db.collection('purchases').aggregate([
      { $group: { 
          _id: null, 
          count: { $sum: 1 }, 
          totalValue: { $sum: { $toDouble: "$amount" } },
          pendingCount: { $sum: { $cond: [{ $gt: [{ $toDouble: "$outstanding" }, 0] }, 1, 0] } },
          pendingValue: { $sum: { $toDouble: "$outstanding" } }
      } }
    ]).toArray();

    const topSuppliers = await db.collection('purchases').aggregate([
      { $group: { _id: "$party", count: { $sum: 1 }, value: { $sum: { $toDouble: "$amount" } } } },
      { $sort: { value: -1 } },
      { $limit: 10 }
    ]).toArray();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0,10);
    const trends = await db.collection('purchases').aggregate([
      { $match: { date: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $substr: ["$date", 0, 10] }, amount: { $sum: { $toDouble: "$amount" } } } },
      { $sort: { _id: 1 } }
    ]).toArray();

    res.json({
      allTime: allTime || { count: 0, totalValue: 0, pendingCount: 0, pendingValue: 0 },
      topSuppliers,
      trends
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getInventoryOversight = async (req, res) => {
  try {
    const db = getDB();

    const [allTime] = await db.collection('products').aggregate([
      { $group: { 
          _id: null, 
          count: { $sum: 1 }, 
          totalValue: { $sum: { $multiply: [{ $toDouble: { $ifNull: ["$stock", 0] } }, { $toDouble: { $ifNull: ["$purchasePrice", 0] } }] } },
          outOfStock: { $sum: { $cond: [{ $lte: [{ $toDouble: "$stock" }, 0] }, 1, 0] } },
          lowStock: { $sum: { $cond: [{ $and: [{ $gt: [{ $toDouble: "$stock" }, 0] }, { $lte: [{ $toDouble: "$stock" }, { $toDouble: { $ifNull: ["$lowStockAlert", 5] } }] }] }, 1, 0] } }
      } }
    ]).toArray();

    const categories = await db.collection('products').aggregate([
      { $group: { _id: "$category", count: { $sum: 1 }, stock: { $sum: { $toDouble: "$stock" } } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]).toArray();

    // Dead stock: We can simulate this by finding items with no recent sales, 
    // but without joining collections easily, we'll just return a mock or empty for now
    const deadStockCount = 0; 
    
    // Expiry alerts: Items with expiryDate less than 30 days from now
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().substring(0,10);
    const expiryCount = await db.collection('products').countDocuments({ expiryDate: { $lte: thirtyDaysFromNow, $ne: "" } });

    res.json({
      allTime: allTime || { count: 0, totalValue: 0, outOfStock: 0, lowStock: 0 },
      categories,
      deadStockCount,
      expiryCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getAccountingOversight = async (req, res) => {
  try {
    const db = getDB();

    const [receivables] = await db.collection('parties').aggregate([
      { $match: { type: 'customer', balance: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$balance' } } }
    ]).toArray();

    const [payables] = await db.collection('parties').aggregate([
      { $match: { type: 'supplier', balance: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$balance' } } }
    ]).toArray();

    const [cashFlow] = await db.collection('transactions').aggregate([
      { $group: { _id: null, totalIn: { $sum: { $cond: [{ $eq: ['$type', 'in'] }, '$amount', 0] } }, totalOut: { $sum: { $cond: [{ $eq: ['$type', 'out'] }, '$amount', 0] } } } }
    ]).toArray();

    // Actual overdue payments calculation by summing outstanding invoices
    const [salesOverdue] = await db.collection('sales').aggregate([
      { $group: { _id: null, total: { $sum: { $toDouble: { $ifNull: [ '$outstanding', 0 ] } } } } }
    ]).toArray();
    const overduePayments = salesOverdue?.total || 0;

    // Actual negative balance shops retrieved from transactions
    const negativeShops = await db.collection('transactions').aggregate([
      { $sort: { _id: -1 } },
      { $group: { _id: "$username", accountBalance: { $first: "$balance" } } },
      { $match: { accountBalance: { $lt: 0 } } },
      { $limit: 10 }
    ]).toArray();

    const negativeBalanceShops = [];
    for (const ns of negativeShops) {
      const userDoc = await db.collection('users').findOne({ username: ns._id });
      const settingsDoc = await db.collection('settings').findOne({ username: ns._id });
      const bizName = settingsDoc?.bizName || userDoc?.bizName || ns._id;
      negativeBalanceShops.push({
        _id: ns._id,
        name: bizName,
        accountBalance: ns.accountBalance
      });
    }

    res.json({
      status: 'success',
      data: {
        totalReceivables: receivables?.total || 0,
        totalPayables: payables?.total || 0,
        overduePayments,
        totalCashFlow: cashFlow ? (cashFlow.totalIn - cashFlow.totalOut) : 0,
        negativeBalanceShops
      }
    });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
};

exports.getGSTOversight = async (req, res) => {
  try {
    const db = getDB();

    const [gstCollected] = await db.collection('sales').aggregate([
      { $group: { _id: null, total: { $sum: { $toDouble: '$totalTax' } } } }
    ]).toArray();

    const [ewayBills] = await db.collection('sales').aggregate([
      { $match: { ewayBillGenerated: true } },
      { $count: 'count' }
    ]).toArray();

    // Actual GST Compliance calculations from settings
    const gstRegisteredShops = await db.collection('settings').find({ gstin: { $exists: true, $ne: "" } }).toArray();
    const totalGstRegistered = gstRegisteredShops.length;
    const verifiedGstShops = gstRegisteredShops.filter(s => parseInt(s.isGstVerified || 0) === 1);
    const totalVerified = verifiedGstShops.length;

    const nonCompliantShops = [];
    for (const shop of gstRegisteredShops) {
      if (parseInt(shop.isGstVerified || 0) !== 1) {
        const userDoc = await db.collection('users').findOne({ username: shop.username });
        const bizName = shop.bizName || userDoc?.bizName || shop.username;
        nonCompliantShops.push({
          name: bizName,
          reason: 'GSTIN Unverified / Pending Audit'
        });
      }
    }

    const shopsPendingFiling = nonCompliantShops.length;
    const filingCompletionRate = totalGstRegistered > 0 ? Math.round((totalVerified / totalGstRegistered) * 100) : 100;

    res.json({
      status: 'success',
      data: {
        shopsPendingFiling,
        filingCompletionRate,
        totalGSTCollected: gstCollected?.total || 0,
        ewayBillCount: ewayBills?.count || 0,
        nonCompliantShops
      }
    });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
};

exports.getExpenseOversight = async (req, res) => {
  try {
    const db = getDB();

    const [totalExp] = await db.collection('expenses').aggregate([
      { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } }
    ]).toArray();

    const categoryBreakdown = await db.collection('expenses').aggregate([
      { $group: { _id: '$category', total: { $sum: { $toDouble: '$amount' } } } },
      { $sort: { total: -1 } }
    ]).toArray();

    const highExpenseShops = await db.collection('expenses').aggregate([
      { $group: { _id: '$shopId', total: { $sum: { $toDouble: '$amount' } } } },
      { $match: { total: { $gt: 50000 } } },
      { $limit: 10 }
    ]).toArray();

    // Actual expense monthly trends
    const monthlyTrends = await db.collection('expenses').aggregate([
      {
        $group: {
          _id: { $substr: ["$date", 0, 7] }, // YYYY-MM
          amount: { $sum: { $toDouble: "$amount" } }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();

    res.json({
      status: 'success',
      data: {
        totalExpenses: totalExp?.total || 0,
        categoryBreakdown,
        highExpenseShops: highExpenseShops.map(s => ({ shopId: s._id, total: s.total })),
        monthlyTrends
      }
    });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
};

exports.getPaymentOversight = async (req, res) => {
  try {
    const db = getDB();

    const [totalCollected] = await db.collection('transactions').aggregate([
      { $match: { type: 'in' } },
      { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } }
    ]).toArray();

    const modeDistribution = await db.collection('transactions').aggregate([
      { $match: { type: 'in' } },
      { $group: { _id: '$mode', count: { $sum: 1 }, value: { $sum: { $toDouble: '$amount' } } } },
      { $sort: { value: -1 } }
    ]).toArray();

    const [advancePayments] = await db.collection('transactions').aggregate([
      { $match: { isAdvance: true, type: 'in' } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: { $toDouble: '$amount' } } } }
    ]).toArray();

    // Actual failed attempts count in sa_payments
    const failedAttempts = await db.collection('sa_payments').countDocuments({ status: 'failed' });

    // Actual platform-wide overdue payments sum
    const [salesOverdue] = await db.collection('sales').aggregate([
      { $group: { _id: null, total: { $sum: { $toDouble: { $ifNull: [ '$outstanding', 0 ] } } } } }
    ]).toArray();
    const pendingOverduePayments = salesOverdue?.total || 0;

    res.json({
      status: 'success',
      data: {
        totalCollected: totalCollected?.total || 0,
        modeDistribution,
        failedAttempts,
        pendingOverduePayments,
        advancePaymentsCount: advancePayments?.count || 0,
        advancePaymentsValue: advancePayments?.total || 0
      }
    });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
};

exports.getDeliveryOversight = async (req, res) => {
  try {
    const db = getDB();

    const [deliveryStats] = await db.collection('deliveries').aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $in: ['$status', ['pending', 'assigned', 'out_for_delivery']] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
        }
      }
    ]).toArray();

    const topBoys = await db.collection('deliveries').aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: '$deliveryBoyId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]).toArray();

    const stats = deliveryStats || { total: 0, completed: 0, pending: 0, failed: 0 };
    const successRate = stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : 0;

    // Actual average transit/delivery time from completed deliveries
    const completedDeliveries = await db.collection('deliveries').find({ 
      status: 'completed',
      createdAt: { $exists: true },
      updatedAt: { $exists: true }
    }).toArray();

    let averageDeliveryTime = 'N/A';
    if (completedDeliveries.length > 0) {
      let totalDiffMs = 0;
      let count = 0;
      for (const del of completedDeliveries) {
        const start = new Date(del.createdAt);
        const end = new Date(del.updatedAt);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const diff = end.getTime() - start.getTime();
          if (diff >= 0) {
            totalDiffMs += diff;
            count++;
          }
        }
      }
      if (count > 0) {
        const avgMins = Math.round((totalDiffMs / count) / (1000 * 60));
        averageDeliveryTime = `${avgMins} mins`;
      }
    }

    res.json({
      status: 'success',
      data: {
        totalDeliveries: stats.total,
        pendingDeliveries: stats.pending,
        completedDeliveries: stats.completed,
        failedDeliveries: stats.failed,
        successRate,
        topPerformingBoys: topBoys.map(b => ({ id: b._id, count: b.count })),
        averageDeliveryTime
      }
    });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
};

exports.getOffersOversight = async (req, res) => {
  try {
    const db = getDB();

    const [activeOffers] = await db.collection('offers').aggregate([
      { $match: { status: 'active' } },
      { $count: 'count' }
    ]).toArray();

    // Actual discount given from sales
    const [discountSum] = await db.collection('sales').aggregate([
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $add: [
                { $toDouble: { $ifNull: ["$discountAmount", 0] } },
                { $toDouble: { $ifNull: ["$discount", 0] } }
              ]
            }
          }
        }
      }
    ]).toArray();
    const totalDiscountGiven = discountSum?.total || 0;

    // Actual coupon usage grouped by coupon code in payments
    const paymentCoupons = await db.collection('sa_payments').aggregate([
      { $match: { coupon: { $exists: true, $ne: "" } } },
      { $group: { _id: "$coupon", usage: { $sum: 1 } } },
      { $sort: { usage: -1 } },
      { $project: { code: "$_id", usage: 1, _id: 0 } },
      { $limit: 5 }
    ]).toArray();
    const mostUsedCoupons = paymentCoupons.length > 0 ? paymentCoupons : [
      { code: 'NO_COUPONS', usage: 0 }
    ];

    // Actual offer conversion performance grouped by type in offers
    const performance = await db.collection('offers').aggregate([
      { $group: { _id: "$type", conversions: { $sum: "$usedCount" } } },
      { $sort: { conversions: -1 } }
    ]).toArray();

    const offerTypes = ['Percentage', 'Flat Amount', 'Buy X Get Y', 'Bundle Discount', 'Seasonal Offer', 'Loyalty Discount'];
    const offerPerformance = offerTypes.map(t => {
      const match = performance.find(p => p._id && p._id.toLowerCase().includes(t.toLowerCase().substring(0, 5)));
      return {
        type: t,
        conversions: match ? match.conversions : 0
      };
    });

    res.json({
      status: 'success',
      data: {
        totalActiveOffers: activeOffers?.count || 0,
        totalDiscountGiven,
        mostUsedCoupons,
        offerPerformance
      }
    });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
};

exports.getStaffOversight = async (req, res) => {
  try {
    const db = getDB();

    const staffByRole = await db.collection('users').aggregate([
      { $match: { role: { $ne: 'superadmin' } } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    // Actual active staff list grouped by staffId in staff_activity
    const activeStaffList = await db.collection('staff_activity').aggregate([
      { $group: { _id: "$staffId", actionCount: { $sum: 1 } } },
      { $sort: { actionCount: -1 } },
      { $limit: 5 }
    ]).toArray();

    const mostActiveStaff = [];
    for (const item of activeStaffList) {
      if (!item._id) continue;
      const staffDoc = await db.collection('staffusers').findOne({ _id: ObjectId.isValid(item._id) ? new ObjectId(item._id) : item._id });
      if (staffDoc) {
        mostActiveStaff.push({
          name: staffDoc.name,
          billsCreated: item.actionCount
        });
      }
    }
    if (mostActiveStaff.length === 0) {
      const allStaff = await db.collection('staffusers').find({}).limit(5).toArray();
      allStaff.forEach(s => {
        mostActiveStaff.push({
          name: s.name,
          billsCreated: 0
        });
      });
    }

    // Actual staff logins frequency calculation
    const totalLogins = await db.collection('loginhistories').countDocuments({ successful: true });
    const daysGroup = await db.collection('loginhistories').aggregate([
      { $group: { _id: { $substr: ["$createdAt", 0, 10] } } }
    ]).toArray();
    const numDays = daysGroup.length || 1;
    const staffCount = await db.collection('staffusers').countDocuments({ isActive: true }) || 1;
    const avgLoginsPerDay = (totalLogins / (numDays * staffCount)).toFixed(1);
    const loginFrequency = `Avg ${avgLoginsPerDay} logins/day per staff`;

    // Actual staff suspicious alerts from failed logins and delete actions
    const suspiciousAlerts = [];
    const failedLogins = await db.collection('loginhistories').aggregate([
      { $match: { successful: false } },
      { $group: { _id: "$email", count: { $sum: 1 } } },
      { $match: { count: { $gte: 3 } } }
    ]).toArray();

    for (const fl of failedLogins) {
      suspiciousAlerts.push({
        user: fl._id || 'Unknown Staff',
        issue: `${fl.count} failed login attempts detected`
      });
    }

    const deleteActivities = await db.collection('staff_activity').find({
      action: { $regex: /delete|remove|purge/i }
    }).limit(5).toArray();

    for (const act of deleteActivities) {
      const staffDoc = await db.collection('staffusers').findOne({ _id: ObjectId.isValid(act.staffId) ? new ObjectId(act.staffId) : act.staffId });
      suspiciousAlerts.push({
        user: staffDoc ? staffDoc.name : 'Unknown Staff',
        issue: `Performed action: ${act.action} (${act.detail || ''})`
      });
    }

    res.json({
      status: 'success',
      data: {
        totalStaffByRole: staffByRole,
        mostActiveStaff,
        loginFrequency,
        suspiciousAlerts
      }
    });
  } catch (error) { res.status(500).json({ status: 'error', message: error.message }); }
};
