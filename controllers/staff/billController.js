const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const Bill = require('../../models/staff/Bill');
const Product = require('../../models/staff/Product');
const Customer = require('../../models/staff/Customer');

// Accountant Mongoose Models for Syncing
const Ledger = require('../../models/accountant/Ledger');
const JournalEntry = require('../../models/accountant/JournalEntry');
const AccountantInvoice = require('../../models/accountant/Invoice');
const AccountantCustomer = require('../../models/accountant/Customer');

// Sync trigger comments
// Get all bills with filters and pagination
const getAllBills = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 15;
  const keyword = req.query.search
    ? {
        $or: [
          { invoiceNumber: { $regex: req.query.search, $options: 'i' } },
          { customerName: { $regex: req.query.search, $options: 'i' } },
          { paymentMode: { $regex: req.query.search, $options: 'i' } },
        ],
      }
    : {};

  // Permission check: non-admins can only see their own bills unless they have canViewAllInvoices
  let filterQuery = keyword;
  if (!req.user.isAdmin && !req.user.permissions?.canViewAllInvoices) {
    filterQuery = { ...keyword, createdBy: req.user._id };
  }

  const count = await Bill.countDocuments(filterQuery);
  const bills = await Bill.find(filterQuery)
    .populate('customerId', 'name phone email')
    .populate('createdBy', 'name email')
    .sort({ billDate: -1 })
    .skip(limit * (page - 1))
    .limit(limit);

  res.json({ bills, page, pages: Math.ceil(count / limit), total: count });
});

// Get bill by ID
const getBillById = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id)
    .populate('customerId', 'name phone email address')
    .populate('products.productId', 'productName price sku')
    .populate('createdBy', 'name email');

  if (!bill) {
    res.status(404);
    throw new Error('Bill not found');
  }

  // Permission check: can only view own bills unless admin or has canViewAllInvoices
  if (!req.user.isAdmin && !req.user.permissions?.canViewAllInvoices && bill.createdBy._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to view this bill');
  }

  res.json(bill);
});

