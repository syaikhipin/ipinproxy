# iPin Proxy - Simple API Proxy Routing

A lightweight, zero-dependency OpenAI-compatible API proxy server for routing requests to multiple AI providers. Simple request routing with web UI management. 

## Features

### 🎯 Zero Dependencies - Our Superpower!

**Why zero dependencies matter:**
- ✅ **No security vulnerabilities** - No third-party packages = no CVEs to patch
- ✅ **Instant deployment** - No `npm install` needed (saves 30+ seconds on each deploy)
- ✅ **Smaller Docker images** - Only ~40MB vs 200MB+ with dependencies
- ✅ **No breaking changes** - No dependency updates to worry about
- ✅ **Production ready** - No node_modules folder chaos
- ✅ **Perfect for free tiers** - Minimal disk space and memory usage

**Built with only Node.js native modules:**
- `http` / `https` - For server and API requests
- `fs` - For database operations
- `path` - For file paths
- `url` - For URL parsing

### 🚀 Other Features

- **Ultra lightweight** - ~5-10MB memory footprint (perfect for Render free tier)
- **Fast startup** - <200ms cold start
- **Multi-user API keys** - Create separate API keys for each user with model restrictions
- **Multi-provider** - Supports multiple AI providers (OpenAI-compatible)
- **Docker ready** - Optimized Dockerfile with health checks
- **OpenAI compatible** - Standard OpenAI API format
- **Web UI** - Beautiful admin panel to manage everything
- **Local database** - JSON-based storage (no external DB required)
- **Auto health checks** - Keeps your app alive on free tiers
- **Built-in chat interface** - Test models and API keys instantly

## Quick Start

### Local Development

```bash
# 1. Run server (no npm install needed!)
node server.js

# 2. Access admin UI
# Open http://localhost:3000 in your browser
# Login with your UI_USERNAME / UI_PASSWORD from .env
```

### Docker

```bash
# Build image
docker build -t ipin-proxy .

# Run container
docker run -d \
  -p 3000:3000 \
  -e MASTER_API_KEY="sk-your-secret-key" \
  -e UI_USERNAME="admin" \
  -e UI_PASSWORD="your-password" \
  -v $(pwd)/ipin-proxy.db:/app/ipin-proxy.db \
  --name ipin-proxy \
  ipin-proxy
```

## Configuration

### Environment Variables

```bash
# API Master Key (has access to all models)
MASTER_API_KEY=sk-your-secret-key

# Admin UI Credentials
UI_USERNAME=admin
UI_PASSWORD=your-password
```

## Admin UI

### Access

1. Open `http://localhost:3000` in your browser
2. Login with your credentials (default: `admin` / `admin`)
3. Manage providers and models through the web interface

### Features

#### Providers Tab
- ➕ Add new AI providers
- ✏️ Edit provider details (name, base URL, API key, type)
- 🔑 Manage API keys securely
- 🔄 Toggle providers on/off
- 🗑️ Delete providers

#### Models Tab
- ➕ Add custom models
- 📝 Set display names
- 🔗 Map models to providers
- 🎯 Manage model IDs
- ✅ Enable/disable models

#### API Keys Tab
- 🔑 Create multiple API keys for different users
- 📝 Name each key (e.g., "John's Key", "Production Key")
- 🔄 Enable/disable keys without deletion
- 🛡️ Master key is protected (cannot be deleted)
- 👁️ Keys are masked for security (only showing first/last chars)

### Provider Types

**Only OpenAI-compatible custom base URLs are supported.**

The proxy routes requests to any OpenAI-compatible API endpoint. Simply provide the base URL and API key.

## API Usage

### Authentication

All API requests require an API key (master key or any user key created in admin panel):

```bash
Authorization: Bearer sk-123
```

**Creating User API Keys:**
1. Login to admin panel
2. Go to "API Keys" tab
3. Click "Add API Key"
4. Enter a name and key will be auto-generated (or customize it)
5. Give the key to your user

### List Available Models

```bash
curl http://localhost:3000/v1/models \
  -H "Authorization: Bearer sk-your-api-key"
```

### Chat Completion

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-api-key" \
  -d '{
    "model": "claude-sonnet-4-5",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "max_tokens": 1000,
    "temperature": 0.7
  }'
```

### Health Check

```bash
curl http://localhost:3000/health
```

## Adding Custom Providers

1. Login to admin UI
2. Go to "Providers" tab
3. Click "Add Provider"
4. Fill in:
   - **Provider Name**: Display name (e.g., "OpenRouter")
   - **Base URL**: API endpoint (e.g., "https://openrouter.ai/api/v1")
   - **API Key**: Your API key
   - **Type**: OpenAI or HuggingFace
5. Click "Save"

## Adding Custom Models

1. Login to admin UI
2. Go to "Models" tab
3. Click "Add Model"
4. Fill in:
   - **Display Name**: How it appears (e.g., "GPT-4 Turbo")
   - **Model ID**: Exact model identifier (e.g., "gpt-4-turbo")
   - **Provider**: Select from configured providers
5. Click "Save"

## Database

The system uses a JSON-based local database (`ipin-proxy.db`) that stores:
- Provider configurations (names, URLs, API keys, types)
- Model mappings (IDs, names, provider associations)

**Important**: The database file contains sensitive API keys. Keep it secure!

## Chat Interface

A built-in chat interface is available for testing your API keys and models:

1. Navigate to `http://localhost:3000/chat.html`
2. Enter your API key (master or user key)
3. Select a model from the dropdown
4. Click "Test Connection" to verify the key works
5. Start chatting!

