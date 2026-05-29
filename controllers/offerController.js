const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');

async function listOffers(req, res) {
  try {
    const db = getDB();
    const { username } = req.query;
    const q = {};
    if (username) q.username = username;
    const docs = await db.collection('offers').find(q).sort({ createdAt: -1 }).toArray();
    return res.json(docs);
  } catch (err) {
    console.error('listOffers', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function createOffer(req, res) {
  try {
    const db = getDB();
    const payload = req.body || {};
    // Basic validation
    if (!payload.title || !payload.type) return res.status(400).json({ status: 'error', message: 'title and type required' });
    const allowed = ['percentage','flat','bogo'];
    if (!allowed.includes(payload.type)) return res.status(400).json({ status: 'error', message: 'invalid type' });
    payload.createdAt = new Date().toISOString();
    payload.active = payload.active === undefined ? true : !!payload.active;
    payload.applyTo = payload.applyTo || { products: [], categories: [] };
    await db.collection('offers').insertOne(payload);
    return res.json({ status: 'success', offer: payload });
  } catch (err) {
    console.error('createOffer', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function updateOffer(req, res) {
  try {
    const db = getDB();
    const id = req.params.id;
    const updates = req.body || {};
    updates.updatedAt = new Date().toISOString();
    // Validation
    if (updates.type) {
      const allowed = ['percentage','flat','bogo'];
      if (!allowed.includes(updates.type)) return res.status(400).json({ status: 'error', message: 'invalid type' });
    }
    await db.collection('offers').updateOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id }, { $set: updates });
    const doc = await db.collection('offers').findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
    return res.json({ status: 'success', offer: doc });
  } catch (err) {
    console.error('updateOffer', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function deleteOffer(req, res) {
  try {
    const db = getDB();
    const id = req.params.id;
    await db.collection('offers').deleteOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
    return res.json({ status: 'success' });
  } catch (err) {
    console.error('deleteOffer', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { listOffers, createOffer, updateOffer, deleteOffer };