// Create new bill/invoice
const createBill = asyncHandler(async (req, res) => {
  const {
    invoiceNumber,
    type = 'sale',
    customerId,
    customerName,
    customerPhone = '',
    customerEmail = '',
    customerAddress = '',
    customerGSTIN = '',
    products,
    subtotal,
    itemLevelDiscountTotal = 0,
    discount = 0,
    discountPercent = 0,
    taxableTotal,
    cgst,
    sgst,
    igst = 0,
    additionalCharges = 0,
    chargeLabel = 'Delivery',
    roundOff = 0,
    totalAmount,
    paidAmount = 0,
    paymentMode = 'Cash',
    cashAmount = 0,
    cardAmount = 0,
    upiAmount = 0,
    upiRef = '',
    changeDue = 0,
    billDate = new Date(),
    dueDate,
    status = 'Completed',
    notes = '',
  } = req.body;

  // Validation
  if (!products || products.length === 0) {
    res.status(400);
    throw new Error('Bill must contain at least one product');
  }

  if (!customerName || !totalAmount) {
    res.status(400);
    throw new Error('Customer name and total amount are required');
  }

  // Permission check for discount
  const discountAmount = Number(discount || 0);
  if (discountAmount > 0 && !req.user.permissions?.canDiscount && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to apply discounts');
  }

  // Check product stock
  for (const item of products) {
    const product = await Product.findById(item.productId);
    if (product && product.stock < item.quantity) {
      res.status(400);
      throw new Error(`Insufficient stock for ${product.productName}`);
    }
  }

  const bill = new Bill({
    invoiceNumber: invoiceNumber || `INV-${Date.now().toString().slice(-8)}`,
    type,
    customerId: mongoose.Types.ObjectId.isValid(customerId) ? customerId : undefined,
    customerName,
    customerPhone,
    customerEmail,
    customerAddress,
    customerGSTIN,
    products,
    subtotal: Number(subtotal || 0),
    itemLevelDiscountTotal: Number(itemLevelDiscountTotal || 0),
    discount: discountAmount,
    discountPercent: isNaN(Number(discountPercent)) ? 0 : Number(discountPercent),
    taxableTotal: isNaN(Number(taxableTotal)) ? Math.max(0, Number(subtotal || 0) - discountAmount) : Number(taxableTotal),
    cgst: Number(cgst || 0),
    sgst: Number(sgst || 0),
    igst: Number(igst || 0),
    additionalCharges: Number(additionalCharges || 0),
    chargeLabel,
    roundOff: Number(roundOff || 0),
    totalAmount: Number(totalAmount || 0),
    paidAmount: Number(paidAmount || 0),
    dueAmount: Math.max(0, Number(totalAmount || 0) - Number(paidAmount || 0)),
    paymentMode,
    cashAmount: Number(cashAmount || 0),
    cardAmount: Number(cardAmount || 0),
    upiAmount: Number(upiAmount || 0),
    upiRef,
    changeDue: Number(changeDue || 0),
    billDate: new Date(billDate),
    dueDate: dueDate ? new Date(dueDate) : undefined,
    status,
    notes,
    createdBy: req.user._id,
  });

  const createdBill = await bill.save();

  // Update product stock
  for (const item of products) {
    await Product.findByIdAndUpdate(
      item.productId,
      { $inc: { stock: -item.quantity } },
      { new: true }
    );
  }

  // Update customer last purchase date and outstanding balance
  if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
    const dueAmt = Math.max(0, Number(totalAmount) - Number(paidAmount));
    await Customer.findByIdAndUpdate(
      customerId,
      { 
        lastPurchase: new Date(),
        $inc: { outstandingBalance: dueAmt }
      },
      { new: true }
    );
  }

  // Sync to Admin/Accountant ledgers
  try {
    const tenantUsername = req.user.email ? 'admin@' + req.user.email.split('@')[1] : 'admin@vyapar.com';
    const isCredit = (paymentMode || '').toLowerCase().includes('credit') || (Number(totalAmount) > Number(paidAmount) && Number(paidAmount) === 0);
    const invoiceType = (Number(cgst || 0) + Number(sgst || 0) + Number(igst || 0)) > 0 ? 'Sale Invoice (GST)' : 'Sale Invoice (Non-GST)';
    const invoiceDoc = {
      username: tenantUsername,
      id: createdBill.invoiceNumber || `INV-${Date.now()}`,
      invoiceNumber: createdBill.invoiceNumber,
      customer: customerName || 'Walk-in Customer',
      customerPhone: customerPhone,
      customerEmail: customerEmail,
      customerAddress: customerAddress,
      customerGSTIN: customerGSTIN,
      date: new Date(billDate).toISOString().substring(0, 10),
      dueDate: dueDate ? new Date(dueDate).toISOString().substring(0, 10) : new Date(billDate).toISOString().substring(0, 10),
      type: invoiceType,
      items: products.map(p => ({
        name: p.name,
        qty: p.quantity,
        rate: p.price,
        total: p.amount,
        sku: p.sku || '',
        hsn: p.hsn || 'N/A',
        taxRate: p.gstRate || 0,
        taxAmount: p.taxAmount || 0
      })),
      subtotal: Number(subtotal),
      taxAmount: Number(cgst || 0) + Number(sgst || 0) + Number(igst || 0),
      discount: Number(discount),
      totalAmount: Number(totalAmount),
      paymentReceived: Number(paidAmount),
      balanceDue: Math.max(0, Number(totalAmount) - Number(paidAmount)),
      paymentMode: paymentMode,
      upiRef: upiRef || '',
      notes: notes || '',
      status: Number(paidAmount) >= Number(totalAmount) ? 'Paid' : (Number(paidAmount) > 0 ? 'Partial' : 'Unpaid'),
      createdAt: new Date().toISOString().substring(0, 10)
    };

    const nativeDb = mongoose.connection.db;
    await nativeDb.collection('invoices').insertOne(invoiceDoc);

    // Create transaction in native collection
    const lastTxn = await nativeDb.collection('transactions').find({ username: tenantUsername }).sort({ _id: -1 }).limit(1).toArray();
    const lastBalance = lastTxn[0]?.balance || 0;
    const txnId = `TXN-${Date.now()}`;
    const credit = Number(totalAmount) || 0;
    const newTxn = {
      id: txnId,
      date: new Date(billDate).toISOString().substring(0,10),
      type: 'Sale',
      party: customerName || 'Walk-in Customer',
      debit: 0,
      credit,
      balance: lastBalance + credit,
      debitAccount: isCredit 
        ? 'Accounts Receivable (Asset)' 
        : ((paymentMode || '').toLowerCase().match(/bank|upi|card/) 
          ? 'Bank/UPI Account (Asset)' 
          : 'Cash in Hand (Asset)'),
      creditAccount: 'Sales Revenue (Income)',
      username: tenantUsername
    };
    await nativeDb.collection('transactions').insertOne(newTxn);

    // Create Accountant Customer, Invoice, JournalEntry and update Ledgers
    let customerObj = await AccountantCustomer.findOne({ name: customerName });
    if (!customerObj && customerName) {
      const mainParty = await nativeDb.collection('parties').findOne({ username: tenantUsername, name: customerName });
      customerObj = await AccountantCustomer.create({
        name: customerName,
        email: mainParty?.email || customerEmail || '',
        phone: mainParty?.phone || customerPhone || '',
        address: mainParty?.billingAddress || mainParty?.address || customerAddress || '',
        openingBalance: Number(mainParty?.balance) || 0
      });
    }

    await AccountantInvoice.create({
      invoiceNumber: createdBill.invoiceNumber,
      customer: customerObj ? customerObj._id : null,
      customerName: customerName || 'Walk-in Customer',
      amount: Number(totalAmount),
      dueDate: dueDate ? new Date(dueDate) : new Date(billDate),
      status: isCredit ? 'unpaid' : 'paid'
    });

    const cashLedger = await Ledger.findOne({ name: 'Cash' });
    const bankLedger = await Ledger.findOne({ name: 'Bank' });
    const arLedger = await Ledger.findOne({ name: 'Accounts Receivable' });
    const salesLedger = await Ledger.findOne({ name: 'Sales Revenue' }) || await Ledger.findOne({ name: 'Sales' });

    let debitLedger = cashLedger;
    if (isCredit) {
      debitLedger = arLedger;
    } else if ((paymentMode || '').toLowerCase().match(/bank|upi|card|online/)) {
      debitLedger = bankLedger;
    }

    if (debitLedger && salesLedger) {
      await JournalEntry.create({
        narration: `Sale Invoice ${createdBill.invoiceNumber} to ${customerName || 'Walk-in Customer'}`,
        entries: [
          { ledger: debitLedger._id, type: 'debit', amount: Number(totalAmount) },
          { ledger: salesLedger._id, type: 'credit', amount: Number(totalAmount) }
        ],
        date: new Date(billDate)
      });

      debitLedger.balance = (debitLedger.balance || 0) + Number(totalAmount);
      await debitLedger.save();

      salesLedger.balance = (salesLedger.balance || 0) + Number(totalAmount);
      await salesLedger.save();
    }

    if (isCredit && customerObj) {
      customerObj.openingBalance = (customerObj.openingBalance || 0) + Number(totalAmount);
      await customerObj.save();
    }
  } catch (acctErr) {
    console.error('Accountant / Admin sales sync failed:', acctErr.message || acctErr);
  }

  res.status(201).json(createdBill);

});

