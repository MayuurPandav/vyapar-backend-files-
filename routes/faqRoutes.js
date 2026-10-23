const express = require('express');
const router = express.Router();
const { listFAQs, createFAQ, updateFAQ, deleteFAQ } = require('../controllers/faqController');

router.get('/', listFAQs);
router.post('/', createFAQ);
router.put('/:id', updateFAQ);
router.delete('/:id', deleteFAQ);

module.exports = router;
