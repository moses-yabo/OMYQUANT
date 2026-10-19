# Render setup for browser storage

Deploy the latest source with `npm run build` and `npm start`, or use the Dockerfile. Set:

```text
NODE_ENV=production
APP_ORIGIN=https://omyquant.onrender.com
DEMO_MODE=true
```

Leave `MONGODB_URI` unset while testing browser-only accounts. The former LOCAL_AUTH, LOCAL_AUTH_DIR, AUTH_COOKIE_SECURE and JWT_SECRET settings are not used by the browser demo. No persistent disk is needed for localStorage accounts: the browser owns the data.

Registration/login are client actions, so JavaScript must load successfully. Deploying source changes requires a Render redeploy. Existing SQLite accounts are not imported; create an account in the browser after deployment.

The server still pins its public request origin from APP_ORIGIN or RENDER_EXTERNAL_URL so React Router's server-side form checks work behind Render's HTTPS proxy. Foreign origins remain rejected. Runtime environment variables are separate from localhost's .env file.