// Update bill
const updateBill = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id);

  if (!bill) {
    res.status(404);
    throw new Error('Bill not found');
  }

  // Permission check: can only update own bills unless admin
  if (!req.user.isAdmin && bill.createdBy.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to update this bill');
  }

  // Permission check for discount changes
  const newDiscount = req.body.discount ?? bill.discount;
  if (newDiscount > bill.discount && !req.user.permissions?.canDiscount && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to apply discounts');
  }

  // Update fields
  if (req.body.customerName) bill.customerName = req.body.customerName;
  if (req.body.customerPhone !== undefined) bill.customerPhone = req.body.customerPhone;
  if (req.body.customerEmail !== undefined) bill.customerEmail = req.body.customerEmail;
  if (req.body.customerAddress !== undefined) bill.customerAddress = req.body.customerAddress;
  if (req.body.customerGSTIN !== undefined) bill.customerGSTIN = req.body.customerGSTIN;
  if (req.body.products) bill.products = req.body.products;
  if (req.body.discount !== undefined) bill.discount = req.body.discount;
  if (req.body.discountPercent !== undefined) bill.discountPercent = req.body.discountPercent;
  if (req.body.totalAmount !== undefined) bill.totalAmount = req.body.totalAmount;
  if (req.body.paidAmount !== undefined) {
    bill.paidAmount = req.body.paidAmount;
    bill.dueAmount = Math.max(0, bill.totalAmount - req.body.paidAmount);
  }
  if (req.body.paymentMode) bill.paymentMode = req.body.paymentMode;
  if (req.body.status) bill.status = req.body.status;
  if (req.body.cashAmount !== undefined) bill.cashAmount = req.body.cashAmount;
  if (req.body.cardAmount !== undefined) bill.cardAmount = req.body.cardAmount;
  if (req.body.upiAmount !== undefined) bill.upiAmount = req.body.upiAmount;
  if (req.body.upiRef) bill.upiRef = req.body.upiRef;
  if (req.body.notes) bill.notes = req.body.notes;

  const updatedBill = await bill.save();
  res.json(updatedBill);
});

