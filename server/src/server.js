require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');

const port = process.env.PORT || 5001;

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`API running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  });