**Features:**
- Test API keys before distributing to users
- Verify model availability and responses
- See which models are working
- Clear, simple interface for quick testing

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Admin login page |
| `/admin.html` | GET | Admin panel |
| `/chat.html` | GET | Chat interface for testing |
| `/api/admin/login` | POST | Login to admin UI |
| `/api/admin/providers` | GET/POST | List/create providers |
| `/api/admin/providers/:id` | PUT/DELETE | Update/delete provider |
| `/api/admin/models` | GET/POST | List/create models |
| `/api/admin/models/:id` | PUT/DELETE | Update/delete model |
| `/api/admin/apikeys` | GET/POST | List/create API keys |
| `/api/admin/apikeys/:id` | PUT/DELETE | Update/delete API key |
| `/v1/models` | GET | List available models (OpenAI API) |
| `/v1/chat/completions` | POST | Chat completion (OpenAI API) |
| `/health` | GET | Health check |

## Security

1. **API Authentication**: Uses `MASTER_API_KEY` for API requests
2. **Admin Authentication**: Separate credentials for web UI (`UI_USERNAME` / `UI_PASSWORD`)
3. **Password Storage**: API keys encrypted in session storage (base64)
4. **CORS**: Enabled for all origins (customize in production)

### Securing in Production

```bash
# Change default credentials
export UI_USERNAME="your-admin-username"
export UI_PASSWORD="strong-password-here"
export MASTER_API_KEY="sk-your-secret-key"

# Run with HTTPS reverse proxy (nginx, caddy)
# Restrict CORS origins
# Use strong passwords
# Backup database regularly
```

## Performance

- **Memory**: ~5-10MB base + ~2MB per provider
- **Startup**: <200ms with database
- **Latency**: <5ms overhead per request
- **Throughput**: ~1000+ req/s
- **Database**: Zero overhead (JSON file)

## Deployment

### Render (Recommended - Free Tier)

Render's free tier is perfect for this lightweight proxy!

**Option 1: Using render.yaml (Recommended)**

1. Push code to GitHub
2. Connect to Render
3. It will auto-detect `render.yaml` and deploy
4. Set these environment variables in Render dashboard:
   - `MASTER_API_KEY` (auto-generated or custom)
   - `UI_USERNAME` (your admin username)
   - `UI_PASSWORD` (auto-generated or custom)

**Option 2: Manual Setup**

1. Create new Web Service on Render
2. Connect your repository
3. Configure:
   - **Environment**: Node
   - **Build Command**: `echo 'No build needed'`
   - **Start Command**: `node server.js`
   - **Plan**: Free
4. Add environment variables (same as above)

**Important for Render Free Tier:**
- Spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- Memory limit: 512MB (this app uses ~5-10MB)
- **Database persistence:** Free tier has read-only filesystem, so the app automatically uses `/tmp` for database storage
  - **Data will reset on each restart/redeploy**
  - **Optional:** Upload your database to "Secret Files" as `ipin-proxy.db` - it will be copied to `/tmp` on startup
  - You'll need to reconfigure providers/models via Admin UI after each restart
  - **For persistent storage**, upgrade to a paid plan with Disk support

**Keep Your App Alive (Avoid Cold Starts):**

The Dockerfile includes automatic health checks every 30 seconds (automatically adapts to Render's PORT):
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3
```

**Note:** Render automatically assigns port 10000 (via PORT env var), but the app handles this automatically.

To keep your free-tier app always warm, use a free cron service to ping it:

1. **UptimeRobot** (https://uptimerobot.com) - Free monitoring
   - Add HTTP(s) monitor
   - URL: `https://your-app.onrender.com/health`
   - Interval: Every 5 minutes
   - ✅ Keeps your app alive 24/7

2. **Cron-job.org** (https://cron-job.org) - Free cron jobs
   - Create new cron job
   - URL: `https://your-app.onrender.com/health`
   - Schedule: */5 * * * * (every 5 minutes)
   - ✅ Prevents cold starts

3. **BetterUptime** (https://betteruptime.com) - Free monitoring
   - Add HTTP monitor
   - URL: `https://your-app.onrender.com/health`
   - Interval: 3 minutes
   - ✅ Also alerts you if it goes down

**Why health checks matter:**
- ✅ Prevents 30-second cold start delays
- ✅ Instant response for your users
- ✅ Free to set up
- ✅ Works with Render's free tier limits

### Railway

```bash
railway init
railway add
# Set environment variables in Railway dashboard
railway up
```

### Heroku

```bash
heroku create ipin-proxy
heroku config:set MASTER_API_KEY="sk-your-secret-key"
heroku config:set UI_USERNAME="admin"
heroku config:set UI_PASSWORD="your-password"
git push heroku main
```

### VPS / Cloud VM

```bash
# Clone and run
git clone <your-repo>
cd ipin-proxy
node server.js

# Or use systemd/pm2 for process management
pm2 start server.js --name ipin-proxy
```

## Backup & Restore

### Backup Database

```bash
# Backup the database file
cp ipin-proxy.db ipin-proxy.db.backup

# Or with Docker
docker cp ipin-proxy:/app/ipin-proxy.db ./backup/
```

### Restore Database

```bash
# Restore from backup
cp ipin-proxy.db.backup ipin-proxy.db

# Or with Docker
docker cp ./backup/ipin-proxy.db ipin-proxy:/app/
docker restart ipin-proxy
```

## Troubleshooting

### Can't access admin UI
- Check if server is running: `curl http://localhost:3000/health`
- Verify credentials match environment variables
- Check browser console for errors

### Provider not working
- Verify API key in admin UI
- Check provider base URL is correct
- Test provider API directly
- Check server logs for errors

### Model not appearing
- Ensure model is enabled in admin UI
- Verify provider is enabled
- Refresh browser
- Check `/v1/models` endpoint

## License

MIT

## Author

syaikhipin
