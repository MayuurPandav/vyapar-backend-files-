const express = require('express');
const router = express.Router();
const { getDB } = require('../config/db');
const {
  generateUPIString,
  createRazorpayOrder,
  verifyRazorpaySignature,
  checkAndLockWebhookIdempotency,
  reconcileInvoicePayment
} = require('../services/paymentService');

// 1. Public endpoint to view invoice details for payment
router.get('/public/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const db = getDB();

    const { ObjectId } = require('mongodb');
    const queryConditions = [
      { id: invoiceId },
      { invoiceNo: invoiceId },
      { invoiceNumber: invoiceId }
    ];
    if (/^[0-9a-fA-F]{24}$/.test(invoiceId) && ObjectId.isValid(invoiceId)) {
      queryConditions.push({ _id: new ObjectId(invoiceId) });
    }

    let sale = await db.collection('invoices').findOne({
      $or: queryConditions
    });
    if (!sale) {
      sale = await db.collection('sales').findOne({
        $or: queryConditions
      });
    }

    if (!sale) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found' });
    }

    // Retrieve shop profile for UPI ID and business name
    const shop = await db.collection('shop_profiles').findOne({ username: sale.username }) 
              || await db.collection('settings').findOne({ username: sale.username }) 
              || {};

    const merchantVpa = shop.upiId || shop.upi_id || process.env.DEFAULT_UPI_ID || 'mayurpandav128@okhdfcbank';
    const merchantName = shop.shopName || shop.businessName || 'Vyapar Store';

    const totalAmount = parseFloat(sale.totalAmount || sale.amount || 0);
    const paymentReceived = parseFloat(sale.paymentReceived) || 0;
    const dueAmount = Math.max(0, totalAmount - paymentReceived);
    const invoiceDisplayId = sale.invoiceNumber || sale.invoiceNo || sale.id;

    const upiString = generateUPIString({
      vpa: merchantVpa,
      merchantName,
      amount: dueAmount,
      invoiceId: invoiceDisplayId,
      note: `Payment for #${invoiceDisplayId}`
    });

    // Optionally attempt to pre-create Razorpay Order if key is available
    let razorpayOrder = null;
    try {
      if (dueAmount > 0) {
        razorpayOrder = await createRazorpayOrder({
          amount: dueAmount,
          receipt: `rcpt_${invoiceDisplayId}`,
          notes: { invoiceId: invoiceDisplayId, username: sale.username }
        });
      }
    } catch (rzpErr) {
      console.warn('[PUBLIC INVOICE] Razorpay order creation notice:', rzpErr.message);
    }

    return res.json({
      status: 'ok',
      invoice: {
        id: invoiceDisplayId,
        rawId: sale.id || sale._id,
        date: sale.date || sale.createdAt,
        dueDate: sale.dueDate,
        customer: sale.customer || sale.customerName,
        customerPhone: sale.customerPhone || sale.phone,
        items: sale.items || sale.selectedItems || [],
        totalAmount,
        paymentReceived,
        dueAmount,
        status: sale.status || (dueAmount <= 0 ? 'Paid' : 'Pending')
      },
      merchant: {
        name: merchantName,
        upiId: merchantVpa,
        phone: shop.phone || shop.contactPhone
      },
      payment: {
        upiString,
        qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(upiString)}`,
        razorpayOrder
      }
    });
  } catch (err) {
    console.error('Error fetching public invoice payment:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 2. Create Razorpay Gateway Order Endpoint
router.post('/create-order', async (req, res) => {
  try {
    const { amount, invoiceId, currency = 'INR', notes = {} } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ status: 'error', message: 'Valid amount is required' });
    }

    const order = await createRazorpayOrder({
      amount: parseFloat(amount),
      currency,
      receipt: `rcpt_${invoiceId || Date.now()}`,
      notes: { ...notes, invoiceId }
    });

    return res.json({ status: 'ok', order });
  } catch (err) {
    console.error('Error creating payment order:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 3. Verify Payment Signature Endpoint (Called by frontend SDK after Razorpay popup succeeds)
router.post('/verify-signature', async (req, res) => {
  try {
    const { orderId, paymentId, signature, invoiceId, amount, payerInfo } = req.body;
    if (!orderId || !paymentId || !signature || !invoiceId) {
      return res.status(400).json({ status: 'error', message: 'orderId, paymentId, signature, and invoiceId are required' });
    }

    const isValid = verifyRazorpaySignature({ orderId, paymentId, signature });
    if (!isValid) {
      return res.status(400).json({ status: 'error', message: 'Invalid payment signature verification failed' });
    }

    // Reconcile payment automatically
    const result = await reconcileInvoicePayment({
      invoiceId,
      amount,
      paymentMode: 'Razorpay Gateway',
      referenceNo: paymentId,
      payerInfo
    });

    return res.json({
      status: 'ok',
      message: 'Payment verified and invoice reconciled successfully',
      result
    });
  } catch (err) {
    console.error('Error verifying payment signature:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 4. Generate Payment Link
router.post('/create-link', async (req, res) => {
  try {
    const { invoiceId, username } = req.body;
    if (!invoiceId) {
      return res.status(400).json({ status: 'error', message: 'Invoice ID is required' });
    }

    const db = getDB();
    const { ObjectId } = require('mongodb');
    const queryConditions = [
      { id: invoiceId },
      { invoiceNo: invoiceId },
      { invoiceNumber: invoiceId }
    ];
    if (/^[0-9a-fA-F]{24}$/.test(invoiceId) && ObjectId.isValid(invoiceId)) {
      queryConditions.push({ _id: new ObjectId(invoiceId) });
    }

    const query = { $or: queryConditions };
    if (username) query.username = username;

    let sale = await db.collection('invoices').findOne(query);
    if (!sale) {
      sale = await db.collection('sales').findOne(query);
    }
    if (!sale) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found' });
    }

    const shop = await db.collection('shop_profiles').findOne({ username: sale.username }) 
              || await db.collection('settings').findOne({ username: sale.username }) 
              || {};
    const merchantVpa = shop.upiId || shop.upi_id || process.env.DEFAULT_UPI_ID || 'mayurpandav128@okhdfcbank';
    const merchantName = shop.shopName || 'Vyapar Store';

    const total = parseFloat(sale.totalAmount || sale.amount || 0);
    const received = parseFloat(sale.paymentReceived) || 0;
    const dueAmount = Math.max(0, total - received);
    const invoiceDisplayId = sale.invoiceNumber || sale.invoiceNo || sale.id;

    const upiString = generateUPIString({
      vpa: merchantVpa,
      merchantName,
      amount: dueAmount,
      invoiceId: invoiceDisplayId,
      note: `Bill #${invoiceDisplayId}`
    });

    const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : 'http://localhost:5173');
    const publicUrl = `${origin}/pay/${encodeURIComponent(sale.id || invoiceDisplayId)}`;

    return res.json({
      status: 'ok',
      paymentLink: publicUrl,
      upiString,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(upiString)}`,
      dueAmount
    });
  } catch (err) {
    console.error('Error creating payment link:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 5. Confirm manual/online payment (from customer checkout page or fallback)
router.post('/confirm', async (req, res) => {
  try {
    const { invoiceId, amount, paymentMode, referenceNo, payerInfo } = req.body;
    if (!invoiceId || !amount) {
      return res.status(400).json({ status: 'error', message: 'Invoice ID and Amount are required' });
    }

    const result = await reconcileInvoicePayment({
      invoiceId,
      amount,
      paymentMode: paymentMode || 'UPI / Online Transfer',
      referenceNo: referenceNo || `UPI-${Date.now().toString().slice(-6)}`,
      payerInfo
    });

    return res.json({
      status: 'ok',
      message: 'Payment recorded and invoice marked as paid successfully',
      result
    });
  } catch (err) {
    console.error('Error confirming payment:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 6. Idempotent Webhook listener for Payment Gateways (Razorpay / Stripe)
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body || {};
    const eventId = event.event_id || event.id || (event.payload?.payment?.entity?.id ? `evt_${event.payload.payment.entity.id}` : null);

    console.log('[PAYMENT WEBHOOK RECEIVED]:', event.event || event.type || 'generic_event', 'EventId:', eventId);

    // Enforce idempotency check
    if (eventId) {
      const isFirstTime = await checkAndLockWebhookIdempotency(eventId);
      if (!isFirstTime) {
        console.log(`[WEBHOOK IDEMPOTENCY] Event ${eventId} already processed. Skipping.`);
        return res.json({ status: 'ok', note: 'Event already processed' });
      }
    }

    // Handle Razorpay payment.captured event
    if (event.event === 'payment.captured' && event.payload?.payment?.entity) {
      const p = event.payload.payment.entity;
      const invoiceId = p.notes?.invoiceId || p.description;
      const amount = (p.amount || 0) / 100; // Razorpay uses paisa

      if (invoiceId) {
        await reconcileInvoicePayment({
          invoiceId,
          amount,
          paymentMode: 'Razorpay Online Webhook',
          referenceNo: p.id,
          payerInfo: p.email || p.contact
        });
      }
    }

    // Handle Stripe checkout.session.completed event
    if (event.type === 'checkout.session.completed' && event.data?.object) {
      const s = event.data.object;
      const invoiceId = s.client_reference_id || s.metadata?.invoiceId;
      const amount = (s.amount_total || 0) / 100;

      if (invoiceId) {
        await reconcileInvoicePayment({
          invoiceId,
          amount,
          paymentMode: 'Stripe Online Webhook',
          referenceNo: s.id,
          payerInfo: s.customer_details?.email
        });
      }
    }

    return res.json({ status: 'ok', received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;

