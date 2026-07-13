# Deployment

This project is split into:

- `server`: Express API for Render
- `client`: Create React App frontend for Vercel

## Render Backend

Use the root `render.yaml` Blueprint from the root GitHub repository.

Required Render environment variables:

```text
MONGO_URI=<your MongoDB Atlas connection string>
CLIENT_ORIGIN=https://<your-vercel-app>.vercel.app
EMAIL_USER=<sender email address>
EMAIL_PASS=<email app password>
```

The Blueprint generates these automatically:

```text
JWT_SECRET
JWT_ACCESS_SECRET
CAPTCHA_SECRET
```

The backend health check path is `/`.

## Vercel Frontend

Deploy from the `client` directory.

Required Vercel production environment variable:

```text
REACT_APP_API_URL=https://<your-render-service>.onrender.com
```

Build settings:

```text
Framework: Create React App
Build Command: npm run build
Output Directory: build
```

`client/vercel.json` already includes SPA routing fallback.

## Deploy Order

1. Deploy the Render backend and copy its `https://...onrender.com` URL.
2. Set `REACT_APP_API_URL` in Vercel to that Render URL.
3. Deploy the Vercel frontend and copy its `https://...vercel.app` URL.
4. Set `CLIENT_ORIGIN` in Render to the Vercel URL.
5. Redeploy/restart the Render backend.

Note: `client` is currently a nested Git repository in this workspace. For Vercel Git imports from the root repository, convert it to a normal tracked folder or deploy from `client` with the Vercel CLI.
