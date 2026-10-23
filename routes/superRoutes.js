const express = require('express');
const router = express.Router();
const superMasterDataController = require('../controllers/superMasterDataController');
const securityController = require('../controllers/securityController');
const dataManagementController = require('../controllers/dataManagementController');
const integrationController = require('../controllers/integrationController');
const reportController = require('../controllers/reportController');
const superTeamController = require('../controllers/superTeamController');
const {
  getBillingOversight,
  getPurchaseOversight,
  getInventoryOversight,
  getAccountingOversight,
  getGSTOversight,
  getExpenseOversight,
  getPaymentOversight,
  getDeliveryOversight,
  getOffersOversight,
  getStaffOversight
} = require('../controllers/superOversightController');
const {
  getSuperStats,
  superGetUsers,
  superGetShops,
  superCreateShop,
  superEditShop,
  superVerify,
  superSubscription,
  superStatus,
  superSubscriptionInfo,
  superPlan,
  superPlans,
  superPlanAction,
  seedDefaultPlans,
  superConfig,
  superPayments,
  getUserPayments,
  superAudit
  , renewSubscription, getPaymentInvoice, cancelSubscription, toggleAutoRenew, applyCoupon, sendExpiryReminders,
  getPlanLimits, createOrUpdatePlanLimits, getPlanLimitDetails,
  superGetNotifications, superMarkNotificationRead,
  superDeleteUser, superForceResetPassword, superMergeAccounts, superGetLoginHistory,
  superGetGlobalStaff, superGetGlobalStaffActivity, superToggleStaffActive, superGetGlobalStaffLogins,
  superGetSecuritySettings, superSaveGlobalSecurity, superSaveShopSecurity,
  superDashboardShopStats, superDashboardRevenueStats,
  superDashboardBusinessStats, superDashboardStaffStats, superDashboardAppUsage,
  superDashboardBusinessDetails, superImpersonateMerchant
} = require('../controllers/superController');
const {
  getRoles,
  createRole,
  updateRole,
  getAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin
} = require('../controllers/superRoleController');

// Public read-only endpoints for system announcements & SaaS plan offerings
router.get('/config', superConfig);
router.get('/plans', superPlans);

// Merchant & Tenant Subscription Self-Service Endpoints (Protected by protectAdmin / tenant isolation)
const { protectAdmin, protectSuperAdmin } = require('../middleware/authMiddleware');
router.get('/subscription-info', protectAdmin, superSubscriptionInfo);
router.post('/renew', protectAdmin, renewSubscription);
router.post('/cancel', protectAdmin, cancelSubscription);
router.post('/cancel-subscription', protectAdmin, cancelSubscription);
router.post('/auto-renew', protectAdmin, toggleAutoRenew);
router.post('/apply-coupon', protectAdmin, applyCoupon);

// Super Admin Only Endpoints
router.use(protectSuperAdmin);

router.get('/stats', getSuperStats);
router.post('/impersonate/:username', superImpersonateMerchant);
router.get('/users', superGetUsers);
router.get('/shops', superGetShops);
router.post('/shops', superCreateShop);
router.put('/shops', superEditShop);
router.post('/shops/status', superStatus);
router.post('/shops/verify', superVerify);
router.post('/verify', superVerify);
router.post('/shops/send-otp', require('../controllers/superController').sendShopOtp);
router.post('/shops/verify-otp', require('../controllers/superController').verifyShopOtp);
router.post('/subscription', superSubscription);
router.post('/status', superStatus);
router.post('/plan', superPlan);
router.get('/payment-invoice/:id', getPaymentInvoice);
router.get('/expiry-reminders', sendExpiryReminders);

// Plans support POST, DELETE (Protected)
router.route('/plans')
  .post(superPlans)
  .delete(superPlans);

router.get('/plan-limits/:planId', getPlanLimits);
router.post('/plan-limits/:planId', createOrUpdatePlanLimits);
router.get('/plan-limits/details/:planId', getPlanLimitDetails);
router.post('/plans/seed', seedDefaultPlans);
router.post('/plans/:id/action', superPlanAction);

// Config support POST (Protected)
router.post('/config', superConfig);

