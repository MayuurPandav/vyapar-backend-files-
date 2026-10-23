const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');

async function getTeam(req, res) {
  try {
    const db = getDB();
    const team = await db.collection('users')
      .find({ role: { $in: ['super_admin'] } })
      .project({ password: 0 })
      .toArray();
    res.json({ status: 'success', data: team });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function saveTeamMember(req, res) {
  try {
    const db = getDB();
    const { username, name, password, subRole, enforce2FA } = req.body;
    
    if (req.method === 'POST') {
      const existing = await db.collection('users').findOne({ username });
      if (existing) return res.status(400).json({ status: 'error', message: 'User already exists' });
      
      await db.collection('users').insertOne({
        username,
        name,
        password, // In a real app, hash this
        role: 'super_admin',
        subRole,
        enforce2FA: !!enforce2FA,
        createdAt: new Date()
      });
      
      await db.collection('sa_audit').insertOne({
        username: req.user?.username || 'superadmin',
        action: 'ADD_TEAM_MEMBER',
        details: `Added new team member ${username} with role ${subRole}`,
        timestamp: new Date()
      });
    } else {
      const updateData = { name, subRole, enforce2FA: !!enforce2FA, updatedAt: new Date() };
      await db.collection('users').updateOne(
        { username: req.params.username },
        { $set: updateData }
      );
      
      await db.collection('sa_audit').insertOne({
        username: req.user?.username || 'superadmin',
        action: 'EDIT_TEAM_MEMBER',
        details: `Updated team member ${req.params.username} to role ${subRole}`,
        timestamp: new Date()
      });
    }
    
    res.json({ status: 'success', message: 'Team member saved successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function removeTeamMember(req, res) {
  try {
    const db = getDB();
    const { username } = req.params;
    
    await db.collection('users').deleteOne({ username, role: 'super_admin' });
    
    await db.collection('sa_audit').insertOne({
      username: req.user?.username || 'superadmin',
      action: 'REMOVE_TEAM_MEMBER',
      details: `Removed team member ${username}`,
      timestamp: new Date()
    });
    
    res.json({ status: 'success', message: 'Team member removed' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function toggle2FA(req, res) {
  try {
    const db = getDB();
    const { username } = req.params;
    const { enforce2FA } = req.body;
    
    await db.collection('users').updateOne(
      { username },
      { $set: { enforce2FA: !!enforce2FA } }
    );
    
    await db.collection('sa_audit').insertOne({
      username: req.user?.username || 'superadmin',
      action: 'TOGGLE_2FA',
      details: `Changed 2FA enforcement to ${enforce2FA} for ${username}`,
      timestamp: new Date()
    });
    
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getMemberActivity(req, res) {
  try {
    const db = getDB();
    const { username } = req.params;
    const logs = await db.collection('sa_audit')
      .find({ username })
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();
    res.json({ status: 'success', data: logs });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getMemberSessions(req, res) {
  try {
    const db = getDB();
    const { username } = req.params;
    // Mock sessions from login history
    const logins = await db.collection('sa_audit')
      .find({ username, action: 'LOGIN_SUCCESS', timestamp: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } })
      .sort({ timestamp: -1 })
      .toArray();
      
    // Filter out if force logged out recently
    const user = await db.collection('users').findOne({ username });
    let sessions = [];
    if (!user?.forceLogoutAt) {
       sessions = logins.map(l => ({
         _id: l._id,
         ip: '192.168.1.' + Math.floor(Math.random() * 255), // Mock IP
         device: l.details || 'Unknown Browser',
         timestamp: l.timestamp
       }));
    }
    
    res.json({ status: 'success', data: sessions });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function terminateMemberSession(req, res) {
  try {
    const db = getDB();
    const { username, sessionId } = req.params;
    
    // In a real app, delete the specific JWT session token from DB/Redis.
    // Here we'll simulate by updating forceLogoutAt for the user.
    await db.collection('users').updateOne(
      { username },
      { $set: { forceLogoutAt: new Date() } }
    );
    
    await db.collection('sa_audit').insertOne({
      username: req.user?.username || 'superadmin',
      action: 'TERMINATE_SESSION',
      details: `Terminated session for ${username}`,
      timestamp: new Date()
    });
    
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  getTeam,
  saveTeamMember,
  removeTeamMember,
  toggle2FA,
  getMemberActivity,
  getMemberSessions,
  terminateMemberSession
};
