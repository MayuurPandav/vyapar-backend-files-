const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const { logAudit } = require('./authController');

// Default predefined roles
const PREDEFINED_ROLES = [
  {
    name: 'Super Admin Owner',
    description: 'Full access to all platform settings and data.',
    is_custom: false,
    permissions: { all: true }
  },
  {
    name: 'Billing Manager',
    description: 'Access to subscriptions, payments, and billing configuration.',
    is_custom: false,
    permissions: { billing: true, payments: true, subscriptions: true }
  },
  {
    name: 'Support Staff',
    description: 'Access to helpdesk, user management (read-only), and tickets.',
    is_custom: false,
    permissions: { users_read: true, support: true }
  },
  {
    name: 'Analytics Viewer',
    description: 'Read-only access to dashboard and analytics.',
    is_custom: false,
    permissions: { analytics_read: true, dashboard_read: true }
  },
  {
    name: 'Content Manager',
    description: 'Access to master data, plans, and legal/policy settings.',
    is_custom: false,
    permissions: { plans_write: true, settings_write: true, content_write: true }
  },
  {
    name: 'Technical Manager',
    description: 'Access to integrations, API keys, and security settings.',
    is_custom: false,
    permissions: { integrations: true, api_keys: true, security_write: true }
  }
];

// Seed roles if not exist
async function seedRoles() {
  const db = getDB();
  for (const role of PREDEFINED_ROLES) {
    await db.collection('sa_roles').updateOne(
      { name: role.name },
      { $setOnInsert: role },
      { upsert: true }
    );
  }
}

// Get all roles
async function getRoles(req, res) {
  const db = getDB();
  try {
    await seedRoles();
    const roles = await db.collection('sa_roles').find({}).toArray();
    res.json(roles);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// Create custom role
async function createRole(req, res) {
  const db = getDB();
  const { name, description, permissions } = req.body;
  if (!name) return res.status(400).json({ status: 'error', message: 'Role name is required' });

  try {
    const existing = await db.collection('sa_roles').findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) return res.status(400).json({ status: 'error', message: 'Role already exists' });

    const newRole = {
      name,
      description,
      permissions: permissions || {},
      is_custom: true,
      created_at: new Date()
    };

    await db.collection('sa_roles').insertOne(newRole);
    await logAudit(req.user?.username || 'SYSTEM', 'ROLE_CREATE', `Created custom role: ${name}`);
    res.json({ status: 'success', role: newRole });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// Update custom role
async function updateRole(req, res) {
  const db = getDB();
  const { id } = req.params;
  const { name, description, permissions } = req.body;

  try {
    const role = await db.collection('sa_roles').findOne({ _id: new ObjectId(id) });
    if (!role) return res.status(404).json({ status: 'error', message: 'Role not found' });
    if (!role.is_custom) return res.status(400).json({ status: 'error', message: 'Cannot edit predefined roles' });

    await db.collection('sa_roles').updateOne(
      { _id: new ObjectId(id) },
      { $set: { name, description, permissions, updated_at: new Date() } }
    );

    await logAudit(req.user?.username || 'SYSTEM', 'ROLE_UPDATE', `Updated custom role: ${name || role.name}`);
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// Get all super admins
async function getAdmins(req, res) {
  const db = getDB();
  try {
    const admins = await db.collection('users').find({ role: 'superadmin' }).project({ password: 0 }).toArray();
    res.json(admins);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// Create new super admin
async function createAdmin(req, res) {
  const db = getDB();
  const { username, password, phone, sa_role, sa_access_expiry } = req.body;
  if (!username || !password || !sa_role) {
    return res.status(400).json({ status: 'error', message: 'Username, password, and role are required' });
  }

  try {
    const existing = await db.collection('users').findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (existing) return res.status(400).json({ status: 'error', message: 'Username already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = {
      username,
      password: hashedPassword,
      phone,
      role: 'superadmin',
      sa_role,
      sa_access_expiry: sa_access_expiry ? new Date(sa_access_expiry) : null,
      status: 'active',
      created_at: new Date()
    };

    await db.collection('users').insertOne(newAdmin);
    await logAudit(req.user?.username || 'SYSTEM', 'ADMIN_CREATE', `Created sub-admin: ${username} with role ${sa_role}`);
    res.json({ status: 'success', message: 'Sub-Admin created successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// Update super admin
async function updateAdmin(req, res) {
  const db = getDB();
  const { username } = req.params;
  const { sa_role, status, sa_access_expiry } = req.body;

  try {
    const updateFields = {};
    if (sa_role) updateFields.sa_role = sa_role;
    if (status) updateFields.status = status;
    if (sa_access_expiry !== undefined) updateFields.sa_access_expiry = sa_access_expiry ? new Date(sa_access_expiry) : null;

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ status: 'error', message: 'No fields to update' });
    }

    const result = await db.collection('users').updateOne(
      { username: username, role: 'superadmin' },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) return res.status(404).json({ status: 'error', message: 'Admin not found' });

    await logAudit(req.user?.username || 'SYSTEM', 'ADMIN_UPDATE', `Updated sub-admin: ${username}`);
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// Delete super admin
async function deleteAdmin(req, res) {
  const db = getDB();
  const { username } = req.params;

  try {
    const admin = await db.collection('users').findOne({ username, role: 'superadmin' });
    if (!admin) return res.status(404).json({ status: 'error', message: 'Admin not found' });

    if (admin.sa_role === 'Super Admin Owner') {
       return res.status(403).json({ status: 'error', message: 'Cannot delete the primary owner' });
    }

    await db.collection('users').deleteOne({ username, role: 'superadmin' });
    await logAudit(req.user?.username || 'SYSTEM', 'ADMIN_DELETE', `Deleted sub-admin: ${username}`);
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  getRoles,
  createRole,
  updateRole,
  getAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin
};
