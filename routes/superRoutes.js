const express = require('express');
const router = express.Router();
const {
  getSuperStats,
  superGetUsers,
  superVerify,
  superSubscription,
  superStatus,
  superSubscriptionInfo,
  superPlan,
  superPlans,
  superConfig,
  superPayments,
  getUserPayments,
  superAudit
  , renewSubscription, getPaymentInvoice, cancelSubscription, toggleAutoRenew, applyCoupon, sendExpiryReminders
} = require('../controllers/superController');

router.get('/stats', getSuperStats);
router.get('/users', superGetUsers);
router.post('/verify', superVerify);
router.post('/subscription', superSubscription);
router.post('/status', superStatus);
router.get('/subscription-info', superSubscriptionInfo);
router.post('/plan', superPlan);
router.post('/renew', renewSubscription);
router.get('/payment-invoice/:id', getPaymentInvoice);
router.post('/cancel', cancelSubscription);
router.post('/auto-renew', toggleAutoRenew);
router.post('/apply-coupon', applyCoupon);
router.get('/expiry-reminders', sendExpiryReminders);

// Plans support GET, POST, DELETE
router.route('/plans')
  .get(superPlans)
  .post(superPlans)
  .delete(superPlans);

// Config support GET, POST
router.route('/config')
  .get(superConfig)
  .post(superConfig);

router.get('/payments', superPayments);
router.get('/audit', superAudit);

module.exports = router;
