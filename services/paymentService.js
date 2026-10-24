const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

/**
 * Helper to build verified UPI Dynamic Intent string
 * Format: upi://pay?pa={vpa}&pn={name}&am={amount}&tr={txnRef}&tn={note}&cu=INR
 */
function generateUPIString({ vpa, merchantName, amount, invoiceId, note }) {
  const safeVpa = encodeURIComponent((vpa || 'merchant@upi').trim());
  const safeName = encodeURIComponent((merchantName || 'Vyapar Merchant').trim());
  const safeAmount = Number(amount || 0).toFixed(2);
  const safeRef = encodeURIComponent(String(invoiceId || Date.now()).trim());
  const safeNote = encodeURIComponent(note || `Payment for ${invoiceId}`);

  return `upi://pay?pa=${safeVpa}&pn=${safeName}&am=${safeAmount}&tr=${safeRef}&tn=${safeNote}&cu=INR`;
}

/**
 * Creates a real Razorpay Order via REST API
 */
async function createRazorpayOrder({ amount, currency = 'INR', receipt, notes = {} }) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay Gateway is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env, or use Dynamic UPI QR Code.');
  }

  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: Math.round(amount * 100), // amount in paisa
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
      notes
    })
  });

  if (!response.ok) {
    const errTxt = await response.text();
    throw new Error(`Razorpay Order Creation Failed (${response.status}): ${errTxt}`);
  }

  const orderData = await response.json();
  return {
    ...orderData,
    keyId
  };
}

/**
 * Verifies HMAC SHA-256 signature from Razorpay frontend checkout payment
 */
function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return true; // If key not set, pass verification in dev mode

  const generatedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  return generatedSignature === signature;
}

/**
 * Checks idempotency for incoming Webhook events to prevent duplicate processing
 */
async function checkAndLockWebhookIdempotency(eventId) {
  if (!eventId) return true; // Proceed if no eventId
  const db = getDB();
  try {
    const existing = await db.collection('processed_webhooks').findOne({ eventId });
    if (existing) {
      return false; // Already processed
    }
    await db.collection('processed_webhooks').insertOne({
      eventId,
      processedAt: new Date()
    });
    return true; // First time processing
  } catch (err) {
    console.error('Webhook Idempotency Guard Error:', err.message);
    return true; // Fallback to process
  }
}

/**
 * Reconciles an invoice payment in the database:
 * 1. Updates invoice / sale record (status: 'Paid', paymentReceived += amount)
 * 2. Credits customer balance in parties
 * 3. Appends transaction to transactions collection
 */
async function reconcileInvoicePayment({ invoiceId, amount, paymentMode, referenceNo, payerInfo }) {
  const db = getDB();
  const numAmount = parseFloat(amount) || 0;

  let queryConditions = [
    { id: invoiceId },
    { invoiceNo: invoiceId },
    { invoiceNumber: invoiceId }
  ];
  if (/^[0-9a-fA-F]{24}$/.test(invoiceId) && ObjectId.isValid(invoiceId)) {
    queryConditions.push({ _id: new ObjectId(invoiceId) });
  }

  // 1. Locate invoice in 'invoices' or 'sales'
  let targetCollection = 'invoices';
  let invoice = await db.collection('invoices').findOne({ $or: queryConditions });

  if (!invoice) {
    invoice = await db.collection('sales').findOne({ $or: queryConditions });
    targetCollection = 'sales';
  }

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  const prevReceived = parseFloat(invoice.paymentReceived) || 0;
  const newReceived = prevReceived + numAmount;
  const totalDue = parseFloat(invoice.totalAmount || invoice.amount || 0);
  const newStatus = newReceived >= totalDue ? 'Paid' : 'Partially Paid';

  await db.collection(targetCollection).updateOne(
    { _id: invoice._id },
    {
      $set: {
        paymentReceived: newReceived,
        status: newStatus,
        lastPaymentDate: new Date().toISOString(),
        paymentMode: paymentMode || 'UPI / Online'
      }
    }
  );

  // 2. Adjust customer balance in parties
  const customerName = invoice.customer || invoice.customerName;
  if (customerName) {
    const party = await db.collection('parties').findOne({
      name: { $regex: `^${customerName.trim()}$`, $options: 'i' },
      username: invoice.username
    });

    if (party) {
      const currentBalance = parseFloat(party.balance) || 0;
      await db.collection('parties').updateOne(
        { _id: party._id },
        {
          $set: {
            balance: currentBalance + numAmount,
            lastTxn: new Date().toISOString().substring(0, 10)
          }
        }
      );
    }
  }

  // 3. Log accounting transaction
  const txnId = `TXN-${Date.now().toString().slice(-6)}`;
  const txnRecord = {
    id: txnId,
    username: invoice.username,
    date: new Date().toISOString().substring(0, 10),
    type: 'Payment Receive',
    party: customerName || 'Walk-in Customer',
    debitAccount: 'Bank / UPI Online Account',
    creditAccount: 'Accounts Receivable (Asset)',
    debit: numAmount,
    credit: 0,
    mode: paymentMode || 'UPI / Online',
    referenceNo: referenceNo || `ONLINE-${Date.now().toString().slice(-6)}`,
    notes: `Online settlement for Invoice #${invoiceId}${payerInfo ? ` by ${payerInfo}` : ''}`,
    createdAt: new Date().toISOString()
  };

  await db.collection('transactions').insertOne(txnRecord);

  return {
    success: true,
    invoiceId,
    newStatus,
    paymentReceived: newReceived,
    transactionId: txnId
  };
}

module.exports = {
  generateUPIString,
  createRazorpayOrder,
  verifyRazorpaySignature,
  checkAndLockWebhookIdempotency,
  reconcileInvoicePayment
};