// Announcements support GET, POST, DELETE
const { listAnnouncements, updateAnnouncement, deleteAnnouncement } = require('../controllers/notificationController');
router.route('/announcements')
  .get(listAnnouncements)
  .post(updateAnnouncement);

router.route('/announcements/:id')
  .delete(deleteAnnouncement);

router.get('/payments', superPayments);

// Audit & Security
router.get('/audit', securityController.getAuditLogs);
router.get('/security/sessions', securityController.getActiveSessions);
router.post('/security/force-logout', securityController.forceLogout);
router.get('/security/settings', securityController.getSecuritySettings);
router.put('/security/settings', securityController.updateSecuritySettings);
router.get('/security/alerts', securityController.getSecurityAlerts);

// Data Management
router.get('/data/export/:type', dataManagementController.exportData);
router.get('/data/health', dataManagementController.getDbHealth);
router.post('/data/purge', dataManagementController.purgeData);

// Integrations
router.get('/integrations', integrationController.getIntegrations);
router.put('/integrations', integrationController.updateIntegrations);

// Reports
router.get('/reports/generate', reportController.getReport);
router.get('/reports/export', reportController.exportReport);
router.get('/reports/config', reportController.getReportConfig);
router.put('/reports/config', reportController.saveReportConfig);

router.get('/notifications', superGetNotifications);
router.put('/notifications/:id/read', superMarkNotificationRead);

// User Management (Shop Owners)
router.delete('/users/:username', superDeleteUser);
router.post('/users/reset-password', superForceResetPassword);
router.post('/users/merge', superMergeAccounts);
router.get('/users/:username/login-history', superGetLoginHistory);

// Global Staff Members
router.get('/staff', superGetGlobalStaff);
router.get('/staff/activity/:staffId', superGetGlobalStaffActivity);
router.post('/staff/:staffId/toggle', superToggleStaffActive);
router.get('/staff/:staffId/logins', superGetGlobalStaffLogins);

// Security Settings
router.get('/security-settings', superGetSecuritySettings);
router.post('/security-settings/global', superSaveGlobalSecurity);
router.post('/security-settings/shop/:username', superSaveShopSecurity);

// Dashboard & Analytics
router.get('/dashboard/shop-stats', superDashboardShopStats);
router.get('/dashboard/revenue-stats', superDashboardRevenueStats);
router.get('/dashboard/business-stats', superDashboardBusinessStats);
router.get('/dashboard/staff-stats', superDashboardStaffStats);
router.get('/dashboard/app-usage', superDashboardAppUsage);
router.get('/dashboard/business-detail-list', superDashboardBusinessDetails);

// Role & Permission Management (Super Admins)
router.get('/roles', getRoles);
router.post('/roles', createRole);
router.put('/roles/:id', updateRole);
router.get('/admins', getAdmins);
router.post('/admins', createAdmin);
router.put('/admins/:username', updateAdmin);
router.delete('/admins/:username', deleteAdmin);

// Master Data Management
router.get('/master-data', superMasterDataController.getMasterData);
router.post('/master-data/:category', superMasterDataController.updateMasterData);

// Super Admin Team Management
router.get('/team', superTeamController.getTeam);
router.post('/team', superTeamController.saveTeamMember);
router.put('/team/:username', superTeamController.saveTeamMember);
router.delete('/team/:username', superTeamController.removeTeamMember);
router.put('/team/:username/2fa', superTeamController.toggle2FA);
router.get('/team/:username/activity', superTeamController.getMemberActivity);
router.get('/team/:username/sessions', superTeamController.getMemberSessions);
router.delete('/team/:username/sessions/:sessionId', superTeamController.terminateMemberSession);

// Business Oversight
router.get('/oversight/billing', getBillingOversight);
router.get('/oversight/purchase', getPurchaseOversight);
router.get('/oversight/inventory', getInventoryOversight);
router.get('/oversight/accounting', getAccountingOversight);
router.get('/oversight/gst', getGSTOversight);
router.get('/oversight/expense', getExpenseOversight);
router.get('/oversight/payment', getPaymentOversight);
router.get('/oversight/delivery', getDeliveryOversight);
router.get('/oversight/offers', getOffersOversight);
router.get('/oversight/staff', getStaffOversight);

module.exports = router;
