// backend/scripts/createDemoAdmins.js
// ------------------------------------------------------------
// Helper to create demo admin and super‑admin accounts.
// This script is used by `setupAdmin.js` to seed the database with
// deterministic credentials when the project is first initialized.
// ------------------------------------------------------------
const bcrypt = require('bcryptjs');

/**
 * Creates demo admin and super‑admin users if they do not already exist.
 * Returns the plain‑text credentials so that `setupAdmin.js` can print them.
 *
 * @param {import('mongodb').Db} db - Connected MongoDB database instance.
 * @returns {Promise<{admin:{username:string,password:string},superadmin:{username:string,password:string}}>} 
 */
async function createDemoAdmins(db) {
  const salt = await bcrypt.genSalt(10);

  // Plain‑text credentials (feel free to change if you want custom logins)
  const adminCred = {
    username: 'admin@example.com',
    password: 'admin123',
    role: 'admin',
  };
  const superCred = {
    username: 'superadmin@example.com',
    password: 'superadmin123',
    role: 'super_admin',
  };

  // Hash passwords for storage
  const adminHash = await bcrypt.hash(adminCred.password, salt);
  const superHash = await bcrypt.hash(superCred.password, salt);

  // Upsert admin
  await db.collection('users').updateOne(
    { username: adminCred.username },
    {
      $setOnInsert: {
        username: adminCred.username,
        password: adminHash,
        role: adminCred.role,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  // Upsert super‑admin
  await db.collection('users').updateOne(
    { username: superCred.username },
    {
      $setOnInsert: {
        username: superCred.username,
        password: superHash,
        role: superCred.role,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  // Return the plain‑text credentials for logging
  return {
    admin: { username: adminCred.username, password: adminCred.password },
    superadmin: { username: superCred.username, password: superCred.password },
  };
}

module.exports = createDemoAdmins;
