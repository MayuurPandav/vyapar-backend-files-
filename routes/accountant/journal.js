const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/accountant/auth');
const { createJournal, getJournals, getJournal } = require('../../controllers/accountant/journalController');

router.use(protect);
router.route('/').get(getJournals).post(createJournal);
router.route('/:id').get(getJournal);

module.exports = router;