// Update payment for existing bill
const updatePayment = asyncHandler(async (req, res) => {
  const { paidAmount, paymentMode, cashAmount, cardAmount, upiAmount, upiRef } = req.body;

  const bill = await Bill.findById(req.params.id);
  if (!bill) {
    res.status(404);
    throw new Error('Bill not found');
  }

  // Permission check
  if (!req.user.isAdmin && bill.createdBy.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to update this bill');
  }

  // Update payment details
  if (paidAmount !== undefined) {
    bill.paidAmount = Number(paidAmount);
    bill.dueAmount = Math.max(0, bill.totalAmount - bill.paidAmount);
    bill.status = bill.paidAmount >= bill.totalAmount ? 'Completed' : 'Pending';
  }

  if (paymentMode) bill.paymentMode = paymentMode;
  if (cashAmount !== undefined) bill.cashAmount = Number(cashAmount);
  if (cardAmount !== undefined) bill.cardAmount = Number(cardAmount);
  if (upiAmount !== undefined) bill.upiAmount = Number(upiAmount);
  if (upiRef) bill.upiRef = upiRef;

  const updatedBill = await bill.save();
  res.json(updatedBill);
});

// Delete bill
const deleteBill = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id);

  if (!bill) {
    res.status(404);
    throw new Error('Bill not found');
  }

  // Only admin can delete
  if (!req.user.isAdmin) {
    res.status(403);
    throw new Error('Only admin can delete bills');
  }

  // Restore product stock
  for (const item of bill.products) {
    await Product.findByIdAndUpdate(
      item.productId,
      { $inc: { stock: item.quantity } },
      { new: true }
    );
  }

  await Bill.findByIdAndDelete(req.params.id);
  res.json({ message: 'Bill removed successfully' });
});

