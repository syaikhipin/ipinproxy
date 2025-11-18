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
- **OpenAI compatible** - Standard OpenAI API format for all endpoints
- **Web UI** - Beautiful admin panel to manage everything
- **Local database** - JSON-based storage (no external DB required)
- **Auto health checks** - Keeps your app alive on free tiers
- **Built-in chat interface** - Test models and API keys instantly with image upload
- **Vision support** - Built-in image handling for Claude, GPT-4, Gemini, Qwen VL
- **Embeddings** - Full support for text embeddings via `/v1/embeddings`
- **Audio transcription** - Whisper API support via `/v1/audio/transcriptions`
- **User management** - Create user accounts with dashboard access

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

# Optional: Comma-separated fallback directories for ipin-proxy.db
# Used when project root is read-only. Falls back to /tmp if none work.
DB_STORAGE_PATHS=/data/db,/mnt/volume
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

**Text-only request:**

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

**With image upload (Vision models):**

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-api-key" \
  -d '{
    "model": "claude-sonnet-4-5",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "What is in this image?"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/png;base64,iVBORw0KGgo..."
            }
          }
        ]
      }
    ],
    "max_tokens": 2000,
    "temperature": 0.7
  }'
```

### Embeddings

```bash
curl http://localhost:3000/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-api-key" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "Your text here",
    "encoding_format": "float"
  }'
```

**Batch embeddings:**

```bash
curl http://localhost:3000/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-api-key" \
  -d '{
    "model": "text-embedding-3-small",
    "input": ["First text", "Second text", "Third text"]
  }'
```

### Audio Transcription (Whisper)

```bash
curl http://localhost:3000/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-your-api-key" \
  -F "file=@audio.mp3" \
  -F "model=whisper-1" \
  -F "language=en" \
  -F "response_format=json"
```

**Optional parameters:**
- `language`: ISO-639-1 language code (e.g., "en", "es", "fr")
- `prompt`: Optional text to guide the transcription style
- `response_format`: "json", "text", "srt", "verbose_json", "vtt"
- `temperature`: Sampling temperature between 0 and 1
- `timestamp_granularities`: Array of "word" or "segment"

### OCR (Image to Text)

```bash
curl http://localhost:3000/v1/ocr \
  -H "Authorization: Bearer sk-your-api-key" \
  -F "file=@document.jpg" \
  -F "model=dots-ocr"
```

**Response:**
```json
{
  "text": "Extracted text from image",
  "model": "dots-ocr",
  "provider": "chutes-dots-ocr"
}
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
   - **Type**: OpenAI Compatible
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
- **Image upload support** for vision models (Claude, GPT-4 Vision, Gemini, Qwen-VL)

## Image Upload Support

The proxy includes **built-in image handling** for vision models with automatic validation and format conversion.

### Supported Features

✅ **Server-side validation**
- Validates image size (max 20MB)
- Checks image format (base64 data URLs or HTTP/HTTPS URLs)
- Provides clear error messages for invalid images

✅ **Provider compatibility**
- OpenAI-compatible providers (GPT-4 Vision, Claude, Gemini, etc.)
- Automatic format handling for different providers
- Base64 data URL support (`data:image/png;base64,...`)
- External URL support (`https://...`)

✅ **Admin UI integration**
- Built-in image upload button in Chat tab
- Image preview before sending
- Visual indicator for vision-capable models
- Support for PNG, JPEG, WebP, GIF formats

### Vision Models

Vision models that support image inputs include:
- **Claude**: `claude-sonnet`, `claude-opus`, `claude-haiku`
- **OpenAI**: `gpt-4-vision`, `gpt-4-turbo`, `gpt-4o`
- **Google**: `gemini-2.5-pro`, `gemini-1.5-pro`, `gemini-1.5-flash`
- **Qwen**: `qwen-vl`, `qwen2-vl`, `qwen3-vl`, `qwen3-vl-plus`

**Qwen VL Family Support:**

The proxy includes special handling for Qwen VL models (Qwen-VL, Qwen2-VL, Qwen3-VL):
- Automatic detection of Qwen VL models by name pattern
- Support for both base64 data URLs and external image URLs
- Optimized image format handling for Qwen's API
- Full compatibility with OpenAI vision format

### Using Image Upload

**Via Admin UI:**
1. Login to admin panel
2. Go to "💬 Chat" tab
3. Select a vision model (models with 📷 icon)
4. Click "📎 Image" button to upload
5. Type your question and click "Send"

**Via API:**

Send images using OpenAI's vision format (array with `text` and `image_url` objects):

```json
{
  "model": "claude-sonnet-4-5",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What's in this image?"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
          }
        }
      ]
    }
  ]
}
```

