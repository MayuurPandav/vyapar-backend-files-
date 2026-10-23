const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/accountant/auth');
const {
  createLedger,
  getLedgers,
  getLedger,
  updateLedger,
  deleteLedger
} = require('../../controllers/accountant/ledgerController');

router.use(protect);
router.route('/').get(getLedgers).post(createLedger);
router.route('/:id').get(getLedger).put(updateLedger).delete(deleteLedger);

module.exports = router;
