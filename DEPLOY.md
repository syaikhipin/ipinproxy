# Deployment Guide for iPin Proxy

## Render.com (Free Tier) - Recommended

### Why Render?
- ✅ **Free tier available** - Perfect for this lightweight app
- ✅ **512MB RAM** - More than enough (app uses ~5-10MB)
- ✅ **Auto-deploy from Git** - Push and deploy automatically
- ✅ **Persistent disk** - Database file persists between restarts
- ⚠️ **Sleeps after 15min** - First request wakes it up (~30s delay)

### Deployment Steps

#### Method 1: Using Blueprint (render.yaml)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Deploy on Render**
   - Go to https://render.com
   - Click "New +" → "Blueprint"
   - Connect your GitHub repository
   - Render will auto-detect `render.yaml`
   - Click "Apply"

3. **Set Environment Variables**
   In Render dashboard, set:
   ```
   MASTER_API_KEY=sk-<generate-random-string>
   UI_USERNAME=admin
   UI_PASSWORD=<strong-password>
   ```

4. **Done!**
   Access your proxy at: `https://your-app-name.onrender.com`

#### Method 2: Manual Setup

1. **Create Web Service**
   - Go to Render dashboard
   - Click "New +" → "Web Service"
   - Connect GitHub repository

2. **Configure Service**
   ```
   Name: ipin-proxy
   Environment: Node
   Branch: main
   Build Command: echo 'No build needed'
   Start Command: node server.js
   Plan: Free
   ```

3. **Add Environment Variables**
   Same as Method 1 above

4. **Deploy**
   Click "Create Web Service"

### After Deployment

1. **Access Admin Panel**
   - URL: `https://your-app-name.onrender.com`
   - Login with your `UI_USERNAME` and `UI_PASSWORD`

2. **Add Provider API Keys**
   - Go to "Providers" tab
   - Edit each provider and add your API keys
   - Save

3. **Create User API Keys**
   - Go to "API Keys" tab
   - Click "Add API Key"
   - Name it (e.g., "Production", "User1")
   - Copy the generated key
   - Give it to your users

4. **Test**
   ```bash
   curl https://your-app-name.onrender.com/health

   curl https://your-app-name.onrender.com/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <your-api-key>" \
     -d '{
       "model": "claude-3-5-sonnet-20241022",
       "messages": [{"role": "user", "content": "Hello!"}]
     }'
   ```

### Important Notes

1. **Cold Starts**
   - Free tier sleeps after 15 minutes of inactivity
   - First request after sleep takes ~30 seconds
   - Consider using a cron job to keep it awake if needed

2. **Database Persistence**
   - The `ipin-proxy.db` file persists between deployments
   - Backup regularly using the web UI export feature (coming soon)
   - Or use Render's persistent disk feature

3. **Memory Usage**
   - App uses ~5-10MB base
   - Each provider adds ~1-2MB
   - Free tier has 512MB - plenty of room!

4. **Logs**
   - View logs in Render dashboard
   - Check "Logs" tab in your service

## Alternative Platforms

### Railway

```bash
railway login
railway init
railway up
```

Set environment variables in Railway dashboard.

### Heroku

```bash
heroku create ipin-proxy
heroku config:set MASTER_API_KEY="sk-xxx"
heroku config:set UI_USERNAME="admin"
heroku config:set UI_PASSWORD="xxx"
git push heroku main
```

### Docker (VPS/Cloud)

```bash
docker build -t ipin-proxy .
docker run -d \
  -p 3000:3000 \
  -e MASTER_API_KEY="sk-xxx" \
  -e UI_USERNAME="admin" \
  -e UI_PASSWORD="xxx" \
  -v $(pwd)/ipin-proxy.db:/app/ipin-proxy.db \
  --restart unless-stopped \
  --name ipin-proxy \
  ipin-proxy
```

## Security Best Practices

1. **Strong Passwords**
   ```bash
   # Generate random password
   openssl rand -base64 32
   ```

2. **Unique API Keys**
   - Don't reuse keys across users
   - Use descriptive names
   - Disable keys when not needed

3. **HTTPS Only**
   - Render provides free HTTPS
   - Never use HTTP in production

4. **Regular Backups**
   ```bash
   # Download database from Render
   render ssh
   cat ipin-proxy.db > ~/backup.db
   ```

5. **Monitor Usage**
   - Check logs regularly
   - Disable suspicious API keys
   - Review provider usage

## Troubleshooting

### App won't start
- Check environment variables are set
- View logs in Render dashboard
- Ensure `node server.js` is the start command

### Can't login to admin
- Verify `UI_USERNAME` and `UI_PASSWORD` env vars
- Check browser console for errors
- Try incognito mode

### API requests failing
- Verify API key is correct
- Check provider API keys are configured
- Check model is enabled
- View server logs

### Database reset
If you need to reset everything:
1. Delete the web service
2. Create new one
3. Database will be recreated with defaults

## Performance Tips

1. **Keep it awake** (if needed)
   ```bash
   # Use cron-job.org or similar to ping every 10 minutes
   curl https://your-app-name.onrender.com/health
   ```

2. **Disable unused providers**
   - Reduces memory usage slightly
   - Faster startup

3. **Monitor memory**
   ```bash
   # View in health endpoint
   curl https://your-app-name.onrender.com/health
   ```

## Support

If you encounter issues:
1. Check the logs first
2. Review this guide
3. Check README.md
4. Open an issue on GitHub