**Image formats supported:**
- Base64 data URLs: `data:image/png;base64,...`
- External URLs: `https://example.com/image.jpg`

### Image Size Limits

- **Client-side (Admin UI)**: 10MB max
- **Server-side (API)**: 20MB max
- Images exceeding limits will be rejected with a clear error message

### Error Handling

The proxy provides detailed error messages for image-related issues:

```json
{
  "error": {
    "message": "Image size (25.3MB) exceeds maximum allowed size (20MB)",
    "type": "invalid_request_error",
    "code": "image_validation_failed"
  }
}
```

Common error codes:
- `image_validation_failed`: Image too large or invalid format
- `model_not_found`: Model doesn't exist
- `provider_not_configured`: Provider missing or disabled

## Embeddings Support

The proxy supports OpenAI-compatible embeddings endpoints for text vectorization.

### Features

✅ **Provider routing** - Route to any OpenAI-compatible embeddings provider
✅ **Batch processing** - Support for single or multiple text inputs
✅ **Format options** - Float or base64 encoding formats
✅ **Model flexibility** - Configure any embedding model via admin panel

### Supported Embedding Models

You can configure any OpenAI-compatible embedding provider:
- **OpenAI**: `text-embedding-3-small`, `text-embedding-3-large`, `text-embedding-ada-002`
- **Cohere**: `embed-english-v3.0`, `embed-multilingual-v3.0`
- **Voyage AI**: `voyage-2`, `voyage-code-2`
- **Custom providers**: Any provider with OpenAI-compatible `/v1/embeddings` endpoint

### Setup

**Option 1: Using Chutes for Embeddings**

Chutes embeddings use OpenAI-compatible format - works out of the box!

1. **Add Chutes embedding provider** in Admin UI → Providers tab:
   - Click "➕ Add Provider"
   - **Provider ID**: `chutes-qwen-embedding`
   - **Provider Name**: `Chutes Qwen Embedding 8B`
   - **Base URL**: `https://chutes-qwen-qwen3-embedding-8b.chutes.ai`
   - **API Key**: Your Chutes API token
   - **Type**: `OpenAI Compatible`
   - ✅ **Enabled**: Checked
   - Click "Save"

2. **Add embedding model** in Models tab:
   - Click "➕ Add Model"
   - **Display Name**: `Qwen 3 Embedding 8B`
   - **Model ID**: `qwen3-embedding-8b` (or any name)
   - **Provider**: Select `chutes-qwen-embedding`
   - ✅ **Enabled**: Checked
   - Click "Save"

3. **Use via API**:
```bash
curl http://localhost:3000/v1/embeddings \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-embedding-8b",
    "input": "Hello world"
  }'
```

**Option 2: Using OpenAI for Embeddings**

1. Add provider:
   - Base URL: `https://api.openai.com/v1`
   - API Key: Your OpenAI API key

2. Add models: `text-embedding-3-small`, `text-embedding-3-large`

3. Use the same API format as above

## OCR (Optical Character Recognition) Support

The proxy supports OCR for extracting text from images.

### Features

✅ **Image-to-text** - Extract text from images automatically
✅ **Multiple formats** - PNG, JPEG, JPG, WEBP, GIF
✅ **Chutes RedNote Dots OCR** - Specialized OCR model
✅ **Simple API** - Upload image, get text back

### Setup

**Add Chutes RedNote Dots OCR:**

1. **Provider** (already added to database):
   - ID: `chutes-dots-ocr`
   - Base URL: `https://chutes-rednote-hilab-dots-ocr.chutes.ai`
   - API Key: Your Chutes token

2. **Model** (already added to database):
   - ID: `dots-ocr`
   - Name: RedNote Dots OCR
   - Provider: `chutes-dots-ocr`

### Usage

```bash
curl http://localhost:3000/v1/ocr \
  -H "Authorization: Bearer sk-your-api-key" \
  -F "file=@document.jpg" \
  -F "model=dots-ocr"
```

**Response:**
```json
{
  "text": "Extracted text from the image...",
  "model": "dots-ocr",
  "provider": "chutes-dots-ocr"
}
```

### Supported Image Formats

- **PNG** - Portable Network Graphics
- **JPEG/JPG** - Joint Photographic Experts Group
- **WEBP** - Modern web image format
- **GIF** - Graphics Interchange Format

### Use Cases

- Extract text from scanned documents
- Read text from screenshots
- OCR receipts and invoices
- Parse handwritten notes (if model supports)
- Extract data from photos

## Audio Transcription Support

The proxy supports OpenAI-compatible audio transcription (Whisper API) for speech-to-text conversion.

