const cors = require('cors');
const express = require('express');
const morgan = require('morgan');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const requireAuth = require('./middleware/auth');
const sectionRoutes = require('./routes/sectionRoutes');

const app = express();
const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const configuredOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([...localOrigins, ...configuredOrigins]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      const error = new Error('Not allowed by CORS');
      error.status = 403;
      callback(error);
    },
    optionsSuccessStatus: 204,
  })
);
app.use(express.json());
app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/', (req, res) => {
  res.json({
    name: 'Research Manager API',
    status: 'ok',
    health: '/api/health',
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/sections', requireAuth, sectionRoutes);

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({
    message: error.message || 'Something went wrong',
  });
});

module.exports = app;
