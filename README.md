# Research Manager

A MERN stack app for creating research sections and attaching PDF files, titles, descriptions, and audio recordings.

## Setup

1. Install dependencies:

```bash
npm install
npm run install:all
```

2. Copy the server environment file:

```bash
cp server/.env.example server/.env
```

3. Make sure MongoDB is running locally, or update `MONGODB_URI` in `server/.env`.

4. Start the app:

```bash
npm run dev
```

The React app runs at `http://localhost:5173` and the API runs at `http://localhost:5001`.
