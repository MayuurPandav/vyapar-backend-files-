const express = require('express');
const router = express.Router();
const { listOffers, createOffer, updateOffer, deleteOffer } = require('../controllers/offerController');

router.get('/', listOffers); // ?username=
router.post('/', createOffer);
router.put('/:id', updateOffer);
router.delete('/:id', deleteOffer);

module.exports = router;
