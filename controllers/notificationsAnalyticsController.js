const { getDB } = require('../config/db');

async function getDeliveryLogs(req, res) {
  try {
    const db = getDB();
    const { page = 1, limit = 50, channel, status, username } = req.query;
    const q = {};
    if (channel) q.channel = channel;
    if (status) q.status = status;
    if (username) q.username = username;
    const pageNum = Math.max(1, Number(page));
    const lim = Math.max(1, Number(limit));
    const total = await db.collection('sa_delivery_logs').countDocuments(q);
    const data = await db.collection('sa_delivery_logs').find(q).sort({ ts: -1 }).skip((pageNum-1)*lim).limit(lim).toArray();
    return res.json({ status: 'success', total, page: pageNum, limit: lim, data });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

async function getAnalyticsSummary(req, res) {
  try {
    const db = getDB();
    const totalSent = await db.collection('sa_delivery_logs').countDocuments({ status: 'sent' });
    const totalErrors = await db.collection('sa_delivery_logs').countDocuments({ status: 'error' });
    const byChannel = await db.collection('sa_delivery_logs').aggregate([{ $group: { _id: '$channel', cnt: { $sum: 1 }, errors: { $sum: { $cond: [{ $eq: ['$status','error'] },1,0] } } } }]).toArray();
    return res.json({ status: 'success', totals: { sent: totalSent, errors: totalErrors }, byChannel });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

module.exports = { getDeliveryLogs, getAnalyticsSummary };
