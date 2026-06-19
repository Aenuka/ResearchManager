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

## Free deployment

This app has two deployable parts:

- Frontend: deploy `client` to Netlify.
- Backend API: deploy `server` to Railway.
- Database: use MongoDB Atlas Free cluster.

### 1. Create MongoDB Atlas database

Create an Atlas Free cluster, add a database user, allow network access from your backend host, and copy the MongoDB connection string. Use that value as `MONGODB_URI` in the backend host.

### 2. Deploy backend on Railway

Create a Railway service from this GitHub repo and configure it as the backend service:

- Root directory: `server`
- Config file path: `/server/railway.json`
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`

Set these Railway environment variables:

```bash
MONGODB_URI=mongodb+srv://...
CLIENT_ORIGIN=https://your-netlify-site.netlify.app
JWT_SECRET=a-long-random-secret
JWT_EXPIRES_IN=7d
LOGIN_PASSWORD=your-login-password
ALLOWED_EMAILS=email1@example.com,email2@example.com
```

After deploy, generate a Railway public domain in the service Networking settings. Copy the Railway service URL, for example:

```bash
https://your-service.up.railway.app
```

### 3. Deploy frontend on Netlify

The included `netlify.toml` config tells Netlify to build the Vite app from `client`.

Set this Netlify environment variable:

```bash
VITE_API_BASE_URL=https://your-service.up.railway.app
```

Then deploy from the Git repository. After Netlify gives you the final frontend URL, update `CLIENT_ORIGIN` on Railway to that exact URL and redeploy/restart the backend.

### Upload storage note

The current backend stores uploaded PDFs, audio, and images on local disk. For long-term uploads on Railway, add a persistent Railway volume or move file storage to Cloudinary, S3, Railway Buckets, or another persistent object storage provider.