// Issue credit note / return bill
const issueCreditNote = asyncHandler(async (req, res) => {
  const { returnItems, reason = 'Return' } = req.body;

  const originalBill = await Bill.findById(req.params.id);
  if (!originalBill) {
    res.status(404);
    throw new Error('Original bill not found');
  }

  // Permission check
  if (!req.user.isAdmin && originalBill.createdBy.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to issue credit note');
  }

  if (!returnItems || returnItems.length === 0) {
    res.status(400);
    throw new Error('Must specify items to return');
  }

  // Calculate credit amount
  const creditAmount = returnItems.reduce((sum, item) => sum + item.amount, 0);

  // Create credit note bill
  const creditNote = new Bill({
    invoiceNumber: `CRN-${Date.now().toString().slice(-8)}`,
    type: 'credit',
    customerId: originalBill.customerId,
    customerName: originalBill.customerName,
    customerPhone: originalBill.customerPhone,
    customerEmail: originalBill.customerEmail,
    customerAddress: originalBill.customerAddress,
    customerGSTIN: originalBill.customerGSTIN,
    products: returnItems,
    totalAmount: -creditAmount,
    paidAmount: 0,
    dueAmount: -creditAmount,
    paymentMode: 'Credit Note',
    status: 'Completed',
    billDate: new Date(),
    notes: `Credit note for return: ${reason}`,
    originalInvoiceId: originalBill._id,
    createdBy: req.user._id,
  });

  const savedCreditNote = await creditNote.save();

  // Add credit note to original bill
  originalBill.creditNotes = originalBill.creditNotes || [];
  originalBill.creditNotes.push(savedCreditNote._id);
  await originalBill.save();

  // Restore product stock for returned items
  for (const item of returnItems) {
    await Product.findByIdAndUpdate(
      item.productId,
      { $inc: { stock: item.quantity } },
      { new: true }
    );
  }

  res.status(201).json(savedCreditNote);
});

// Get credit notes for a bill
const getCreditNotes = asyncHandler(async (req, res) => {
  const creditNotes = await Bill.find({ originalInvoiceId: req.params.id, type: 'credit' })
    .populate('createdBy', 'name email');

  if (!creditNotes) {
    res.status(404);
    throw new Error('Credit notes not found');
  }

  res.json(creditNotes);
});

