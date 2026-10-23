const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');

// Return a 1x1 transparent PNG and record open
const PIXEL = Buffer.from(
  '89504E470D0A1A0A0000000D4948445200000001000000010806000000' +
  '1F15C4890000000A49444154789C6360000002000100' +
  '05FE02FEA7B8C40000000049454E44AE426082', 'hex');

async function trackOpen(req, res) {
  try {
    const db = getDB();
    const { id } = req.params; // this should be delivery log id
    if (!id) return res.status(400).send(PIXEL);
    try {
      await db.collection('sa_delivery_logs').updateOne({ _id: new ObjectId(id) }, { $set: { openedAt: new Date(), openedIp: req.ip } });
    } catch (e) {}
    res.set('Content-Type', 'image/png');
    return res.send(PIXEL);
  } catch (err) {
    res.set('Content-Type', 'image/png');
    return res.send(PIXEL);
  }
}

// Click tracker: logs click then redirects
async function trackClick(req, res) {
  try {
    const db = getDB();
    const { id } = req.query; // delivery log id
    const url = req.query.url;
    if (!url) return res.status(400).send('missing url');
    if (id) {
      try { await db.collection('sa_delivery_logs').updateOne({ _id: new ObjectId(id) }, { $push: { clicks: { ts: new Date(), ip: req.ip, url } } }); } catch (e) {}
    }
    return res.redirect(url);
  } catch (err) { return res.redirect(req.query.url || '/'); }
}

module.exports = { trackOpen, trackClick };
