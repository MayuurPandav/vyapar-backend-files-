const { getDB } = require('../config/db');

/**
 * Subscription Dunning Worker Process
 * Executed periodically (e.g. daily via cron or agenda worker) to:
 * 1. Identify subscriptions expiring in 7 days, 3 days, 1 day and dispatch reminders.
 * 2. Identify expired subscriptions past grace period and lock tenant user accounts.
 */
async function processSubscriptionDunning() {
  try {
    const db = getDB();
    if (!db) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allSettings = await db.collection('settings').find({
      subscriptionExpiry: { $exists: true, $ne: null }
    }).toArray();

    for (const setting of allSettings) {
      try {
        const expiryDate = new Date(setting.subscriptionExpiry);
        const diffTime = expiryDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const username = setting.username;

        // Dunning Warning Triggers (T-7, T-3, T-1)
        if (diffDays === 7 || diffDays === 3 || diffDays === 1) {
          console.log(`[DUNNING WORKER] Dunning alert triggered for user ${username}: Expiring in ${diffDays} day(s).`);
          
          await db.collection('sa_audit').insertOne({
            username,
            action: 'DUNNING_ALERT_SENT',
            details: `Subscription expiring in ${diffDays} day(s) on ${setting.subscriptionExpiry}`,
            timestamp: new Date()
          });

          // Dispatch notification to user's notifications collection
          await db.collection('notifications').insertOne({
            username,
            title: 'Subscription Expiry Warning',
            message: `Your Vyapar subscription expires in ${diffDays} day(s). Renew now to prevent service interruption.`,
            type: 'warning',
            read: false,
            createdAt: new Date()
          });
        }

        // Expiry Enforcement (Grace period: 2 days)
        if (diffDays < -2) {
          const user = await db.collection('users').findOne({ username });
          if (user && user.accountStatus !== 'locked') {
            console.log(`[DUNNING WORKER] Locking tenant account ${username} due to expired subscription (${setting.subscriptionExpiry}).`);
            
            await db.collection('users').updateOne(
              { username },
              { $set: { accountStatus: 'locked', updatedAt: new Date() } }
            );

            await db.collection('sa_audit').insertOne({
              username,
              action: 'ACCOUNT_AUTO_LOCKED',
              details: `Account automatically locked due to unpaid subscription expired on ${setting.subscriptionExpiry}`,
              timestamp: new Date()
            });
          }
        }
      } catch (err) {
        console.error(`[DUNNING WORKER] Error processing user ${setting.username}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[DUNNING WORKER ERROR]:', err.message);
  }
}

module.exports = {
  processSubscriptionDunning
};