### Features

✅ **Multi-format support** - MP3, MP4, MPEG, MPGA, M4A, WAV, WEBM
✅ **Language detection** - Automatic or specified language
✅ **Multiple output formats** - JSON, text, SRT, VTT, verbose JSON
✅ **Timestamp support** - Word-level or segment-level timestamps
✅ **Large file handling** - Up to 5 minutes timeout for processing

### Supported Transcription Models

Configure any OpenAI-compatible Whisper provider:
- **OpenAI**: `whisper-1`
- **Groq**: `whisper-large-v3` (ultra-fast transcription)
- **Custom Whisper**: Self-hosted Whisper API endpoints

### Setup

**Option 1: Using Chutes for Transcription**

Chutes uses a different API format - the proxy automatically detects and handles this!

1. **Add Chutes Whisper provider** in Admin UI → Providers tab:
   - Click "➕ Add Provider"
   - **Provider ID**: `chutes-whisper-large-v3`
   - **Provider Name**: `Chutes Whisper Large V3`
   - **Base URL**: `https://chutes-whisper-large-v3.chutes.ai` (the exact model URL)
   - **API Key**: Your Chutes API token
   - **Type**: `OpenAI Compatible`
   - ✅ **Enabled**: Checked
   - Click "Save"

2. **Add Whisper model** in Models tab:
   - Click "➕ Add Model"
   - **Display Name**: `Whisper Large V3`
   - **Model ID**: `whisper-large-v3` (or any name you prefer)
   - **Provider**: Select `chutes-whisper-large-v3`
   - ✅ **Enabled**: Checked
   - Click "Save"

3. **Use via API** (same format as OpenAI!):
```bash
curl http://localhost:3000/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-your-api-key" \
  -F "file=@audio.mp3" \
  -F "model=whisper-large-v3"
```

**The proxy automatically:**
- ✅ Detects it's a Chutes provider (by checking URL contains `chutes.ai`)
- ✅ Converts multipart file to base64 `audio_b64`
- ✅ Routes to `/transcribe` instead of `/audio/transcriptions`
- ✅ Transforms response back to OpenAI format

**Option 2: Using OpenAI/Groq (Standard Format)**

1. Add provider with Base URL:
   - OpenAI: `https://api.openai.com/v1`
   - Groq: `https://api.groq.com/openai/v1`

2. Add model: `whisper-1` (OpenAI) or `whisper-large-v3-turbo` (Groq)

3. Use the same API format as above

### Audio Format Requirements

**All Whisper providers (Chutes, OpenAI, Groq):**
- ✅ **Supported**: MP3, MP4, MPEG, MPGA, M4A, WAV, WEBM
- ✅ **File size limit**: Up to 25MB
- ✅ **Automatic format handling**: No conversion needed

**Optional: Compress large audio files:**

```bash
# If your file is > 25MB, compress it
ffmpeg -i large_audio.mp3 -ab 64k compressed_audio.mp3

# Or reduce sample rate
ffmpeg -i large_audio.mp3 -ar 16000 compressed_audio.mp3
```

### Response Formats

- **json** (default): `{"text": "transcription here"}`
- **text**: Plain text output
- **srt**: SubRip subtitle format
- **vtt**: WebVTT subtitle format
- **verbose_json**: Includes word-level timestamps and confidence scores

### Example with Options

```bash
curl http://localhost:3000/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-your-api-key" \
  -F "file=@meeting.mp3" \
  -F "model=whisper-1" \
  -F "language=en" \
  -F "response_format=verbose_json" \
  -F "timestamp_granularities[]=word"
```

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
| `/api/admin/users` | GET/POST | List/create users |
| `/api/admin/users/:id` | PUT/DELETE | Update/delete user |
| `/api/user/login` | POST | User login (non-admin) |
| `/api/user/me` | GET | Get current user info |
| `/v1/models` | GET | List available models (OpenAI API) |
| `/v1/chat/completions` | POST | Chat completion with vision support |
| `/v1/embeddings` | POST | Text embeddings generation |
| `/v1/audio/transcriptions` | POST | Audio transcription (Whisper) |
| `/v1/ocr` | POST | OCR - Extract text from images |
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
- **Database persistence:** Free tier has read-only filesystem. Set `DB_STORAGE_PATHS` (comma-separated) to point at your mounted volumes; otherwise the app falls back to `/tmp`.
  - **Data will reset on each restart/redeploy** when `/tmp` is used
  - **Optional:** Upload your database to "Secret Files" as `ipin-proxy.db` - it will be copied to the first writable path (default `/tmp`) on startup
  - You'll need to reconfigure providers/models via Admin UI after each restart if using ephemeral storage
  - **For persistent storage**, upgrade to a paid plan with Disk support or mount a persistent volume and include it in `DB_STORAGE_PATHS`

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

