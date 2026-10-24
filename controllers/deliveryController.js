const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const PDFDocument = require('pdfkit');
const https = require('https');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const bwipjs = require('bwip-js');
const shiprocketService = require('../services/shiprocketService');

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
    
    const username = payload.username || 'admin@vyapar.com';
    const customerName = payload.customerName || payload.customer?.name || '';
    const customerPhone = payload.customerPhone || payload.customer?.phone || '';
    const deliveryAddress = payload.deliveryAddress || payload.customer?.address || payload.address || '';
    const orderId = payload.orderId || payload.invoiceId || `ORD-${Date.now().toString().slice(-6)}`;
    const invoiceId = payload.invoiceId || null;

    let items = payload.items || [];
    let itemsStrArray = [];
    let itemsObjArray = [];
    if (Array.isArray(items)) {
      items.forEach(item => {
        if (typeof item === 'string') {
          itemsStrArray.push(item);
          itemsObjArray.push({ name: item, qty: 1 });
        } else if (item && typeof item === 'object') {
          itemsObjArray.push(item);
          itemsStrArray.push(`${item.name || item.productId || 'Item'} x${item.qty || 1}`);
        }
      });
    }

    const billAmount = Number(payload.billAmount) || Number(payload.charges) || 0;
    const paymentType = payload.paymentType || 'COD';

    const doc = {
      username,
      orderId,
      invoiceId,
      items: itemsObjArray,
      customer: {
        name: customerName,
        phone: customerPhone,
        address: deliveryAddress,
        addressLine1: payload.customer?.address || payload.customer?.addressLine1 || '',
        addressLine2: payload.customer?.addressLine2 || '',
        city: payload.customer?.city || '',
        state: payload.customer?.state || '',
        pincode: payload.customer?.pincode || '',
        landmark: payload.customer?.landmark || ''
      },
      status: payload.status || 'pending',
      assignedTo: payload.assignedTo || null,
      timeSlot: payload.timeSlot || null,
      partner: payload.partner || 'in-house',
      charges: payload.charges || 0,
      proof: payload.proof || [],
      attempts: payload.attempts || 0,
      returnInfo: payload.returnInfo || null,
      
      // Driver App Compatibility
      customerName,
      customerPhone,
      deliveryAddress,
      assignedDriver: payload.assignedTo || payload.assignedDriver || null,
      billAmount,
      paymentType,
      deliveryTimeSlot: payload.timeSlot || null,
      
      createdAt: now,
      updatedAt: now
    };

    // Third-party API stub integration
    if (doc.partner !== 'in-house') {
      console.log(`[STUB] Connecting to ${doc.partner} API to push delivery order...`);
      // Simulate API delay and response
      doc.thirdPartyTrackingId = `${doc.partner.toUpperCase()}-${Date.now()}`;
      doc.status = 'pending_partner_pickup';
    }

    const r = await db.collection('deliveries').insertOne(doc);
    const io = req.app.get('socketio');
    if (io) io.emit('delivery_updated', doc);
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
    const { status, from, to, search, username } = req.query;
    
    if (username && !username.includes('admin')) {
      q.$or = [{ username: username }, { 'customer.username': username }];
    }
    if (status) q.status = status;
    if (search) {
      q.$or = [
        { 'customer.username': { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } }
      ];
    }
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
    if (updates.customer) {
      const customerName = updates.customerName || updates.customer.name || '';
      const customerPhone = updates.customerPhone || updates.customer.phone || '';
      const deliveryAddress = updates.deliveryAddress || updates.customer.address || '';
      
      updates.customer = {
        name: customerName,
        phone: customerPhone,
        address: deliveryAddress,
        addressLine1: updates.customer.address || updates.customer.addressLine1 || '',
        addressLine2: updates.customer.addressLine2 || '',
        city: updates.customer.city || '',
        state: updates.customer.state || '',
        pincode: updates.customer.pincode || '',
        landmark: updates.customer.landmark || ''
      };
    }
    await db.collection('deliveries').updateOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id }, { $set: updates });
    const doc = await db.collection('deliveries').findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
    const io = req.app.get('socketio');
    if (io) io.emit('delivery_updated', doc);
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
    await db.collection('deliveries').updateOne(
      { _id: ObjectId.isValid(id) ? new ObjectId(id) : id },
      { 
        $set: { 
          assignedTo: deliveryBoyId, 
          assignedDriver: deliveryBoyId, 
          status: 'Assigned', 
          updatedAt: new Date().toISOString() 
        } 
      }
    );
    const doc = await db.collection('deliveries').findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
    const io = req.app.get('socketio');
    if (io) io.emit('delivery_updated', doc);
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
        let proofItem;

        if (process.env.AWS_S3_BUCKET) {
          const result = await uploadBufferToS3(file.buffer, key, file.mimetype || 'application/octet-stream');
          proofItem = { type: 'photo', url: result.url, s3Key: result.key, uploadedBy: req.body.uploadedBy || 'system', createdAt: new Date().toISOString() };
        } else {
          // Local storage fallback
          const fs = require('fs');
          const path = require('path');
          const uploadDir = path.join(__dirname, '..', 'uploads', 'proofs');
          fs.mkdirSync(uploadDir, { recursive: true });
          const filename = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, "-")}`;
          fs.writeFileSync(path.join(uploadDir, filename), file.buffer);
          const localUrl = `/uploads/proofs/${filename}`;
          proofItem = { type: 'photo', url: localUrl, uploadedBy: req.body.uploadedBy || 'system', createdAt: new Date().toISOString() };
        }

        await db.collection('deliveries').updateOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id }, { $push: { proof: proofItem }, $set: { updatedAt: new Date().toISOString() } });
        const doc = await db.collection('deliveries').findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
        const io = req.app.get('socketio');
        if (io) io.emit('delivery_updated', doc);
        return res.json({ status: 'success', delivery: doc });
      } catch (e) {
        console.error('uploadProof fallback/s3 error', e);
        return res.status(500).json({ status: 'error', message: e.message });
      }
    }

    // Fallback: accept base64 JSON body { type, data, uploadedBy }
    const { type, data, uploadedBy } = req.body || {};
    if (!data) return res.status(400).json({ status: 'error', message: 'No data' });
    const proofItem = { type: type || 'photo', data, uploadedBy: uploadedBy || 'system', createdAt: new Date().toISOString() };
    await db.collection('deliveries').updateOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id }, { $push: { proof: proofItem }, $set: { updatedAt: new Date().toISOString() } });
    const doc = await db.collection('deliveries').findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
    const io = req.app.get('socketio');
    if (io) io.emit('delivery_updated', doc);
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
    const io = req.app.get('socketio');
    if (io) io.emit('delivery_updated', doc);
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
    const drivers = await db.collection('driver_profiles').find({}).toArray();
    
    // Map drivers to delivery boy schema
    const mappedDrivers = drivers.map(d => ({
      _id: d._id,
      name: d.fullName,
      phone: d.phone || '',
      isDriver: true,
      createdAt: d.createdAt
    }));

    // Merge without duplicates by ID or phone
    const merged = [...docs];
    mappedDrivers.forEach(d => {
      if (!merged.some(x => String(x._id) === String(d._id) || (x.phone && d.phone && x.phone === d.phone))) {
        merged.push(d);
      }
    });

    return res.json(merged);
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

// Helper for local offline barcode rendering
function generateBarcodeBuffer(code, type) {
  return new Promise((resolve, reject) => {
    const formatType = type === 'qr' ? 'qrcode' : 'code128';
    bwipjs.toBuffer({
      bcid: formatType,
      text: code,
      scale: 3,
      height: type === 'qr' ? 50 : 15,
      includetext: false,
    }, (err, png) => {
      if (err) reject(err);
      else resolve(png);
    });
  });
}

// Generate barcode labels PDF. Query params: ids=comma,separated
async function generateBarcodesPDF(req, res) {
  try {
    const db = getDB();
    const ids = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
    const qtys = (req.query.qtys || '').split(',').map(s => parseInt(s.trim(), 10) || 1);
    const format = req.query.format || 'qr';
    const size = req.query.size || 'standard';

    const q = {};
    if (ids.length) q._id = { $in: ids.map(id => ObjectId.isValid(id) ? new ObjectId(id) : id) };
    const items = await db.collection('barcodes').find(q).limit(500).toArray();

    // Map database order to match the request ids list
    const itemsMap = {};
    items.forEach(it => {
      itemsMap[it._id.toString()] = it;
    });

    const orderedItems = [];
    ids.forEach((id, idx) => {
      const it = itemsMap[id];
      if (it) {
        const qty = qtys[idx] !== undefined ? qtys[idx] : 1;
        for (let c = 0; c < qty; c++) {
          orderedItems.push(it);
        }
      }
    });

    // Fallback in case no ids were requested
    const finalItems = orderedItems.length ? orderedItems : items;

    // Load setting details for currency symbol
    const settings = await db.collection('settings').findOne({});
    const currency = settings?.currency || 'INR (₹)';
    const match = currency.match(/\((.*?)\)/);
    const symbol = match ? match[1] : '₹';

    // Load products to fetch Name, Price, and SKU
    const productIds = finalItems.map(it => it.productId).filter(Boolean);
    const products = await db.collection('products').find({
      $or: [
        { id: { $in: productIds } },
        { _id: { $in: productIds.map(pid => ObjectId.isValid(pid) ? new ObjectId(pid) : pid) } }
      ]
    }).toArray();

    const productMap = {};
    products.forEach(p => {
      const key = (p.id || p._id || '').toString();
      productMap[key] = p;
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="barcode_labels.pdf"');

    const doc = new PDFDocument({ autoFirstPage: false });
    doc.pipe(res);

    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 30;

    let cols = 3;
    let rowH = 120;
    if (size === 'small') {
      cols = 4;
      rowH = 80;
    } else if (size === 'large') {
      cols = 2;
      rowH = 180;
    }
    const colW = (pageWidth - margin * 2) / cols;

    let x = margin, y = margin;
    doc.addPage({ size: [pageWidth, pageHeight] });

    for (let i = 0; i < finalItems.length; i++) {
      const it = finalItems[i];
      const prod = productMap[it.productId || ''] || {};
      const name = prod.name || 'Generic Label';
      const sku = prod.sku || '';
      const price = prod.price !== undefined ? `${symbol}${prod.price}` : '';

      // draw box with rounded corners
      doc.rect(x, y, colW - 8, rowH - 8).lineWidth(0.5).strokeColor('#bbbbbb').stroke();

      // local generation of barcode PNG buffer
      let imgBuf;
      try {
        imgBuf = await generateBarcodeBuffer(it.code, format);
      } catch (err) {
        console.error('generateBarcodeBuffer error', err);
      }

      const isSmall = size === 'small';
      const isLarge = size === 'large';

      const drawW = isSmall
        ? (format === 'qr' ? 36 : 45)
        : (isLarge ? (format === 'qr' ? 90 : 115) : (format === 'qr' ? 60 : 70));
      const drawH = isSmall
        ? (format === 'qr' ? 36 : 18)
        : (isLarge ? (format === 'qr' ? 90 : 45) : (format === 'qr' ? 60 : 30));

      if (imgBuf) {
        const imgY = y + (rowH - 8 - drawH) / 2;
        doc.image(imgBuf, x + 6, imgY, { width: drawW, height: drawH });
      }

      // Metadata layout on the right side
      const textX = x + 10 + drawW;
      const textW = colW - 16 - drawW;
      let textY = y + 8;

      const lines = [];
      if (req.query.includeName !== 'false') lines.push({ text: name, bold: true, size: isSmall ? 7 : (isLarge ? 11 : 9) });
      if (req.query.includeSku !== 'false' && sku) lines.push({ text: `SKU: ${sku}`, size: isSmall ? 6 : (isLarge ? 9 : 8) });
      if (req.query.includeText !== 'false') lines.push({ text: it.code, font: 'Courier', size: isSmall ? 7 : (isLarge ? 10 : 8) });
      if (req.query.includePrice !== 'false' && price) lines.push({ text: price, bold: true, size: isSmall ? 7 : (isLarge ? 11 : 9) });

      lines.forEach(line => {
        doc.fontSize(line.size);
        if (line.bold) {
          doc.font('Helvetica-Bold');
        } else if (line.font === 'Courier') {
          doc.font('Courier-Bold');
        } else {
          doc.font('Helvetica');
        }
        doc.fillColor('#111111').text(line.text, textX, textY, { width: textW, height: line.size + 2, ellipsis: true });
        textY += line.size + (isSmall ? 2 : 4);
      });

      x += colW;
      if ((i + 1) % cols === 0) {
        x = margin;
        y += rowH;
      }
      if (y + rowH > pageHeight - margin && (i + 1) < finalItems.length) {
        doc.addPage();
        x = margin; y = margin;
      }
    }

    doc.end();
  } catch (err) {
    console.error('generateBarcodesPDF', err);
    if (!res.headersSent) {
      return res.status(500).json({ status: 'error', message: err.message });
    }
  }
}

async function renderBarcodeImage(req, res) {
  try {
    const { code, type } = req.query;
    if (!code) {
      return res.status(400).json({ status: 'error', message: 'Missing code parameter' });
    }
    const formatType = type === 'qr' ? 'qrcode' : 'code128';

    const png = await new Promise((resolve, reject) => {
      bwipjs.toBuffer({
        bcid: formatType,
        text: code,
        scale: 3,
        height: type === 'qr' ? 50 : 15,
        includetext: type !== 'qr' && req.query.includetext !== 'false',
        textxalign: 'center',
      }, function (err, buf) {
        if (err) reject(err);
        else resolve(buf);
      });
    });

    res.setHeader('Content-Type', 'image/png');
    return res.send(png);
  } catch (err) {
    console.error('renderBarcodeImage', err);
    if (!res.headersSent) {
      return res.status(500).json({ status: 'error', message: err.message });
    }
  }
}

// Third-party delivery integrations (Shiprocket, Delhivery, Dunzo)

async function createThirdPartyShipment(req, res) {
  try {
    const db = getDB();
    const id = req.params.id;
    const doc = await db.collection('deliveries').findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
    if (!doc) return res.status(404).json({ status: 'error', message: 'Delivery not found' });

    if (doc.thirdPartyTrackingId) {
      return res.json({ status: 'success', trackingId: doc.thirdPartyTrackingId, delivery: doc });
    }

    const partner = String(doc.partner || 'shiprocket').toLowerCase();

    if (partner === 'shiprocket') {
      try {
        const result = await shiprocketService.createShiprocketOrder(doc);
        
        await db.collection('deliveries').updateOne(
          { _id: doc._id },
          { 
            $set: { 
              thirdPartyTrackingId: result.awbCode, 
              shiprocketOrderId: result.shiprocketOrderId,
              shiprocketShipmentId: result.shipmentId,
              status: 'Manifested',
              updatedAt: new Date().toISOString() 
            } 
          }
        );

        const updated = await db.collection('deliveries').findOne({ _id: doc._id });
        return res.json({ status: 'success', trackingId: result.awbCode, delivery: updated });
      } catch (err) {
        console.error('Shiprocket order creation failed:', err.message);
        return res.status(400).json({ 
          status: 'error', 
          message: `Shiprocket dispatch failed: ${err.message}. Please configure valid Shiprocket credentials in Settings or assign an In-House Driver.` 
        });
      }
    }

    // Existing stub behavior for other partners (delhivery, dunzo)
    let trackingId = '';
    let initialStatus = 'pending_partner_pickup';

    const randNum = Math.floor(100000 + Math.random() * 900000);
    if (partner === 'delhivery') {
      trackingId = `DLV-${randNum}`;
      initialStatus = 'Booked';
    } else if (partner === 'dunzo') {
      trackingId = `DNZ-${randNum}`;
      initialStatus = 'Partner Assigned';
    } else {
      trackingId = `3PL-${randNum}`;
      initialStatus = 'Manifested';
    }

    await db.collection('deliveries').updateOne(
      { _id: doc._id },
      { 
        $set: { 
          thirdPartyTrackingId: trackingId, 
          status: initialStatus,
          updatedAt: new Date().toISOString() 
        } 
      }
    );

    const updated = await db.collection('deliveries').findOne({ _id: doc._id });
    return res.json({ status: 'success', trackingId, delivery: updated });
  } catch (err) {
    console.error('createThirdPartyShipment', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function cancelThirdPartyShipment(req, res) {
  try {
    const db = getDB();
    const id = req.params.id;
    const doc = await db.collection('deliveries').findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
    if (!doc) return res.status(404).json({ status: 'error', message: 'Delivery not found' });

    const statusStr = (doc.status || '').toLowerCase();
    if (statusStr === 'delivered') {
      return res.status(400).json({ status: 'error', message: 'Cannot cancel a delivered shipment' });
    }

    const partner = String(doc.partner || 'shiprocket').toLowerCase();
    if (partner === 'shiprocket' && doc.shiprocketOrderId) {
      try {
        await shiprocketService.cancelShiprocketOrder(doc.shiprocketOrderId);
      } catch (err) {
        console.error('Shiprocket order cancellation failed:', err.message);
      }
    }

    await db.collection('deliveries').updateOne(
      { _id: doc._id },
      { 
        $set: { 
          status: 'cancelled', 
          updatedAt: new Date().toISOString() 
        } 
      }
    );

    const updated = await db.collection('deliveries').findOne({ _id: doc._id });
    return res.json({ status: 'success', delivery: updated });
  } catch (err) {
    console.error('cancelThirdPartyShipment', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

function getNext3PLStatus(partner, currentStatus) {
  const p = String(partner || 'shiprocket').toLowerCase();
  const c = String(currentStatus || '').toLowerCase();

  if (p === 'shiprocket') {
    if (c === 'pending_partner_pickup') return 'Manifested';
    if (c === 'manifested') return 'In Transit';
    if (c === 'in transit') return 'Out for Delivery';
    if (c === 'out for delivery') return 'Delivered';
  } else if (p === 'delhivery') {
    if (c === 'pending_partner_pickup') return 'Booked';
    if (c === 'booked') return 'Dispatched';
    if (c === 'dispatched') return 'Arrived at Hub';
    if (c === 'arrived at hub') return 'Out for Delivery';
    if (c === 'out for delivery') return 'Delivered';
  } else if (p === 'dunzo') {
    if (c === 'pending_partner_pickup') return 'Partner Assigned';
    if (c === 'partner assigned') return 'Partner at Store';
    if (c === 'partner at store') return 'Order Picked Up';
    if (c === 'order picked up') return 'In Transit';
    if (c === 'in transit') return 'Delivered';
  }

  // fallback/already completed
  return currentStatus;
}

function buildTrackingTimeline(partner, status, dates = {}) {
  const p = String(partner || 'shiprocket').toLowerCase();
  const c = String(status || '').toLowerCase();

  const createdStr = dates.createdAt || new Date(Date.now() - 3600 * 1000).toISOString();
  const updatedStr = dates.updatedAt || new Date().toISOString();

  const timeline = [];

  if (p === 'shiprocket') {
    const steps = [
      { key: 'manifested', status: 'Manifested', desc: 'Shipment info received by carrier', loc: 'Delhi Hub' },
      { key: 'in transit', status: 'In Transit', desc: 'Shipment is in transit to destination', loc: 'National Highway' },
      { key: 'out for delivery', status: 'Out for Delivery', desc: 'Courier out for delivery', loc: 'Local Center' },
      { key: 'delivered', status: 'Delivered', desc: 'Delivered successfully to customer', loc: 'Customer Doorstep' }
    ];
    let matched = false;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].status.toLowerCase() === c || matched) {
        matched = true;
        timeline.unshift({
          ...steps[i],
          time: i === 0 ? createdStr : updatedStr
        });
      }
    }
  } else if (p === 'delhivery') {
    const steps = [
      { key: 'booked', status: 'Booked', desc: 'Delhivery courier registered', loc: 'Hub Office' },
      { key: 'dispatched', status: 'Dispatched', desc: 'Package left hub office', loc: 'Transit Terminal' },
      { key: 'arrived at hub', status: 'Arrived at Hub', desc: 'Package arrived at city center', loc: 'City Depot' },
      { key: 'out for delivery', status: 'Out for Delivery', desc: 'Courier assigned for dispatch', loc: 'Delivery Unit' },
      { key: 'delivered', status: 'Delivered', desc: 'Package successfully delivered', loc: 'Receiver Addr' }
    ];
    let matched = false;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].status.toLowerCase() === c || matched) {
        matched = true;
        timeline.unshift({
          ...steps[i],
          time: i === 0 ? createdStr : updatedStr
        });
      }
    }
  } else if (p === 'dunzo') {
    const steps = [
      { key: 'partner assigned', status: 'Partner Assigned', desc: 'Dunzo partner matched to order', loc: 'Store area' },
      { key: 'partner at store', status: 'Partner at Store', desc: 'Dunzo runner arrived at storefront', loc: 'Merchant Store' },
      { key: 'order picked up', status: 'Order Picked Up', desc: 'Package received by runner', loc: 'Transit route' },
      { key: 'in transit', status: 'In Transit', desc: 'Runner in transit to destination', loc: 'Street' },
      { key: 'delivered', status: 'Delivered', desc: 'Order drop-off confirmed', loc: 'Customer Addr' }
    ];
    let matched = false;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].status.toLowerCase() === c || matched) {
        matched = true;
        timeline.unshift({
          ...steps[i],
          time: i === 0 ? createdStr : updatedStr
        });
      }
    }
  }

  // fallback default
  if (timeline.length === 0) {
    timeline.push({
      status: status,
      desc: 'Order state updated',
      loc: 'System log',
      time: updatedStr
    });
  }

  return timeline;
}

async function trackThirdPartyShipment(req, res) {
  try {
    const db = getDB();
    const id = req.params.id;
    const doc = await db.collection('deliveries').findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
    if (!doc) return res.status(404).json({ status: 'error', message: 'Delivery not found' });

    if (doc.partner === 'in-house') {
      return res.json({
        status: 'success',
        partner: 'in-house',
        currentStatus: doc.status,
        timeline: [{ status: doc.status, desc: 'In-house delivery boy tracking', loc: 'Local', time: doc.updatedAt }]
      });
    }

    const partner = String(doc.partner || 'shiprocket').toLowerCase();

    if (partner === 'shiprocket' && doc.thirdPartyTrackingId) {
      try {
        const trackResult = await shiprocketService.trackShiprocketOrder(doc.thirdPartyTrackingId);
        
        await db.collection('deliveries').updateOne(
          { _id: doc._id },
          { 
            $set: { 
              status: trackResult.status,
              updatedAt: new Date().toISOString() 
            } 
          }
        );
        
        if (doc.status !== trackResult.status) {
          doc.status = trackResult.status;
          doc.updatedAt = new Date().toISOString();
          const io = req.app.get('socketio');
          if (io) io.emit('delivery_updated', doc);
        }

        return res.json({
          status: 'success',
          trackingId: doc.thirdPartyTrackingId,
          partner: 'shiprocket',
          currentStatus: trackResult.status,
          timeline: trackResult.timeline
        });
      } catch (err) {
        console.warn('Shiprocket tracking failed, falling back to simulated status:', err.message);
      }
    }

    // Simulated status advancement fallback (for Delhivery, Dunzo, or failing Shiprocket)
    const currentStatus = doc.status || 'pending_partner_pickup';
    const nextStatus = getNext3PLStatus(doc.partner, currentStatus);

    if (nextStatus !== currentStatus) {
      await db.collection('deliveries').updateOne(
        { _id: doc._id },
        { 
          $set: { 
            status: nextStatus,
            updatedAt: new Date().toISOString() 
          } 
        }
      );
      doc.status = nextStatus;
      doc.updatedAt = new Date().toISOString();
      const io = req.app.get('socketio');
      if (io) io.emit('delivery_updated', doc);
    }

    const timeline = buildTrackingTimeline(doc.partner, doc.status, { createdAt: doc.createdAt, updatedAt: doc.updatedAt });

    return res.json({
      status: 'success',
      trackingId: doc.thirdPartyTrackingId || `${doc.partner.toUpperCase()}-STUB`,
      partner: doc.partner,
      currentStatus: doc.status,
      timeline
    });
  } catch (err) {
    console.error('trackThirdPartyShipment', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function generateThirdPartyLabel(req, res) {
  try {
    const db = getDB();
    const id = req.params.id;
    const doc = await db.collection('deliveries').findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
    if (!doc) return res.status(404).json({ status: 'error', message: 'Delivery not found' });

    const partner = String(doc.partner || 'shiprocket').toLowerCase();

    if (partner === 'shiprocket' && doc.shiprocketShipmentId) {
      try {
        const labelUrl = await shiprocketService.getShiprocketLabel(doc.shiprocketShipmentId);
        const pdfResp = await fetch(labelUrl);
        if (pdfResp.ok) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="shipping_label_${doc.orderId}.pdf"`);
          const arrayBuffer = await pdfResp.arrayBuffer();
          return res.send(Buffer.from(arrayBuffer));
        } else {
          console.warn(`Failed to fetch label PDF from URL: ${labelUrl}`);
        }
      } catch (err) {
        console.warn('Shiprocket label generation failed, falling back to local layout:', err.message);
      }
    }

    // Default local simulated PDF generation using pdfkit
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="shipping_label_${doc.orderId}.pdf"`);

    const PDFDocument = require('pdfkit');
    const pdf = new PDFDocument({ size: [288, 432], margin: 18 }); // 4x6 inch label
    pdf.pipe(res);

    // Frame Border
    pdf.rect(10, 10, 268, 412).stroke();

    // Carrier Header
    const carrierName = String(doc.partner || 'Shiprocket').toUpperCase();
    pdf.fontSize(14).font('Helvetica-Bold').text(carrierName, 18, 22, { align: 'center' });
    pdf.moveTo(10, 42).lineTo(278, 42).stroke();

    // Barcode Area simulation (draw clean lines)
    pdf.fontSize(8).font('Helvetica').text('TRACKING NUMBER / BARCODE', 18, 52, { align: 'center' });
    let xOffset = 30;
    const linesPattern = [1, 3, 2, 1, 4, 2, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 3, 1, 2, 4, 1, 3, 2, 1];
    linesPattern.forEach((w, idx) => {
      pdf.rect(xOffset, 66, w, 36).fill('#000000');
      xOffset += w + 2;
    });

    const trackingNumber = doc.thirdPartyTrackingId || doc.orderId || 'PENDING-DISPATCH';
    pdf.fillColor('#000000').fontSize(10).font('Helvetica-Bold').text(trackingNumber, 18, 108, { align: 'center' });
    pdf.moveTo(10, 124).lineTo(278, 124).stroke();

    // Sender Block
    pdf.fontSize(8).font('Helvetica-Bold').text('SENDER / FROM:', 18, 134);
    pdf.font('Helvetica').text('Vypar Admin Premium Store\nMG Road Main Hub, Indiranagar\nBengaluru, KA, 560038\nPhone: 9876543210', 18, 146);
    pdf.moveTo(10, 194).lineTo(278, 194).stroke();

    // Receiver Block
    pdf.fontSize(8).font('Helvetica-Bold').text('DELIVER TO / SHIP TO:', 18, 204);
    const receiverName = doc.customer?.name || doc.customerName || 'Customer';
    const receiverPhone = doc.customer?.phone || doc.customerPhone || 'N/A';
    const receiverAddr = doc.customer?.address || doc.deliveryAddress || 'No Address Specified';
    pdf.fontSize(10).font('Helvetica-Bold').text(receiverName, 18, 216);
    pdf.fontSize(9).font('Helvetica').text(`Phone: ${receiverPhone}\nAddress: ${receiverAddr}`, 18, 230, { width: 250 });
    pdf.moveTo(10, 314).lineTo(278, 314).stroke();

    // Package Details Block
    pdf.fontSize(8).font('Helvetica-Bold').text('ORDER DETAILS:', 18, 324);
    pdf.font('Helvetica').text(`Order ID: ${doc.orderId || doc._id}\nPayment Type: ${doc.paymentType || 'COD'}\nBill Amount: INR ${doc.billAmount || doc.charges || 0}`, 18, 336);

    // COD/Prepaid Box Badge
    pdf.rect(178, 328, 90, 40).stroke();
    pdf.fontSize(12).font('Helvetica-Bold').text(doc.paymentType === 'COD' ? 'C.O.D.' : 'PREPAID', 178, 342, { width: 90, align: 'center' });

    pdf.fontSize(8).font('Helvetica-Oblique').text('Powered by Vypar 2.0 Logistics Engine', 18, 394, { align: 'center' });

    pdf.end();
  } catch (err) {
    console.error('generateThirdPartyLabel', err);
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: err.message });
    }
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
  generateBarcodesPDF,
  renderBarcodeImage,
  createThirdPartyShipment,
  cancelThirdPartyShipment,
  trackThirdPartyShipment,
  generateThirdPartyLabel,
  getNext3PLStatus
};
