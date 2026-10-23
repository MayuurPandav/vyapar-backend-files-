const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const { logAudit } = require('./authController');

function hoursFromNow(h) { const d = new Date(); d.setHours(d.getHours() + h); return d; }

// Priority SLA mapping (hours)
const SLA_MAP = { low: 72, medium: 48, high: 24, urgent: 4 };

// Create ticket
async function createTicket(req, res) {
  try {
    const db = getDB();
    const { title, description, username, category, priority = 'medium', attachments } = req.body;
    if (!title || !username) return res.status(400).json({ status: 'error', message: 'title and username required' });
    const createdAt = new Date();
    const slaHours = SLA_MAP[(priority||'medium').toLowerCase()] || 48;
    const ticket = {
      title, description: description || '', username, category: category || 'General', priority, attachments: attachments || [], status: 'open', assignedTo: null,
      createdAt, updatedAt: createdAt, slaDeadline: hoursFromNow(slaHours), resolvedAt: null
    };
    const r = await db.collection('sa_tickets').insertOne(ticket);
    await logAudit(req.body.actor || username || 'SYSTEM', 'TICKET_CREATED', title);
    
    // Add notification to Super Admin notification center
    await db.collection('sa_notifications').insertOne({
      username,
      type: 'support_ticket',
      severity: (priority || 'medium') === 'high' || (priority || 'medium') === 'urgent' ? 'high' : 'medium',
      title: `New Ticket: ${title}`,
      message: `User ${username} raised a ticket under ${category || 'General'}. Status: Open.`,
      createdAt: new Date(),
      read: false
    });
    
    return res.json({ status: 'success', ticketId: String(r.insertedId) });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

// List tickets (filter + pagination)
async function listTickets(req, res) {
  try {
    const db = getDB();
    const { page = 1, limit = 20, status, assignedTo, priority, category, search } = req.query;
    const q = {};
    if (status) q.status = status;
    if (assignedTo) q.assignedTo = assignedTo;
    if (priority) q.priority = priority;
    if (category) q.category = category;
    if (search) q.$or = [{ title: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }];
    const pageNum = Math.max(1, Number(page));
    const lim = Math.max(1, Number(limit));
    const total = await db.collection('sa_tickets').countDocuments(q);
    const data = await db.collection('sa_tickets').find(q).sort({ createdAt: -1 }).skip((pageNum-1)*lim).limit(lim).toArray();
    return res.json({ status: 'success', total, page: pageNum, limit: lim, data });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

// Get ticket by id
async function getTicketById(req, res) {
  try {
    const db = getDB();
    const { id } = req.params;
    if (!id) return res.status(400).json({ status: 'error', message: 'ticket id required' });
    const t = ObjectId.isValid(id) ? await db.collection('sa_tickets').findOne({ _id: new ObjectId(id) }) : null;
    if (!t) return res.status(404).json({ status: 'error', message: 'ticket not found' });
    const comments = await db.collection('sa_ticket_comments').find({ ticketId: String(id) }).sort({ createdAt: 1 }).toArray();
    return res.json({ status: 'success', ticket: t, comments });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

// Add comment
async function addComment(req, res) {
  try {
    const db = getDB();
    const { ticketId, author, message } = req.body;
    if (!ticketId || !author || !message) return res.status(400).json({ status: 'error', message: 'ticketId, author and message required' });
    const doc = { ticketId: String(ticketId), author, message, createdAt: new Date() };
    await db.collection('sa_ticket_comments').insertOne(doc);
    await db.collection('sa_tickets').updateOne({ _id: new ObjectId(ticketId) }, { $set: { updatedAt: new Date() } });
    await logAudit(author, 'TICKET_COMMENT', `ticket=${ticketId}`);
    return res.json({ status: 'success' });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

// Update ticket (status, assign, priority)
async function updateTicket(req, res) {
  try {
    const db = getDB();
    const { id } = req.params;
    const data = req.body;
    if (!id) return res.status(400).json({ status: 'error', message: 'ticket id required' });
    const upd = { updatedAt: new Date() };
    if (data.status) upd.status = data.status;
    if (data.assignedTo !== undefined) upd.assignedTo = data.assignedTo;
    if (data.priority) { upd.priority = data.priority; const sla = SLA_MAP[(data.priority||'medium').toLowerCase()]||48; upd.slaDeadline = hoursFromNow(sla); }
    if (data.status && data.status === 'resolved') upd.resolvedAt = new Date();
    await db.collection('sa_tickets').updateOne({ _id: new ObjectId(id) }, { $set: upd });
    await logAudit(req.body.actor || 'SYSTEM', 'TICKET_UPDATED', `ticket=${id}`);
    return res.json({ status: 'success' });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

// Analytics: average resolution time, counts, top categories
async function stats(req, res) {
  try {
    const db = getDB();
    // avg resolution time (hours)
    const resolved = await db.collection('sa_tickets').find({ resolvedAt: { $exists: true, $ne: null } }).project({ createdAt:1, resolvedAt:1 }).toArray();
    const avgHours = resolved.length ? (resolved.reduce((s,t)=> s + ((new Date(t.resolvedAt) - new Date(t.createdAt))/(1000*60*60)),0)/resolved.length) : 0;
    // volume
    const total = await db.collection('sa_tickets').countDocuments({});
    const open = await db.collection('sa_tickets').countDocuments({ status: 'open' });
    const inprogress = await db.collection('sa_tickets').countDocuments({ status: 'in_progress' });
    const resolvedCount = await db.collection('sa_tickets').countDocuments({ status: 'resolved' });
    // top categories
    const catAgg = await db.collection('sa_tickets').aggregate([{ $group: { _id: '$category', cnt: { $sum:1 } } }, { $sort: { cnt: -1 } }, { $limit: 10 }]).toArray();
    return res.json({ status: 'success', avgResolutionHours: avgHours, totals: { total, open, inprogress, resolved: resolvedCount }, topCategories: catAgg });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

module.exports = { createTicket, listTickets, getTicketById, addComment, updateTicket, stats };

// List staff members for support assignment
async function getStaffList(req, res) {
  try {
    const db = getDB();
    const { username } = req.query; // optional filter
    const q = {};
    if (username) q.username = username;
    const staff = await db.collection('staff').find(q).project({ _id: 1, name: 1, username: 1, active: 1 }).toArray();
    return res.json({ status: 'success', staff });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
}

module.exports.getStaffList = getStaffList;
