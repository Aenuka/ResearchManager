const express = require('express');
const { getMe, login } = require('../controllers/authController');
const requireAuth = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.get('/me', requireAuth, getMe);

module.exports = router;
