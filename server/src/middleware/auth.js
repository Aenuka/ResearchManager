const jwt = require('jsonwebtoken');
const { isAllowedEmail } = require('../config/allowedEmails');

function getToken(req) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return '';
  }

  return token;
}

async function requireAuth(req, res, next) {
  try {
    const token = getToken(req);

    if (!token) {
      res.status(401).json({ message: 'Please log in.' });
      return;
    }

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is required');
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (!isAllowedEmail(payload.email)) {
      res.status(403).json({ message: 'This email is no longer allowed.' });
      return;
    }

    req.user = {
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
    };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      res.status(401).json({ message: 'Please log in again.' });
      return;
    }

    next(error);
  }
}

module.exports = requireAuth;
