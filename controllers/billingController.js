const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');

// --- COUPON MANAGEMENT ---
exports.getCoupons = async (req, res) => {
    try {
        const db = getDB();
        const coupons = await db.collection('sa_coupons').find({}).toArray();
        res.json(coupons);
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.createCoupon = async (req, res) => {
    try {
        const db = getDB();
        const { code, type, value, expiry, maxUses } = req.body;
        
        if (!code || !type || !value) {
            return res.status(400).json({ status: 'error', message: 'Missing required fields' });
        }
        
        const newCoupon = {
            code: code.toUpperCase(),
            type, // 'percentage' or 'flat'
            value: Number(value),
            expiry: expiry ? new Date(expiry) : null,
            maxUses: maxUses ? Number(maxUses) : null,
            uses: 0,
            status: 'active',
            createdAt: new Date()
        };
        
        await db.collection('sa_coupons').insertOne(newCoupon);
        res.json({ status: 'success', message: 'Coupon created successfully' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.deleteCoupon = async (req, res) => {
    try {
        const db = getDB();
        const { id } = req.params;
        await db.collection('sa_coupons').deleteOne({ _id: new ObjectId(id) });
        res.json({ status: 'success', message: 'Coupon deleted' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// --- REFUND MANAGEMENT ---
exports.getRefunds = async (req, res) => {
    try {
        const db = getDB();
        const refunds = await db.collection('sa_refunds').find({}).sort({ createdAt: -1 }).toArray();
        res.json(refunds);
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.processRefund = async (req, res) => {
    try {
        const db = getDB();
        const { paymentId, amount, reason } = req.body;
        
        if (!paymentId || !amount) {
            return res.status(400).json({ status: 'error', message: 'Payment ID and amount required' });
        }
        
        let payment;
        try {
            payment = await db.collection('sa_payments').findOne({ _id: new ObjectId(paymentId) });
        } catch(e) {
            // handle case where paymentId might be string but not objectId
            payment = await db.collection('sa_payments').findOne({ _id: paymentId });
        }
        
        if (!payment) {
            return res.status(404).json({ status: 'error', message: 'Payment not found' });
        }
        
        const refundRecord = {
            paymentId,
            username: payment.username,
            amount: Number(amount),
            reason: reason || 'Manual Refund',
            status: 'completed',
            createdAt: new Date()
        };
        
        await db.collection('sa_refunds').insertOne(refundRecord);
        
        // Update payment record to reflect refund
        await db.collection('sa_payments').updateOne(
            { _id: payment._id },
            { $set: { refund_status: 'refunded', refunded_amount: Number(amount) } }
        );
        
        res.json({ status: 'success', message: 'Refund processed successfully' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// --- MANUAL OVERRIDE ---
exports.manualOverride = async (req, res) => {
    try {
        const db = getDB();
        const { username, plan_name, amount, cycle, method, date } = req.body;
        
        if (!username || !plan_name || amount == null) {
            return res.status(400).json({ status: 'error', message: 'Missing fields' });
        }
        
        const newPayment = {
            username,
            plan_name,
            amount: Number(amount),
            cycle: cycle || 'MONTHLY',
            method: method || 'MANUAL',
            date: date || new Date().toISOString().split('T')[0],
            status: 'PAID',
            auto_renewal: false,
            createdAt: new Date()
        };
        
        await db.collection('sa_payments').insertOne(newPayment);
        res.json({ status: 'success', message: 'Payment overridden successfully' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// --- REVENUE REPORTS ---
exports.getRevenueReports = async (req, res) => {
    try {
        const db = getDB();
        const payments = await db.collection('sa_payments').find({}).toArray();
        
        let daily = {};
        let monthly = {};
        let yearly = {};
        
        payments.forEach(p => {
            const amt = Number(p.amount) || 0;
            if (amt === 0) return;
            
            let dateStr = p.date; // assume YYYY-MM-DD
            if (!dateStr && p.createdAt) {
                dateStr = new Date(p.createdAt).toISOString().split('T')[0];
            }
            if (!dateStr) return;
            
            const day = dateStr;
            const month = dateStr.substring(0, 7); // YYYY-MM
            const year = dateStr.substring(0, 4); // YYYY
            
            daily[day] = (daily[day] || 0) + amt;
            monthly[month] = (monthly[month] || 0) + amt;
            yearly[year] = (yearly[year] || 0) + amt;
        });
        
        res.json({ daily, monthly, yearly });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// --- CONFIG ---
exports.getGatewayConfig = async (req, res) => {
    try {
        const db = getDB();
        const configKeys = ['razorpay_key', 'stripe_key', 'payu_key', 'upi_id', 'gst_rate'];
        let config = {};
        
        for (const key of configKeys) {
            const doc = await db.collection('sa_config').findOne({ config_key: key });
            config[key] = doc ? doc.config_value : '';
        }
        
        res.json(config);
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.updateGatewayConfig = async (req, res) => {
    try {
        const db = getDB();
        const updates = req.body; // { razorpay_key: '...', stripe_key: '...' }
        
        for (const [key, value] of Object.entries(updates)) {
            await db.collection('sa_config').updateOne(
                { config_key: key },
                { $set: { config_key: key, config_value: value } },
                { upsert: true }
            );
        }
        
        res.json({ status: 'success', message: 'Config updated' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// --- AUTOMATED REFUND REQUESTS ---
exports.requestRefund = async (req, res) => {
    try {
        const db = getDB();
        const { paymentId, amount, reason, username } = req.body;
        
        if (!paymentId || !amount || !reason || !username) {
            return res.status(400).json({ status: 'error', message: 'paymentId, amount, reason, and username required' });
        }
        
        // 1. Fetch payment and verify ownership
        let payment;
        try {
            payment = await db.collection('sa_payments').findOne({ _id: new ObjectId(paymentId) });
        } catch(e) {
            payment = await db.collection('sa_payments').findOne({ _id: paymentId });
        }
        
        if (!payment) {
            return res.status(404).json({ status: 'error', message: 'Payment record not found' });
        }
        
        if (payment.username !== username) {
            return res.status(403).json({ status: 'error', message: 'Payment record does not belong to this user' });
        }
        
        // Check refund eligibility (within 30 days)
        let payDate = payment.createdAt ? new Date(payment.createdAt) : new Date(payment.date);
        const diffTime = Math.abs(new Date() - payDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 30) {
            return res.status(400).json({ status: 'error', message: 'Refund request window has expired (maximum 30 days)' });
        }
        
        // Check if there is already an active refund request for this payment
        const existingRequest = await db.collection('sa_refund_requests').findOne({ paymentId: String(paymentId) });
        if (existingRequest) {
            return res.status(400).json({ status: 'error', message: 'A refund request already exists for this payment' });
        }
        
        // 2. Insert Refund Request
        const requestRecord = {
            paymentId: String(paymentId),
            username,
            amount: Number(amount),
            reason,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
        };
        const insertResult = await db.collection('sa_refund_requests').insertOne(requestRecord);
        const requestId = String(insertResult.insertedId);
        
        // 3. Automatically create support ticket
        const ticketTitle = `Automated Refund Request: Payment #${String(paymentId).substring(0,8).toUpperCase()}`;
        const ticketDesc = `Auto-generated refund request for Payment ID: ${paymentId}.
Username: ${username}
Plan: ${payment.plan_name}
Amount Requested: ₹${amount}
Reason: ${reason}
Refund Request Ref: ${requestId}`;

        const slaHours = 24; // high priority
        const slaDeadline = new Date();
        slaDeadline.setHours(slaDeadline.getHours() + slaHours);

        const ticket = {
            title: ticketTitle,
            description: ticketDesc,
            username,
            category: 'Billing Issue',
            priority: 'high',
            attachments: [],
            status: 'open',
            assignedTo: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            slaDeadline,
            resolvedAt: null
        };
        const ticketResult = await db.collection('sa_tickets').insertOne(ticket);
        const ticketId = String(ticketResult.insertedId);
        
        // Link ticket to refund request
        await db.collection('sa_refund_requests').updateOne(
            { _id: new ObjectId(requestId) },
            { $set: { ticketId } }
        );
        
        // Add notification to Super Admin notification center
        await db.collection('sa_notifications').insertOne({
            username,
            type: 'refund_request',
            severity: 'high',
            title: `Refund Requested: ₹${amount}`,
            message: `User ${username} requested a refund for Payment ID: ${paymentId}. Reason: ${reason}`,
            createdAt: new Date(),
            read: false
        });
        
        // Audit log
        try {
            const { logAudit } = require('./authController');
            await logAudit(username, 'REFUND_REQUEST_SUBMITTED', `amount=${amount}, ref=${requestId}`);
        } catch (_) {}
        
        res.json({ status: 'success', message: 'Refund request submitted successfully and support ticket created.', requestId, ticketId });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.getUserRefundRequests = async (req, res) => {
    try {
        const db = getDB();
        const { username } = req.query;
        if (!username) {
            return res.status(400).json({ status: 'error', message: 'username required' });
        }
        const requests = await db.collection('sa_refund_requests').find({ username }).toArray();
        res.json(requests);
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.getRefundRequests = async (req, res) => {
    try {
        const db = getDB();
        const { status } = req.query;
        const query = status ? { status } : {};
        const requests = await db.collection('sa_refund_requests').find(query).sort({ createdAt: -1 }).toArray();
        res.json(requests);
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.handleRefundRequestAction = async (req, res) => {
    try {
        const db = getDB();
        const { id } = req.params; // request id
        const { action, rejectionReason, actor = 'SYSTEM' } = req.body;
        
        if (!id || !action || !['approve', 'reject'].includes(action)) {
            return res.status(400).json({ status: 'error', message: 'id, and action ("approve" or "reject") are required' });
        }
        
        const request = await db.collection('sa_refund_requests').findOne({ _id: new ObjectId(id) });
        if (!request) {
            return res.status(404).json({ status: 'error', message: 'Refund request not found' });
        }
        
        if (request.status !== 'pending') {
            return res.status(400).json({ status: 'error', message: 'Refund request is already processed' });
        }
        
        if (action === 'approve') {
            // Process the refund (updates payment, records sa_refunds)
            let payment;
            try {
                payment = await db.collection('sa_payments').findOne({ _id: new ObjectId(request.paymentId) });
            } catch(e) {
                payment = await db.collection('sa_payments').findOne({ _id: request.paymentId });
            }
            
            if (!payment) {
                return res.status(404).json({ status: 'error', message: 'Payment record not found' });
            }
            
            const refundRecord = {
                paymentId: request.paymentId,
                username: request.username,
                amount: Number(request.amount),
                reason: request.reason || 'Requested Refund',
                status: 'completed',
                createdAt: new Date()
            };
            
            await db.collection('sa_refunds').insertOne(refundRecord);
            
            // Update payment record to reflect refund
            await db.collection('sa_payments').updateOne(
                { _id: payment._id },
                { $set: { refund_status: 'refunded', refunded_amount: Number(request.amount) } }
            );
            
            // Update request status
            await db.collection('sa_refund_requests').updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: 'approved', processedBy: actor, updatedAt: new Date() } }
            );
            
            // Update Support Ticket status to resolved
            if (request.ticketId) {
                await db.collection('sa_tickets').updateOne(
                    { _id: new ObjectId(request.ticketId) },
                    { $set: { status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() } }
                );
                
                // Add automated comment to ticket
                const commentDoc = {
                    ticketId: String(request.ticketId),
                    author: actor,
                    message: `Refund Request of ₹${request.amount} has been APPROVED and processed successfully by ${actor}.`,
                    createdAt: new Date()
                };
                await db.collection('sa_ticket_comments').insertOne(commentDoc);
            }
            
            // Audit log
            try {
                const { logAudit } = require('./authController');
                await logAudit(actor, 'REFUND_REQUEST_APPROVED', `reqId=${id}, amount=${request.amount}`);
            } catch (_) {}
            
            return res.json({ status: 'success', message: 'Refund request approved and processed successfully.' });
        } else {
            // Reject refund request
            if (!rejectionReason) {
                return res.status(400).json({ status: 'error', message: 'Rejection reason is required' });
            }
            
            // Update request status
            await db.collection('sa_refund_requests').updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: 'rejected', rejectionReason, processedBy: actor, updatedAt: new Date() } }
            );
            
            // Comment on Support Ticket
            if (request.ticketId) {
                const commentDoc = {
                    ticketId: String(request.ticketId),
                    author: actor,
                    message: `Refund Request of ₹${request.amount} has been REJECTED by ${actor}. Reason: ${rejectionReason}`,
                    createdAt: new Date()
                };
                await db.collection('sa_ticket_comments').insertOne(commentDoc);
            }
            
            // Audit log
            try {
                const { logAudit } = require('./authController');
                await logAudit(actor, 'REFUND_REQUEST_REJECTED', `reqId=${id}, reason=${rejectionReason}`);
            } catch (_) {}
            
            return res.json({ status: 'success', message: 'Refund request has been rejected.' });
        }
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};
