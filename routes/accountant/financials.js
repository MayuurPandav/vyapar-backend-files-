const express = require('express');
const router = express.Router();
const Ledger = require('../../models/accountant/Ledger');
const JournalEntry = require('../../models/accountant/JournalEntry');
const Customer = require('../../models/accountant/Customer');
const Expense = require('../../models/accountant/Expense');
const { protect } = require('../../middleware/accountant/auth');

router.use(protect);

// 1. Trial Balance calculation
router.get('/trial-balance', async (req, res) => {
  try {
    const ledgers = await Ledger.find();
    
    let debitsTotal = 0;
    let creditsTotal = 0;

    const trialBalanceRows = ledgers.map(l => {
      let debit = 0;
      let credit = 0;

      // In accounting: Assets & Expenses are debit balances. Liabilities, Equity & Income are credit balances.
      if (l.type === 'asset' || l.type === 'expense') {
        debit = Math.max(0, l.balance || 0);
        debitsTotal += debit;
      } else {
        credit = Math.max(0, l.balance || 0);
        creditsTotal += credit;
      }

      return {
        _id: l._id,
        name: l.name,
        type: l.type,
        debit,
        credit
      };
    });

    res.json({
      success: true,
      data: {
        rows: trialBalanceRows,
        debitsTotal,
        creditsTotal
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Profit & Loss statement calculation
router.get('/profit-loss', async (req, res) => {
  try {
    const ledgers = await Ledger.find();
    const approvedExpenses = await Expense.find({ approved: true });

    const incomeLedgers = ledgers.filter(l => l.type === 'income');
    const expenseLedgers = ledgers.filter(l => l.type === 'expense');

    const totalIncome = incomeLedgers.reduce((sum, l) => sum + (l.balance || 0), 0);
    const ledgerExpenses = expenseLedgers.reduce((sum, l) => sum + (l.balance || 0), 0);
    const extraExpenses = approvedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalExpenses = ledgerExpenses + extraExpenses;

    const netProfit = totalIncome - totalExpenses;

    res.json({
      success: true,
      data: {
        incomeRows: incomeLedgers,
        expenseRows: expenseLedgers.concat([
          { name: 'Approved Business Expenses', balance: extraExpenses }
        ]),
        totalIncome,
        totalExpenses,
        netProfit
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Balance Sheet calculation
router.get('/balance-sheet', async (req, res) => {
  try {
    const ledgers = await Ledger.find();
    const customers = await Customer.find();

    const assetsList = ledgers.filter(l => l.type === 'asset');
    const liabilitiesList = ledgers.filter(l => l.type === 'liability');
    const equityList = ledgers.filter(l => l.type === 'equity');

    // Customer receivables represent active assets
    const totalReceivables = customers.reduce((sum, c) => sum + (c.openingBalance || 0), 0);
    const assetSum = assetsList.reduce((sum, l) => sum + (l.balance || 0), 0) + totalReceivables;

    // Liabilities
    const liabilitySum = liabilitiesList.reduce((sum, l) => sum + (l.balance || 0), 0);

    // Calculate current Net Profit to add to Equity (Retained Earnings)
    const approvedExpenses = await Expense.find({ approved: true });
    const totalIncome = ledgers.filter(l => l.type === 'income').reduce((sum, l) => sum + (l.balance || 0), 0);
    const totalExpenses = ledgers.filter(l => l.type === 'expense').reduce((sum, l) => sum + (l.balance || 0), 0) + approvedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const currentNetProfit = totalIncome - totalExpenses;

    const equitySum = equityList.reduce((sum, l) => sum + (l.balance || 0), 0) + currentNetProfit;

    res.json({
      success: true,
      data: {
        assets: assetsList.concat([{ name: 'Accounts Receivable (Customer Dues)', balance: totalReceivables }]),
        liabilities: liabilitiesList,
        equity: equityList.concat([{ name: 'Current Period Retained Earnings', balance: currentNetProfit }]),
        totalAssets: assetSum,
        totalLiabilities: liabilitySum,
        totalEquity: equitySum,
        balanced: assetSum === (liabilitySum + equitySum)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Cash Flow Statement calculation
router.get('/cash-flow', async (req, res) => {
  try {
    // Basic Tracing of Cash and Bank journal movements
    const journals = await JournalEntry.find().populate('entries.ledger');
    
    let operatingActivities = [];
    let investingActivities = [];
    let financingActivities = [];

    let opSum = 0;
    let invSum = 0;
    let finSum = 0;

    journals.forEach(j => {
      // Check if cash or bank ledger is affected
      const affectsCashOrBank = j.entries.some(e => e.ledger?.name === 'Cash' || e.ledger?.name === 'Bank');
      if (!affectsCashOrBank) return;

      // Classify cash flow
      const amount = j.entries[0]?.amount || 0;
      const isReceipt = j.entries.some(e => (e.ledger?.name === 'Cash' || e.ledger?.name === 'Bank') && e.type === 'debit');

      const flowItem = {
        date: j.date,
        narration: j.narration,
        amount: isReceipt ? amount : -amount
      };

      if (j.narration.toLowerCase().includes('capital') || j.narration.toLowerCase().includes('equity') || j.narration.toLowerCase().includes('loan')) {
        financingActivities.push(flowItem);
        finSum += flowItem.amount;
      } else if (j.narration.toLowerCase().includes('asset') || j.narration.toLowerCase().includes('equipment') || j.narration.toLowerCase().includes('purchase')) {
        investingActivities.push(flowItem);
        invSum += flowItem.amount;
      } else {
        operatingActivities.push(flowItem);
        opSum += flowItem.amount;
      }
    });

    res.json({
      success: true,
      data: {
        operatingActivities,
        investingActivities,
        financingActivities,
        operatingTotal: opSum,
        investingTotal: invSum,
        financingTotal: finSum,
        netCashFlow: opSum + invSum + finSum
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Expose GSTR & Ledger PDF statement download routes
const { getGSTR1, getGSTR3B, getLedgerPDF, exportTallyXML, exportGSTR1JSON } = require('../../controllers/accountant/financialsController');
router.get('/gstr1', getGSTR1);
router.get('/gstr3b', getGSTR3B);
router.get('/ledger/:ledgerId/pdf', getLedgerPDF);
router.get('/tally-export', exportTallyXML);
router.get('/gst-export', exportGSTR1JSON);

module.exports = router;
