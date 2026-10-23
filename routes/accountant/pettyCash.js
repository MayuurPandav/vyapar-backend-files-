const express = require('express');
const router = express.Router();
const PettyCash = require('../../models/accountant/PettyCash');
const Ledger = require('../../models/accountant/Ledger');
const JournalEntry = require('../../models/accountant/JournalEntry');
const { protect } = require('../../middleware/accountant/auth');

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const vouchers = await PettyCash.find().sort({ date: -1 });
    res.json({ success: true, data: vouchers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const voucher = await PettyCash.create(req.body);
    res.status(201).json({ success: true, data: voucher });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/:id/approve', async (req, res) => {
  try {
    const voucher = await PettyCash.findById(req.params.id);
    if (!voucher) return res.status(404).json({ success: false, message: 'Voucher not found' });

    if (voucher.approved) {
      return res.status(400).json({ success: false, message: 'Voucher is already approved' });
    }

    // Adjust Cash ledger balance
    const cashLedger = await Ledger.findOne({ name: 'Cash' });
    const salesLedger = await Ledger.findOne({ name: 'Sales' });

    if (cashLedger && salesLedger) {
      cashLedger.balance = Math.max(0, (cashLedger.balance || 0) - voucher.amount);
      await cashLedger.save();

      await JournalEntry.create({
        narration: `Petty Cash Approved: ${voucher.title} paid to ${voucher.paidTo || 'N/A'}`,
        entries: [
          { ledger: salesLedger._id, type: 'debit', amount: voucher.amount }, // represent as debit/expense
          { ledger: cashLedger._id, type: 'credit', amount: voucher.amount }
        ]
      });
    }

    voucher.approved = true;
    await voucher.save();

    res.json({ success: true, data: voucher });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