// Get bill as text for printing/sharing
const getBillAsText = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id)
    .populate('customerId', 'name phone email address')
    .populate('createdBy', 'name email');

  if (!bill) {
    res.status(404);
    throw new Error('Bill not found');
  }

  // Permission check
  if (!req.user.isAdmin && !req.user.permissions?.canViewAllInvoices && bill.createdBy._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to view this bill');
  }

  // Format bill as text
  const billText = `
================================================================================
                            ${bill.type === 'credit' ? 'CREDIT NOTE' : 'INVOICE'}
================================================================================

Invoice Number: ${bill.invoiceNumber}
Date: ${new Date(bill.billDate).toLocaleDateString('en-IN')}
${bill.dueDate ? `Due Date: ${new Date(bill.dueDate).toLocaleDateString('en-IN')}` : ''}

================================================================================
CUSTOMER DETAILS
================================================================================
Name: ${bill.customerName}
${bill.customerPhone ? `Phone: ${bill.customerPhone}` : ''}
${bill.customerEmail ? `Email: ${bill.customerEmail}` : ''}
${bill.customerAddress ? `Address: ${bill.customerAddress}` : ''}
${bill.customerGSTIN ? `GSTIN: ${bill.customerGSTIN}` : ''}

================================================================================
ITEMS
================================================================================
${bill.products
  .map(
    (item, idx) =>
      `${idx + 1}. ${item.name}
   Qty: ${item.quantity} x ₹${item.price.toFixed(2)} ${item.discount > 0 ? `(${item.discount}% off)` : ''} = ₹${item.amount.toFixed(2)}`
  )
  .join('\n')}

================================================================================
BILL SUMMARY
================================================================================
Subtotal:              ₹${bill.subtotal?.toFixed(2) || (bill.products.reduce((sum, p) => sum + p.amount, 0)).toFixed(2)}
${bill.itemLevelDiscountTotal > 0 ? `Item Discounts:        ₹${bill.itemLevelDiscountTotal.toFixed(2)}` : ''}
${bill.discount > 0 ? `Overall Discount:      ₹${bill.discount.toFixed(2)}` : ''}
Taxable Amount:        ₹${bill.taxableTotal?.toFixed(2) || ((bill.subtotal || 0) - (bill.discount || 0)).toFixed(2)}
CGST (9%):             ₹${bill.cgst?.toFixed(2) || '0.00'}
SGST (9%):             ₹${bill.sgst?.toFixed(2) || '0.00'}
${bill.igst > 0 ? `IGST (${bill.igst > 0 ? '5%' : '0%'}):             ₹${bill.igst.toFixed(2)}` : ''}
${bill.additionalCharges > 0 ? `${bill.chargeLabel}:                ₹${bill.additionalCharges.toFixed(2)}` : ''}
${bill.roundOff !== 0 ? `Round Off:             ₹${bill.roundOff.toFixed(2)}` : ''}
─────────────────────────────────────────
TOTAL AMOUNT:          ₹${bill.totalAmount.toFixed(2)}

================================================================================
PAYMENT DETAILS
================================================================================
Payment Mode: ${bill.paymentMode}
${bill.paymentMode === 'Split' ? `Cash:                  ₹${bill.cashAmount?.toFixed(2) || '0.00'}\nUPI:                    ₹${bill.upiAmount?.toFixed(2) || '0.00'}\nCard:                   ₹${bill.cardAmount?.toFixed(2) || '0.00'}` : ''}
Paid Amount:           ₹${bill.paidAmount.toFixed(2)}
${bill.changeDue > 0 ? `Change Due:            ₹${bill.changeDue.toFixed(2)}` : ''}
${bill.dueAmount > 0 ? `Amount Due:            ₹${bill.dueAmount.toFixed(2)}` : ''}
Status:                ${bill.status}

${bill.notes ? `\nNotes: ${bill.notes}` : ''}

================================================================================
Created by: ${bill.createdBy.name} (${bill.createdBy.email})
Thank you for your business!
================================================================================`;

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${bill.invoiceNumber}.txt`);
  res.send(billText);
});

// Get bill data for JSON export
const getBillAsJSON = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id)
    .populate('customerId', 'name phone email address')
    .populate('createdBy', 'name email');

  if (!bill) {
    res.status(404);
    throw new Error('Bill not found');
  }

  // Permission check
  if (!req.user.isAdmin && !req.user.permissions?.canViewAllInvoices && bill.createdBy._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to view this bill');
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${bill.invoiceNumber}.json`);
  res.json(bill);
});

// Get bill data for CSV export
const getBillAsCSV = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id);

  if (!bill) {
    res.status(404);
    throw new Error('Bill not found');
  }

  // Permission check
  if (!req.user.isAdmin && !req.user.permissions?.canViewAllInvoices && bill.createdBy.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to view this bill');
  }

  // Create CSV header
  const headers = ['Sr.No', 'Product Name', 'SKU', 'Quantity', 'Unit Price', 'Discount %', 'Amount', 'GST Rate %', 'Tax Amount'];
  const csvContent = [
    headers.join(','),
    ...bill.products.map((item, idx) =>
      [idx + 1, item.name, item.sku || '', item.quantity, item.price, item.discount, item.amount, item.gstRate, item.taxAmount].join(',')
    ),
    '', // blank line
    'Summary',
    `Subtotal,${bill.subtotal}`,
    `Discount,${bill.discount}`,
    `CGST (9%),${bill.cgst}`,
    `SGST (9%),${bill.sgst}`,
    `Total Amount,${bill.totalAmount}`,
    `Paid Amount,${bill.paidAmount}`,
    `Status,${bill.status}`,
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${bill.invoiceNumber}.csv`);
  res.send(csvContent);
});

module.exports = {
  getAllBills,
  getBillById,
  createBill,
  updateBill,
  updatePayment,
  deleteBill,
  issueCreditNote,
  getCreditNotes,
  getBillAsText,
  getBillAsJSON,
  getBillAsCSV,
};
