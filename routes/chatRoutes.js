const express = require('express');
const router = express.Router();
const { sendMessage, listThreads, getMessages } = require('../controllers/chatController');

router.post('/send', sendMessage);
router.get('/threads', listThreads);
router.get('/threads/:threadId/messages', getMessages);

module.exports = router;
