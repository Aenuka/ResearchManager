const cors = require('cors');
const express = require('express');
const morgan = require('morgan');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const requireAuth = require('./middleware/auth');
const sectionRoutes = require('./routes/sectionRoutes');

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  })
);
app.use(express.json());
app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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
