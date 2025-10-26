# Vercel Deployment Guide

This guide will help you deploy your dropbox-ai application to Vercel with both frontend and backend.

## Prerequisites

1. A GitHub account with this repository pushed
2. A Vercel account (sign up at [vercel.com](https://vercel.com))
3. API keys for your AI provider (Gemini or OpenAI)

## Configuration Files

The following files have been configured for Vercel deployment:

- **vercel.json**: Main Vercel configuration
- **package.json**: Root build commands
- **backend/server.js**: Modified to support serverless deployment

## Deployment Steps

### 1. Push Your Code to GitHub

Make sure all your changes are committed and pushed to GitHub:

```bash
git add .
git commit -m "Configure for Vercel deployment"
git push origin main
```

### 2. Import Project to Vercel

1. Go to [vercel.com](https://vercel.com) and log in
2. Click "Add New" → "Project"
3. Import your GitHub repository (`dropbox-ai`)
4. Vercel will auto-detect the configuration

### 3. Configure Build Settings

Vercel should automatically detect the settings from `vercel.json`, but verify:

- **Framework Preset**: Other
- **Root Directory**: `./` (leave as root)
- **Build Command**: `npm run vercel-build` or leave empty (will use vercel.json)
- **Output Directory**: `frontend/dist`
- **Install Command**: `npm install`

### 4. Set Environment Variables

Before deploying, add your environment variables in Vercel:

1. In your Vercel project, go to **Settings** → **Environment Variables**
2. Add the following variables:

   ```
   AI_PROVIDER=gemini (or "openai")
   GEMINI_API_KEY=your_gemini_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here (if using OpenAI)
   NODE_ENV=production
   ```

3. Make sure to add them for all environments (Production, Preview, Development)

### 5. Deploy

Click **Deploy** and Vercel will:
1. Install dependencies
2. Build the frontend
3. Set up the backend as serverless functions
4. Deploy everything

Your app will be available at: `https://your-project-name.vercel.app`

## How It Works

### Architecture

- **Frontend**: Built with Vite and deployed as static files to Vercel's CDN
- **Backend**: Express app running as Vercel serverless functions
- **Routes**:
  - `/api/*` routes to backend serverless functions
  - All other routes serve the frontend

### API Endpoints

All API calls use relative paths (`/api/...`), so they automatically work with Vercel's routing:
- Frontend on Vercel: `https://your-app.vercel.app/`
- Backend APIs: `https://your-app.vercel.app/api/*`

## Important Notes

### Stateless Backend

⚠️ **Important**: Vercel serverless functions are stateless. This means:

- In-memory storage (current `documents` and `actionItems` arrays) will be reset on each request
- You'll need to implement persistent storage (database) for production use

Recommended databases for Vercel:
- **Vercel Postgres** (PostgreSQL)
- **MongoDB Atlas** (MongoDB)
- **PlanetScale** (MySQL)
- **Supabase** (PostgreSQL with real-time features)

### Serverless Function Limits

- **Execution time**: 10 seconds (Hobby), 60 seconds (Pro)
- **Payload size**: 4.5 MB request/response
- If your AI operations take longer, consider using edge functions or upgrading to Pro

## Local Development

To test locally with production-like environment:

```bash
# Install Vercel CLI
npm i -g vercel

# Run locally with Vercel dev server
vercel dev
```

Or use the existing dev setup:

```bash
npm run dev
```

## Troubleshooting

### Build Fails

1. Check build logs in Vercel dashboard
2. Ensure all dependencies are in `package.json` (not just `devDependencies`)
3. Verify environment variables are set correctly

### API Routes Not Working

1. Check that `vercel.json` is in the root directory
2. Verify routes configuration in `vercel.json`
3. Check serverless function logs in Vercel dashboard

### Environment Variables Not Loading

1. Make sure variables are set in Vercel dashboard
2. Redeploy after adding new environment variables
3. Check that variable names match exactly (case-sensitive)

## Next Steps

After successful deployment:

1. **Set up a database** to replace in-memory storage
2. **Configure custom domain** (optional)
3. **Set up monitoring** with Vercel Analytics
4. **Enable preview deployments** for pull requests

## Build Command Summary

For Vercel GitHub integration, use:

**Build Command**: Leave empty or use `npm run vercel-build`

Vercel will automatically:
- Read `vercel.json` configuration
- Install dependencies
- Build frontend with `cd frontend && npm install && npm run build`
- Configure backend as serverless functions
- Deploy everything

---

Your application is now ready to deploy on Vercel! 🚀
