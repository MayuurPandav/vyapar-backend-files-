const JournalEntry = require('../../models/accountant/JournalEntry');
const Ledger = require('../../models/accountant/Ledger');
const asyncHandler = require('../../middleware/accountant/asyncHandler');

// Create journal entry and update ledger balances
exports.createJournal = asyncHandler(async (req, res) => {
  const { date, narration, entries } = req.body;
  // basic validation: total debits must equal total credits
  const totalDebit = entries.filter(e => e.type === 'debit').reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalCredit = entries.filter(e => e.type === 'credit').reduce((s, e) => s + Number(e.amount || 0), 0);
  if (totalDebit !== totalCredit) return res.status(400).json({ success: false, message: 'Debits and credits must match' });

  const journal = await JournalEntry.create({ date, narration, entries });

  // update ledger balances (simple approach)
  for (const e of entries) {
    const ledger = await Ledger.findById(e.ledger);
    if (!ledger) continue;
    if (e.type === 'debit') ledger.balance = Number(ledger.balance || 0) + Number(e.amount);
    else ledger.balance = Number(ledger.balance || 0) - Number(e.amount);
    await ledger.save();
  }

  res.status(201).json({ success: true, data: journal });
});

exports.getJournals = asyncHandler(async (req, res) => {
  const journals = await JournalEntry.find().populate('entries.ledger').sort({ date: -1 }).limit(500);
  res.json({ success: true, data: journals });
});

exports.getJournal = asyncHandler(async (req, res) => {
  const journal = await JournalEntry.findById(req.params.id).populate('entries.ledger');
  if (!journal) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: journal });
});
