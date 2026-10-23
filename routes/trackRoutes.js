const express = require('express');
const router = express.Router();
const { trackOpen, trackClick } = require('../controllers/trackController');

router.get('/open/:id.png', trackOpen);
router.get('/click', trackClick);

module.exports = router;
