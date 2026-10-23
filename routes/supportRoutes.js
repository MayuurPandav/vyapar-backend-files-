const express = require('express');
const router = express.Router();
const { createTicket, listTickets, getTicketById, addComment, updateTicket, stats } = require('../controllers/supportController');

router.post('/tickets', createTicket);
router.get('/tickets', listTickets);
router.get('/tickets/:id', getTicketById);
router.post('/tickets/:id/comment', addComment);
router.put('/tickets/:id', updateTicket);
router.get('/stats', stats);

// staff list for assignment
router.get('/staff', require('../controllers/supportController').getStaffList);

module.exports = router;
