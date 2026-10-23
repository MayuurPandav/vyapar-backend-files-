const express = require('express');
const router = express.Router();

router.use('/auth', require('./accountant/auth'));
router.use('/dashboard', require('./accountant/dashboard'));
router.use('/customers', require('./accountant/customers'));
router.use('/expenses', require('./accountant/expenses'));
router.use('/ledgers', require('./accountant/ledgers'));
router.use('/journals', require('./accountant/journal'));
router.use('/cheques', require('./accountant/cheques'));
router.use('/petty-cash', require('./accountant/pettyCash'));
router.use('/financials', require('./accountant/financials'));

module.exports = router;
