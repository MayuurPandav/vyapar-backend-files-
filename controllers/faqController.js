const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const { logAudit } = require('./authController');

async function listFAQs(req, res) {
  try {
    const db = getDB();
    const faqs = await db.collection('sa_faqs').find({}).sort({ order: 1 }).toArray();
    return res.json({ status: 'success', faqs });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

async function createFAQ(req, res) {
  try {
    const db = getDB();
    const { question, answer, order = 100 } = req.body;
    if (!question || !answer) return res.status(400).json({ status: 'error', message: 'question and answer required' });
    const doc = { question, answer, order, createdAt: new Date() };
    await db.collection('sa_faqs').insertOne(doc);
    await logAudit(req.body.actor || 'SYSTEM', 'FAQ_CREATE', question);
    return res.json({ status: 'success' });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

async function updateFAQ(req, res) {
  try {
    const db = getDB();
    const { id } = req.params;
    const { question, answer, order } = req.body;
    if (!id || !ObjectId.isValid(id)) return res.status(400).json({ status: 'error', message: 'invalid id' });
    const upd = { updatedAt: new Date() };
    if (question) upd.question = question;
    if (answer) upd.answer = answer;
    if (order !== undefined) upd.order = order;
    await db.collection('sa_faqs').updateOne({ _id: new ObjectId(id) }, { $set: upd });
    await logAudit(req.body.actor || 'SYSTEM', 'FAQ_UPDATE', `faq=${id}`);
    return res.json({ status: 'success' });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

async function deleteFAQ(req, res) {
  try {
    const db = getDB();
    const { id } = req.params;
    if (!id || !ObjectId.isValid(id)) return res.status(400).json({ status: 'error', message: 'invalid id' });
    await db.collection('sa_faqs').deleteOne({ _id: new ObjectId(id) });
    await logAudit(req.body.actor || 'SYSTEM', 'FAQ_DELETE', `faq=${id}`);
    return res.json({ status: 'success' });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

module.exports = { listFAQs, createFAQ, updateFAQ, deleteFAQ };
