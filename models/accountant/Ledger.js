const mongoose = require('mongoose');

const ledgerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['asset','liability','income','expense','equity'], required: true },
  balance: { type: Number, default: 0 },
  openingDate: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Ledger', ledgerSchema);
