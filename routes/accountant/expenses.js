const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/accountant/auth');
const { createExpense, getExpenses, approveExpense } = require('../../controllers/accountant/expenseController');

router.use(protect);
router.route('/').get(getExpenses).post(createExpense);
router.post('/:id/approve', approveExpense);

module.exports = router;
