const jwt = require('jsonwebtoken');
const { isAllowedEmail } = require('../config/allowedEmails');

function normalizeEmail(email = '') {
  return email.trim().toLowerCase();
}

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required');
  }

  return process.env.JWT_SECRET;
}
// 
function getLoginPassword() {
  if (!process.env.LOGIN_PASSWORD) {
    throw new Error('LOGIN_PASSWORD is required');
  }

  return process.env.LOGIN_PASSWORD;
}

function userPayload(user) {
  return {
    id: user.email,
    name: user.name || user.email.split('@')[0],
    email: user.email,
  };
}

function issueToken(user) {
  return jwt.sign(userPayload(user), getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

async function login(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const name = (req.body.name || '').trim();
    const password = req.body.password || '';

    if (!isAllowedEmail(email)) {
      res.status(403).json({ message: 'This email is not allowed to log in.' });
      return;
    }

    if (password !== getLoginPassword()) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    const user = { email, name };

    res.json({
      token: issueToken(user),
      user: userPayload(user),
    });
  } catch (error) {
    next(error);
  }
}

async function getMe(req, res) {
  res.json({ user: userPayload(req.user) });
}

module.exports = {
  getMe,
  login,
};
