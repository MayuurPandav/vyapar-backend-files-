const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/accountant/auth');
const Customer = require('../../models/accountant/Customer');
const Ledger = require('../../models/accountant/Ledger');
const JournalEntry = require('../../models/accountant/JournalEntry');
const Expense = require('../../models/accountant/Expense');
const Invoice = require('../../models/accountant/Invoice');
const GstFiling = require('../../models/accountant/GstFiling');

// Dynamic dashboard stats
router.get('/stats', protect, async (req, res) => {
  try {
    // 1. Receivables: Sum of Customer opening balances
    const customers = await Customer.find();
    const totalReceivables = customers.reduce((sum, c) => sum + (c.openingBalance || 0), 0);

    // 2. Payables: Sum of Ledgers of type 'liability'
    const liabilityLedgers = await Ledger.find({ type: 'liability' });
    const totalPayables = liabilityLedgers.reduce((sum, l) => sum + (l.balance || 0), 0);

    // 3. Cash in Hand: Balance of Cash ledger
    const cashLedger = await Ledger.findOne({ name: 'Cash' });
    const cashInHand = cashLedger ? (cashLedger.balance || 0) : 0;

    // 4. Bank Balance: Balance of Bank ledger
    const bankLedger = await Ledger.findOne({ name: 'Bank' });
    const bankBalance = bankLedger ? (bankLedger.balance || 0) : 0;

    // 5. Today's Transactions Count
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const todaysTransactions = await JournalEntry.countDocuments({
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    // 6. Overdue payments count
    const today = new Date();
    const overdueCount = await Invoice.countDocuments({
      status: 'unpaid',
      dueDate: { $lt: today }
    });

    // 7. GST Filing Status
    const latestFiling = await GstFiling.findOne().sort({ filedAt: -1 });
    const gstFilingStatus = latestFiling ? `Filed for ${latestFiling.period}` : 'Pending Filing (Q1 FY26)';

    // 8. Pending expense approvals
    const pendingExpenseApprovals = await Expense.countDocuments({ approved: false });

    // 9. Total Customers
    const totalCustomers = customers.length;

    // 10. Total Invoices
    const totalInvoices = await Invoice.countDocuments();

    // 11. Total Income: Sum of ledgers of type 'income'
    const incomeLedgers = await Ledger.find({ type: 'income' });
    const totalIncome = incomeLedgers.reduce((sum, l) => sum + (l.balance || 0), 0);

    res.json({
      success: true,
      data: {
        totalReceivables,
        totalPayables,
        cashInHand,
        bankBalance,
        todaysTransactions,
        overdueCount,
        gstFilingStatus,
        pendingExpenseApprovals,
        totalCustomers,
        totalInvoices,
        totalIncome
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Invoices CRUD & Settle Actions
router.get('/invoices', protect, async (req, res) => {
  try {
    const invoices = await Invoice.find().populate('customer').sort({ dueDate: 1 });
    res.json({ success: true, data: invoices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/invoices', protect, async (req, res) => {
  try {
    const { invoiceNumber, customerId, amount, dueDate } = req.body;

    // Check if invoice number already exists
    const existingInvoice = await Invoice.findOne({ invoiceNumber });
    if (existingInvoice) {
      return res.status(400).json({ 
        success: false, 
        message: `Invoice code "${invoiceNumber}" already exists. Please use a unique invoice code.` 
      });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    // Update customer opening balance (add receivable)
    customer.openingBalance = (customer.openingBalance || 0) + Number(amount);
    await customer.save();

    const invoice = await Invoice.create({
      invoiceNumber,
      customer: customerId,
      customerName: customer.name,
      amount: Number(amount),
      dueDate,
      status: new Date(dueDate) < new Date() ? 'overdue' : 'unpaid'
    });

    res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/invoices/:id/settle', protect, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    if (invoice.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Invoice already paid' });
    }

    // Update customer opening balance (reduce receivable)
    const customer = await Customer.findById(invoice.customer);
    if (customer) {
      customer.openingBalance = Math.max(0, (customer.openingBalance || 0) - invoice.amount);
      await customer.save();
    }

    // Also update Cash or Bank ledger balance (e.g. increase cash by invoice amount)
    const cashLedger = await Ledger.findOne({ name: 'Cash' });
    if (cashLedger) {
      cashLedger.balance = (cashLedger.balance || 0) + invoice.amount;
      await cashLedger.save();
    }

    // Record a journal entry automatically
    const salesLedger = await Ledger.findOne({ name: 'Sales' });
    if (cashLedger && salesLedger) {
      await JournalEntry.create({
        narration: `Settle invoice ${invoice.invoiceNumber} from ${invoice.customerName}`,
        entries: [
          { ledger: cashLedger._id, type: 'debit', amount: invoice.amount },
          { ledger: salesLedger._id, type: 'credit', amount: invoice.amount }
        ]
      });
    }

    invoice.status = 'paid';
    await invoice.save();

    res.json({ success: true, data: invoice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GST Filings Actions
router.get('/gst-filings', protect, async (req, res) => {
  try {
    const filings = await GstFiling.find().sort({ filedAt: -1 });
    res.json({ success: true, data: filings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/gst-filings', protect, async (req, res) => {
  try {
    const { period, cgst, sgst, igst } = req.body;
    const totalGstPaid = Number(cgst) + Number(sgst) + Number(igst || 0);

    const filing = await GstFiling.create({
      period,
      cgst: Number(cgst),
      sgst: Number(sgst),
      igst: Number(igst || 0),
      totalGstPaid
    });

    // Reduce Cash or Bank for the GST payment
    const bankLedger = await Ledger.findOne({ name: 'Bank' }) || await Ledger.findOne({ name: 'Cash' });
    if (bankLedger) {
      bankLedger.balance = Math.max(0, (bankLedger.balance || 0) - totalGstPaid);
      await bankLedger.save();
    }

    res.status(201).json({ success: true, data: filing });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
