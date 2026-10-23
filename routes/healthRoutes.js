const express = require('express');
const router = express.Router();
const { getDB } = require('../config/db');

router.get('/health', async (req, res) => {
  try {
    const db = getDB();
    // Ping the database to ensure connectivity
    await db.command({ ping: 1 });
    return res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
