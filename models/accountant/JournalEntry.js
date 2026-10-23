const mongoose = require('mongoose');

const journalEntrySchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  narration: { type: String },
  entries: [
    {
      ledger: { type: mongoose.Schema.Types.ObjectId, ref: 'Ledger', required: true },
      type: { type: String, enum: ['debit','credit'], required: true },
      amount: { type: Number, required: true }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
