const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const PDFDocument = require('pdfkit');
const https = require('https');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

function fetchImageBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', (e) => reject(e));
    }).on('error', (e) => reject(e));
  });
}

function getS3Client() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const opts = { region };
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    opts.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    };
  }
  return new S3Client(opts);
}

async function uploadBufferToS3(buffer, key, contentType) {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error('AWS_S3_BUCKET not configured');
  const client = getS3Client();
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType });
  await client.send(cmd);
  const region = process.env.AWS_REGION || 'us-east-1';
  // Construct simple S3 url
  const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  return { url, key };
}

// Create a delivery order
async function createDelivery(req, res) {
  try {
    const db = getDB();
    const payload = req.body || {};
    const now = new Date().toISOString();
    const doc = Object.assign({
      items: [],
      customer: {},
      status: 'pending',
      assignedTo: null,
      timeSlot: payload.timeSlot || null,
      partner: payload.partner || 'in-house',
      charges: payload.charges || 0,
      proof: [],
      attempts: 0,
      returnInfo: null,
      createdAt: now,
      updatedAt: now
    }, payload);

    // Third-party API stub integration
    if (doc.partner !== 'in-house') {
      console.log(`[STUB] Connecting to ${doc.partner} API to push delivery order...`);
      // Simulate API delay and response
      doc.thirdPartyTrackingId = `${doc.partner.toUpperCase()}-${Date.now()}`;
      doc.status = 'pending_partner_pickup';
    }

    const r = await db.collection('deliveries').insertOne(doc);
    return res.json({ status: 'success', id: r.insertedId, delivery: doc });
  } catch (err) {
    console.error('createDelivery', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function listDeliveries(req, res) {
  try {
    const db = getDB();
    const q = {};
    const { status, from, to, search } = req.query;
    if (status) q.status = status;
    if (search) q['customer.username'] = { $regex: search, $options: 'i' };
    if (from || to) {
      q.createdAt = {};
      if (from) q.createdAt.$gte = from;
      if (to) q.createdAt.$lte = to;
    }
    const docs = await db.collection('deliveries').find(q).sort({ createdAt: -1 }).limit(200).toArray();
    return res.json(docs);
  } catch (err) {
    console.error('listDeliveries', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getDelivery(req, res) {
  try {
    const db = getDB();
    const id = req.params.id;
    const doc = await db.collection('deliveries').findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
    if (!doc) return res.status(404).json({ status: 'error', message: 'Not found' });
    return res.json(doc);
  } catch (err) {
    console.error('getDelivery', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function updateDelivery(req, res) {
  try {
    const db = getDB();
    const id = req.params.id;
    const updates = req.body || {};
    updates.updatedAt = new Date().toISOString();
    await db.collection('deliveries').updateOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id }, { $set: updates });
    const doc = await db.collection('deliveries').findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
    return res.json({ status: 'success', delivery: doc });
  } catch (err) {
    console.error('updateDelivery', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function assignDelivery(req, res) {
  try {
    const db = getDB();
    const id = req.params.id;
    const { deliveryBoyId } = req.body;
    await db.collection('deliveries').updateOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id }, { $set: { assignedTo: deliveryBoyId, status: 'out_for_delivery', updatedAt: new Date().toISOString() } });
    const doc = await db.collection('deliveries').findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
    return res.json({ status: 'success', delivery: doc });
  } catch (err) {
    console.error('assignDelivery', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Accept proof as base64 image inside JSON { type, data, uploadedBy }
async function uploadProof(req, res) {
  try {
    const db = getDB();
    const id = req.params.id;
    // Support multipart upload via multer (file in req.file)
    if (req.file) {
      try {
        const file = req.file; // buffer
        const ext = (file.originalname || 'upload').split('.').pop();
        const key = `deliveries/${id}/${Date.now().toString().slice(-8)}.${ext}`;
        const result = await uploadBufferToS3(file.buffer, key, file.mimetype || 'application/octet-stream');
        const proofItem = { type: 'photo', url: result.url, s3Key: result.key, uploadedBy: req.body.uploadedBy || 'system', createdAt: new Date().toISOString() };
        await db.collection('deliveries').updateOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id }, { $push: { proof: proofItem }, $set: { updatedAt: new Date().toISOString() } });
        const doc = await db.collection('deliveries').findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
        return res.json({ status: 'success', delivery: doc });
      } catch (e) {
        console.error('uploadProof.s3', e);
        return res.status(500).json({ status: 'error', message: e.message });
      }
    }

    // Fallback: accept base64 JSON body { type, data, uploadedBy }
    const { type, data, uploadedBy } = req.body || {};
    if (!data) return res.status(400).json({ status: 'error', message: 'No data' });
    const proofItem = { type: type || 'photo', data, uploadedBy: uploadedBy || 'system', createdAt: new Date().toISOString() };
    await db.collection('deliveries').updateOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id }, { $push: { proof: proofItem }, $set: { updatedAt: new Date().toISOString() } });
    const doc = await db.collection('deliveries').findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
    return res.json({ status: 'success', delivery: doc });
  } catch (err) {
    console.error('uploadProof', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function markReturn(req, res) {
  try {
    const db = getDB();
    const id = req.params.id;
    const { reason } = req.body;
    await db.collection('deliveries').updateOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id }, { $set: { status: 'failed', returnInfo: { reason, date: new Date().toISOString() }, updatedAt: new Date().toISOString() } });
    const doc = await db.collection('deliveries').findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
    return res.json({ status: 'success', delivery: doc });
  } catch (err) {
    console.error('markReturn', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Delivery boys
async function listDeliveryBoys(req, res) {
  try {
    const db = getDB();
    const docs = await db.collection('delivery_boys').find({}).toArray();
    return res.json(docs);
  } catch (err) {
    console.error('listDeliveryBoys', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function createDeliveryBoy(req, res) {
  try {
    const db = getDB();
    const payload = req.body || {};
    payload.createdAt = new Date().toISOString();
    const r = await db.collection('delivery_boys').insertOne(payload);
    return res.json({ status: 'success', id: r.insertedId, boy: payload });
  } catch (err) {
    console.error('createDeliveryBoy', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Barcode doc simple CRUD
async function generateBarcode(req, res) {
  try {
    const db = getDB();
    const { productId, code, type } = req.body;
    const finalCode = code || (`BC-${productId || 'GEN'}-${Date.now().toString().slice(-6)}`);
    const doc = { productId, code: finalCode, type: type || 'CODE128', createdAt: new Date().toISOString() };
    await db.collection('barcodes').insertOne(doc);
    return res.json({ status: 'success', barcode: doc });
  } catch (err) {
    console.error('generateBarcode', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getBarcodeByProduct(req, res) {
  try {
    const db = getDB();
    const pid = req.params.productId;
    const doc = await db.collection('barcodes').findOne({ productId: pid });
    if (!doc) return res.status(404).json({ status: 'error', message: 'Not found' });
    return res.json(doc);
  } catch (err) {
    console.error('getBarcodeByProduct', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function listBarcodes(req, res) {
  try {
    const db = getDB();
    const docs = await db.collection('barcodes').find({}).sort({ createdAt: -1 }).limit(500).toArray();
    return res.json(docs);
  } catch (err) {
    console.error('listBarcodes', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

// Generate barcode labels PDF. Query params: ids=comma,separated
async function generateBarcodesPDF(req, res) {
  try {
    const db = getDB();
    const ids = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
    const format = req.query.format || 'qr';
    const size = req.query.size || 'standard';
    const q = {};
    if (ids.length) q._id = { $in: ids.map(id => ObjectId.isValid(id) ? new ObjectId(id) : id) };
    const items = await db.collection('barcodes').find(q).limit(500).toArray();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="barcode_labels.pdf"');

    const doc = new PDFDocument({ autoFirstPage: false });
    doc.pipe(res);

    // layout: 3 columns x N rows per page
    const pageWidth = 595; // A4-ish
    const pageHeight = 842;
    const margin = 36;
    const isSmall = size === 'small';
    const cols = isSmall ? 4 : 3;
    const colW = (pageWidth - margin * 2) / cols;
    const rowH = isSmall ? 90 : 140;

    let x = margin, y = margin;
    doc.addPage({ size: [pageWidth, pageHeight] });

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      // draw box
      doc.rect(x, y, colW - 10, rowH - 10).stroke();
      
      const imgSize = isSmall ? '80x80' : '200x200';
      const imgUrl = format === 'qr'
        ? `https://chart.googleapis.com/chart?cht=qr&chs=${imgSize}&chl=${encodeURIComponent(it.code)}`
        : `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(it.code)}&scaleX=2&scaleY=1`;
        
      try {
        const imgBuf = await fetchImageBuffer(imgUrl);
        const drawW = isSmall ? 50 : 80;
        const drawH = isSmall ? (format==='qr'?50:25) : (format==='qr'?80:40);
        doc.image(imgBuf, x + 8, y + 8, { width: drawW, height: drawH });
      } catch (e) {
        // fallback: do nothing
      }
      
      const textX = x + (isSmall ? 62 : 96);
      doc.fontSize(isSmall ? 8 : 10).text(it.code || '', textX, y + 16, { width: colW - (isSmall ? 70 : 110) });
      doc.fontSize(isSmall ? 7 : 9).text(it.productId || '', textX, y + (isSmall ? 30 : 36), { width: colW - (isSmall ? 70 : 110) });

      x += colW;
      if ((i + 1) % cols === 0) {
        x = margin;
        y += rowH;
      }
      if (y + rowH > pageHeight - margin) {
        doc.addPage();
        x = margin; y = margin;
      }
    }

    doc.end();
  } catch (err) {
    console.error('generateBarcodesPDF', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  createDelivery,
  listDeliveries,
  getDelivery,
  updateDelivery,
  assignDelivery,
  uploadProof,
  markReturn,
  listDeliveryBoys,
  createDeliveryBoy,
  generateBarcode,
  listBarcodes,
  getBarcodeByProduct,
  generateBarcodesPDF
};
