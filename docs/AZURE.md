# Deploy CareerTrack to Azure App Service

The workflow `.github/workflows/azure-deploy.yml` runs on every push to `main` (or manually from the **Actions** tab). It works in this order:

1. lint and test (against a temporary MongoDB)
2. build the React client
3. package the server, the built client and production dependencies into `app.zip`
4. deploy to Azure App Service
5. check `/api/health`

## One-time setup (≈10 minutes)

### 1. Database

Use **MongoDB Atlas** (choose Azure as the cloud provider; a free tier is available) or **Azure Cosmos DB for MongoDB (vCore)**. Copy its connection string, for example
`mongodb+srv://user:pass@cluster.mongodb.net/careertrack`.

In Atlas, allow access from Azure under *Network Access*: add the Web App's outbound IPs, or `0.0.0.0/0` for a quick start.

### 2. Create the Web App (Azure CLI or the Portal)

```bash
RG=careertrack-rg
APP=careertrack-app          # must be globally unique; also set AZURE_WEBAPP_NAME in the workflow
LOCATION=centralindia

az group create -n $RG -l $LOCATION
az appservice plan create -g $RG -n careertrack-plan --is-linux --sku B1
az webapp create -g $RG -p careertrack-plan -n $APP --runtime "NODE:22-lts"

# App settings (environment variables)
az webapp config appsettings set -g $RG -n $APP --settings \
  NODE_ENV=production \
  MONGODB_URI="<your MongoDB connection string>" \
  JWT_SECRET="$(openssl rand -hex 48)" \
  TRUST_PROXY=1 \
  SCM_DO_BUILD_DURING_DEPLOYMENT=false

# Recommended: HTTPS only, always-on, health check
az webapp update -g $RG -n $APP --https-only true
az webapp config set -g $RG -n $APP --always-on true --generic-configurations '{"healthCheckPath": "/api/health"}'
```

You don't need to set a startup command. App Service runs `npm start` and provides `PORT`.

### 3. Connect GitHub to Azure

1. Download the publish profile:
   `az webapp deployment list-publishing-profiles -g $RG -n $APP --xml > profile.xml`
   (or Portal → Web App → *Download publish profile*).
   If the download is blocked, turn on *Configuration → General settings → SCM Basic Auth Publishing Credentials*.
2. In GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
   - Value: the full contents of `profile.xml`
3. Edit `AZURE_WEBAPP_NAME` at the top of `.github/workflows/azure-deploy.yml` to match `$APP`.

### 4. Deploy

Push to `main`, or open **Actions → Deploy to Azure App Service → Run workflow**. When it finishes, the app is live at `https://<APP>.azurewebsites.net`.

Optional: load demo data from Azure's SSH console (Portal → Web App → *SSH*):
`cd /home/site/wwwroot && node server/src/seed.js`

## Optional settings

| Setting | Purpose |
| --- | --- |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email reminders (e.g. SendGrid, Azure Communication Services SMTP) |
| `APP_URL` | Public URL used in email links, e.g. `https://<APP>.azurewebsites.net` |
| `SCHEDULER_TIMEZONE` | Time zone for reminder emails, e.g. `Asia/Kolkata` |

## Troubleshooting

- **App doesn't start / 503:** check *Log stream* in the Portal. The server prints exactly which environment variable is missing or invalid.
- **`db: disconnected` on /api/health:** the MongoDB connection string or the network allow-list is wrong.
- **Login doesn't persist:** open the site over `https://`. Cookies are `Secure` in production.
