# iPin Proxy - Simple API Proxy Routing

A lightweight, zero-dependency OpenAI-compatible API proxy server for routing requests to multiple AI providers. Simple request routing with web UI management. 

## Features

- ✨ **Zero dependencies** - Uses only Node.js native modules
- 🚀 **Ultra lightweight** - ~5-10MB memory footprint (perfect for Render free tier)
- ⚡ **Fast startup** - No npm install needed in production
- 🔒 **Multi-user API keys** - Create separate API keys for each user
- 🎯 **Multi-provider** - Supports multiple AI providers
- 🐳 **Docker ready** - Includes optimized Dockerfile
- 🌐 **OpenAI compatible** - Standard OpenAI API format
- 🎨 **Web UI** - Beautiful admin panel to manage everything
- 💾 **Local database** - JSON-based storage (no external DB required)
- ☁️ **Render ready** - Optimized for free tier deployment

## Quick Start

### Local Development

```bash
# 1. Run server (no npm install needed!)
node server.js

# 2. Access admin UI
# Open http://localhost:3000 in your browser
# Login: syaikhipin / 12345678
```

### Docker

```bash
# Build image
docker build -t ipin-proxy .

# Run container
docker run -d \
  -p 3000:3000 \
  -e IPIN_MASTER_KEY="sk-julio1234" \
  -e UI_USERNAME="admin" \
  -e UI_PASSWORD="your-password" \
  -v $(pwd)/ipin-proxy.db:/app/ipin-proxy.db \
  --name ipin-proxy \
  ipin-proxy
```

## Configuration

### Environment Variables

```bash
# API Master Key (for API requests)
IPIN_MASTER_KEY=sk-julio1234

# Admin UI Credentials
UI_USERNAME=syaikhipin
UI_PASSWORD=12345678

# Optional: Pre-configure provider API keys
FEATHERLESS_API_KEY_CUSTOM=your-key
IFLOW_API_KEY_CUSTOM=your-key
SONNET_API_KEY_CUSTOM=your-key
HUGGINGFACE_API_KEY=your-key
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
  -H "Authorization: Bearer sk-julio1234"
```

### Chat Completion

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-julio1234" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
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

## Default Models

The system comes pre-configured with:

**Featherless:**
- `meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo`
- `Qwen/QwQ-32B-Preview`

**iFlow:**
- `Qwen/Qwen2.5-Coder-32B-Instruct`
- `deepseek-ai/DeepSeek-V3`

**Sonnet (Claude):**
- `claude-3-5-sonnet-20241022`
- `claude-sonnet-4-20250514`

**HuggingFace:**
- `meta-llama/Llama-3.3-70B-Instruct`

You can add, edit, or remove models through the admin UI.

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

1. **API Authentication**: Uses `IPIN_MASTER_KEY` for API requests
2. **Admin Authentication**: Separate credentials for web UI (`UI_USERNAME` / `UI_PASSWORD`)
3. **Password Storage**: API keys encrypted in session storage (base64)
4. **CORS**: Enabled for all origins (customize in production)

### Securing in Production

```bash
# Change default credentials
export UI_USERNAME="your-admin-username"
export UI_PASSWORD="strong-password-here"
export IPIN_MASTER_KEY="sk-your-secret-key"

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
   - `IPIN_MASTER_KEY` (auto-generated or custom)
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

**Important for Render:**
- Free tier spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- Memory limit: 512MB (this app uses ~5-10MB)
- Database file persists between restarts

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
heroku config:set IPIN_MASTER_KEY="your-key"
heroku config:set UI_USERNAME="admin"
heroku config:set UI_PASSWORD="password"
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
