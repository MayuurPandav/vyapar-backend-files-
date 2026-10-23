const { getDB } = require('../config/db');
const { logAudit } = require('./authController');

// Start or send a message in a thread
async function sendMessage(req, res) {
  try {
    const db = getDB();
    const { threadId, from, to, message } = req.body;
    if (!from || !to || !message) return res.status(400).json({ status: 'error', message: 'from,to,message required' });
    let tid = threadId;
    if (!tid) {
      const t = { participants: [from, to], createdAt: new Date(), updatedAt: new Date() };
      const r = await db.collection('sa_chat_threads').insertOne(t);
      tid = String(r.insertedId);
    } else {
      await db.collection('sa_chat_threads').updateOne({ _id: require('mongodb').ObjectId(tid) }, { $set: { updatedAt: new Date() } });
    }
    const msg = { threadId: String(tid), from, to, message, createdAt: new Date(), read: false };
    await db.collection('sa_chat_messages').insertOne(msg);
    await logAudit(from, 'CHAT_SEND', `to=${to}`);
    return res.json({ status: 'success', threadId: tid });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

async function listThreads(req, res) {
  try {
    const db = getDB();
    const { username } = req.query;
    if (!username) return res.status(400).json({ status: 'error', message: 'username required' });
    const threads = await db.collection('sa_chat_threads').find({ participants: username }).sort({ updatedAt: -1 }).toArray();
    return res.json({ status: 'success', threads });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

async function getMessages(req, res) {
  try {
    const db = getDB();
    const { threadId } = req.params;
    if (!threadId) return res.status(400).json({ status: 'error', message: 'threadId required' });
    const msgs = await db.collection('sa_chat_messages').find({ threadId: String(threadId) }).sort({ createdAt: 1 }).toArray();
    return res.json({ status: 'success', messages: msgs });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

module.exports = { sendMessage, listThreads, getMessages };
