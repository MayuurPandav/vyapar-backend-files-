const express = require('express');
const router = express.Router();
const Cheque = require('../../models/accountant/Cheque');
const Ledger = require('../../models/accountant/Ledger');
const JournalEntry = require('../../models/accountant/JournalEntry');
const { protect } = require('../../middleware/accountant/auth');

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const cheques = await Cheque.find().sort({ createdAt: -1 });
    res.json({ success: true, data: cheques });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const cheque = await Cheque.create(req.body);
    res.status(201).json({ success: true, data: cheque });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const cheque = await Cheque.findById(req.params.id);
    if (!cheque) return res.status(404).json({ success: false, message: 'Cheque not found' });

    if (cheque.status === 'cleared') {
      return res.status(400).json({ success: false, message: 'Cheque is already cleared' });
    }

    if (status === 'cleared') {
      const bankLedger = await Ledger.findOne({ name: 'Bank' });
      const salesLedger = await Ledger.findOne({ name: 'Sales' });

      if (bankLedger && salesLedger) {
        if (cheque.type === 'received') {
          // Increase Bank Balance: Debit Bank, Credit Sales
          bankLedger.balance = (bankLedger.balance || 0) + cheque.amount;
          await bankLedger.save();

          await JournalEntry.create({
            narration: `Cleared Cheque #${cheque.chequeNumber} received from ${cheque.partyName}`,
            entries: [
              { ledger: bankLedger._id, type: 'debit', amount: cheque.amount },
              { ledger: salesLedger._id, type: 'credit', amount: cheque.amount }
            ]
          });
        } else {
          // Decrease Bank Balance: Credit Bank, Debit Sales/Expense
          bankLedger.balance = Math.max(0, (bankLedger.balance || 0) - cheque.amount);
          await bankLedger.save();

          await JournalEntry.create({
            narration: `Cleared Cheque #${cheque.chequeNumber} issued to ${cheque.partyName}`,
            entries: [
              { ledger: salesLedger._id, type: 'debit', amount: cheque.amount },
              { ledger: bankLedger._id, type: 'credit', amount: cheque.amount }
            ]
          });
        }
      }
    }

    cheque.status = status;
    await cheque.save();

    res.json({ success: true, data: cheque });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