## Chutes Integration Guide

### What is Chutes?

Chutes provides AI model endpoints with unique URLs per model. Unlike traditional providers, each model has its own base URL.

### Key Differences

| Feature | Standard Providers | Chutes |
|---------|-------------------|---------|
| Base URL | One URL for all models | Unique URL per model |
| Chat | `/v1/chat/completions` | `/v1/chat/completions` ✅ |
| Embeddings | `/v1/embeddings` | `/v1/embeddings` ✅ |
| Transcription Endpoint | `/v1/audio/transcriptions` | `/transcribe` (auto-handled) |
| Audio Format | MP3, MP4, WAV, etc. (25MB) | Same ✅ |
| Audio Upload | Multipart file | Base64 (auto-converted) |

### Setting Up Chutes Models

**Rule: One provider per model** (because each model has a unique base URL)

#### Example 1: Chutes Whisper Large V3

```
Provider Setup:
  Provider ID:    chutes-whisper-large-v3
  Provider Name:  Chutes Whisper Large V3
  Base URL:       https://chutes-whisper-large-v3.chutes.ai
  API Key:        YOUR_CHUTES_TOKEN
  Type:           OpenAI Compatible

Model Setup:
  Display Name:   Whisper Large V3
  Model ID:       whisper-large-v3
  Provider:       chutes-whisper-large-v3
```

**Test:**
```bash
curl http://localhost:3000/v1/audio/transcriptions \
  -H "Authorization: Bearer YOUR_KEY" \
  -F "file=@audio.mp3" \
  -F "model=whisper-large-v3"
```

**Supported audio formats:** MP3, MP4, MPEG, MPGA, M4A, WAV, WEBM (up to 25MB)

#### Example 2: Chutes Qwen Embedding

```
Provider Setup:
  Provider ID:    chutes-qwen-embedding
  Provider Name:  Chutes Qwen Embedding 8B
  Base URL:       https://chutes-qwen-qwen3-embedding-8b.chutes.ai
  API Key:        YOUR_CHUTES_TOKEN
  Type:           OpenAI Compatible

Model Setup:
  Display Name:   Qwen 3 Embedding 8B
  Model ID:       qwen3-embedding-8b
  Provider:       chutes-qwen-embedding
```

**Test:**
```bash
curl http://localhost:3000/v1/embeddings \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen3-embedding-8b", "input": "Hello"}'
```

#### Example 3: Chutes Chat Model

```
Provider Setup:
  Provider ID:    chutes-llama-3-1-70b
  Provider Name:  Chutes Llama 3.1 70B
  Base URL:       https://chutes-llama-3-1-70b.chutes.ai
  API Key:        YOUR_CHUTES_TOKEN
  Type:           OpenAI Compatible

Model Setup:
  Display Name:   Llama 3.1 70B
  Model ID:       llama-3.1-70b
  Provider:       chutes-llama-3-1-70b
```

**Test:**
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-70b",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### How the Proxy Handles Chutes

**Automatic Detection:**
- The proxy detects Chutes providers by checking if the base URL contains `chutes.ai`

**For Embeddings & Chat:**
- Uses standard OpenAI format (no changes needed)

**For Transcription:**
- ✅ Automatically converts multipart file upload to base64 `audio_b64`
- ✅ Routes to `/transcribe` instead of `/audio/transcriptions`
- ✅ Transforms Chutes response to OpenAI format
- ✅ You still use standard OpenAI API format!
- ✅ Supports all audio formats (MP3, MP4, WAV, M4A, etc.)

### Finding Chutes Model URLs

Check Chutes documentation or API explorer for exact URLs:
- Chat models: `https://chutes-{model-name}.chutes.ai`
- Embedding models: `https://chutes-{model-name}.chutes.ai`
- Whisper models: `https://chutes-whisper-{version}.chutes.ai`

### Multiple Chutes Models Example

You can add as many Chutes models as you want:

```
Providers:
  ├── chutes-whisper-large-v3
  ├── chutes-qwen-embedding
  ├── chutes-llama-3-1-70b
  ├── chutes-mistral-large
  └── openai (for comparison)

Models:
  ├── whisper-large-v3        → chutes-whisper-large-v3
  ├── qwen3-embedding-8b      → chutes-qwen-embedding
  ├── llama-3.1-70b          → chutes-llama-3-1-70b
  ├── mistral-large          → chutes-mistral-large
  └── gpt-4o                 → openai
```

All accessible through the same unified API! 🎉

## License

MIT

## Author

syaikhipin
