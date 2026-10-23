const { sendAnnouncement } = require('../controllers/notificationController');
const { aggregateTenantData } = require('../controllers/dataManagementController');
const { sendEmail } = require('../utils/notifyAdapters');

async function checkAutoBackups(db) {
  try {
    const now = new Date();
    const settingsList = await db.collection('settings').find({ 'backupConfig.enabled': true }).toArray();
    
    for (const settings of settingsList) {
      const { username, backupConfig } = settings;
      if (!backupConfig || !backupConfig.enabled) continue;
      
      const lastBackup = backupConfig.lastBackupAt ? new Date(backupConfig.lastBackupAt) : null;
      let isDue = false;
      
      if (!lastBackup) {
        isDue = true;
      } else {
        const diffMs = now - lastBackup;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        
        if (backupConfig.schedule === 'daily' && diffDays >= 1) {
          isDue = true;
        } else if (backupConfig.schedule === 'weekly' && diffDays >= 7) {
          isDue = true;
        } else if (backupConfig.schedule === 'monthly' && diffDays >= 30) {
          isDue = true;
        }
      }
      
      if (isDue) {
        console.log(`[SCHEDULER] Running auto-backup for tenant: ${username}`);
        try {
          const data = await aggregateTenantData(db, username);
          const backupId = `BKP-AUTO-${Date.now()}`;
          
          await db.collection('db_backups').insertOne({
            username,
            backupId,
            type: 'auto',
            data,
            createdAt: now,
            status: 'success'
          });
          
          if (backupConfig.email) {
            const emailSubject = `Auto Backup Alert - ${username} - ${now.toLocaleDateString()}`;
            const emailBody = `
              <h2>Automatic Data Backup Successful</h2>
              <p>Dear Merchant,</p>
              <p>Your automatic database backup has completed successfully.</p>
              <ul>
                <li><strong>Tenant Username:</strong> ${username}</li>
                <li><strong>Backup ID:</strong> ${backupId}</li>
                <li><strong>Schedule:</strong> ${backupConfig.schedule}</li>
                <li><strong>Created At:</strong> ${now.toString()}</li>
              </ul>
              <p>Please find your database state JSON payload attached.</p>
              <br/>
              <p>Best Regards,</p>
              <p>Vypar 2.0 Team</p>
            `;
            
            const attachments = [{
              filename: `backup-${username}-${backupId}.json`,
              content: JSON.stringify(data, null, 2)
            }];
            
            await sendEmail(backupConfig.email, emailSubject, emailBody, attachments);
          }
          
          await db.collection('settings').updateOne(
            { username },
            { $set: { 'backupConfig.lastBackupAt': now } }
          );
          
          console.log(`[SCHEDULER] Auto-backup completed for tenant: ${username}`);
        } catch (e) {
          console.error(`[SCHEDULER] Auto-backup failed for tenant: ${username}`, e.message || e);
        }
      }
    }
  } catch (err) {
    console.error('[SCHEDULER] checkAutoBackups error:', err.message || err);
  }
}

module.exports = function startAnnouncementScheduler(db) {
  console.log('[SCHEDULER] Announcement scheduler starting...');

  async function tick() {
    try {
      const now = new Date();
      const due = await db.collection('sa_announcements').find({ scheduledAt: { $ne: null, $lte: now }, sent: { $ne: true } }).toArray();
      for (const ann of due) {
        try {
          console.log('[SCHEDULER] Sending announcement', ann._id, ann.title);
          await sendAnnouncement(ann);
          await db.collection('sa_announcements').updateOne({ _id: ann._id }, { $set: { sent: true, sentAt: new Date() } });
        } catch (e) {
          console.error('[SCHEDULER] Error sending announcement', ann._id, e.message || e);
        }
      }
      
      // Run auto backups check
      await checkAutoBackups(db);
      
    } catch (err) {
      console.error('[SCHEDULER] tick error:', err.message || err);
    }
  }

  // run immediately then every minute
  tick();
  const id = setInterval(tick, 60 * 1000);
  return () => clearInterval(id);
};
