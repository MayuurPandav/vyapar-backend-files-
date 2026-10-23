const Ledger = require('../../models/accountant/Ledger');
const asyncHandler = require('../../middleware/accountant/asyncHandler');

exports.createLedger = asyncHandler(async (req, res) => {
  const ledger = await Ledger.create(req.body);
  res.status(201).json({ success: true, data: ledger });
});

exports.getLedgers = asyncHandler(async (req, res) => {
  const ledgers = await Ledger.find().limit(500);
  res.json({ success: true, data: ledgers });
});

exports.getLedger = asyncHandler(async (req, res) => {
  const ledger = await Ledger.findById(req.params.id);
  if (!ledger) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: ledger });
});

exports.updateLedger = asyncHandler(async (req, res) => {
  const ledger = await Ledger.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: ledger });
});

exports.deleteLedger = asyncHandler(async (req, res) => {
  await Ledger.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Deleted' });
});
