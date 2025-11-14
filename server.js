const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('./database');

// Load .env file if exists (zero-dependency approach)
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      line = line.trim();
      // Skip comments and empty lines
      if (!line || line.startsWith('#')) return;

      const [key, ...values] = line.split('=');
      if (key && values.length > 0) {
        const value = values.join('=').trim();
        // Remove quotes if present
        process.env[key.trim()] = value.replace(/^["']|["']$/g, '');
      }
    });
  }
}

// Load environment variables
loadEnv();

// Configuration
const PORT = process.env.PORT || 3000;  // Default to 3000
const UI_USERNAME = process.env.UI_USERNAME;
const UI_PASSWORD = process.env.UI_PASSWORD;
const MASTER_API_KEY = process.env.MASTER_API_KEY;

// Validate required environment variables
if (!UI_USERNAME || !UI_PASSWORD) {
  console.error('❌ Missing required environment variables!');
  console.error('Please set: UI_USERNAME, UI_PASSWORD');
  console.error('Create a .env file or set environment variables.');
  process.exit(1);
}

if (!MASTER_API_KEY) {
  console.error('❌ MASTER_API_KEY not set in environment variables!');
  console.error('Set MASTER_API_KEY in .env file.');
  process.exit(1);
}

// Initialize database
const db = new Database(path.join(__dirname, 'ipin-proxy.db'));

// Load providers and models from database
let PROVIDERS = {};
let MODEL_ROUTES = {};

function loadProvidersFromDB() {
  const providers = db.getEnabledProviders();
  PROVIDERS = {};
  providers.forEach(p => {
    PROVIDERS[p.id] = {
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      type: p.type
    };
  });
}

function loadModelsFromDB() {
  const models = db.getEnabledModels();
  MODEL_ROUTES = {};
  models.forEach(m => {
    MODEL_ROUTES[m.id] = {
      providerId: m.providerId,
      type: m.type || 'chat',
      supportsImageUpload: m.supportsImageUpload || false,
      supportsVideoUpload: m.supportsVideoUpload || false
    };
  });
}

// Initial load
loadProvidersFromDB();
loadModelsFromDB();

// Authenticate API request (supports multiple API keys)
// Returns API key object if valid, null otherwise
function authenticate(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;

  const token = authHeader.replace('Bearer ', '');

  // Check master key from environment first (always has access to all models)
  if (token === MASTER_API_KEY) {
    return {
      id: 'master',
      key: MASTER_API_KEY,
      name: 'Master Key',
      username: 'admin',
      allowedModels: [], // Empty = access to all models
      enabled: true
    };
  }

  // Check against database API keys
  const apiKey = db.findApiKeyByValue(token);
  return apiKey || null;
}

// Authenticate admin UI request
function authenticateAdmin(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return false;

  const token = authHeader.replace('Bearer ', '');
  // Simple token: base64(username:password)
  const validToken = Buffer.from(`${UI_USERNAME}:${UI_PASSWORD}`).toString('base64');
  return token === validToken;
}

// Simple password hashing function
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Authenticate user request - returns user object if valid
function authenticateUser(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;

  const token = authHeader.replace('Bearer ', '');
  // Token format: base64(username:userId)
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [username, userId] = decoded.split(':');
    const user = db.getUser(userId);
    if (user && user.username === username && user.enabled) {
      return user;
    }
  } catch (e) {
    return null;
  }
  return null;
}

// Lightweight HTTP request helper
function makeRequest(url, options, data) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname,
      method: options.method || 'POST',
      headers: options.headers || {},
      timeout: options.timeout || 120000
    };

    const req = https.request(requestOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// Make multipart/form-data request (for audio uploads)
function makeMultipartRequest(url, options, formData) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

    // Build multipart body
    let body = '';
    for (const [key, value] of Object.entries(formData)) {
      body += `--${boundary}\r\n`;

      if (value && typeof value === 'object' && value.data) {
        // File field
        body += `Content-Disposition: form-data; name="${key}"; filename="${value.filename}"\r\n`;
        body += `Content-Type: ${value.contentType || 'application/octet-stream'}\r\n\r\n`;
        body += value.data.toString('binary');
      } else {
        // Regular field
        body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
        body += value;
      }
      body += '\r\n';
    }
    body += `--${boundary}--\r\n`;

    const bodyBuffer = Buffer.from(body, 'binary');

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname,
      method: options.method || 'POST',
      headers: {
        ...options.headers,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length
      },
      timeout: options.timeout || 120000
    };

    const req = https.request(requestOptions, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(responseBody), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseBody, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(bodyBuffer);
    req.end();
  });
}

// Parse request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Parse multipart/form-data (for audio files)
function parseMultipartFormData(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);

    if (!boundaryMatch) {
      return reject(new Error('Invalid multipart/form-data: missing boundary'));
    }

    const boundary = '--' + boundaryMatch[1];
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const parts = {};
        const stringData = buffer.toString('binary');
        const sections = stringData.split(boundary);

        for (const section of sections) {
          if (section.includes('Content-Disposition')) {
            const nameMatch = section.match(/name="([^"]+)"/);
            if (!nameMatch) continue;

            const fieldName = nameMatch[1];
            const filenameMatch = section.match(/filename="([^"]+)"/);

            // Find where headers end and content begins
            const headerEnd = section.indexOf('\r\n\r\n');
            if (headerEnd === -1) continue;

            const content = section.substring(headerEnd + 4);
            const endBoundary = content.lastIndexOf('\r\n');
            const actualContent = content.substring(0, endBoundary !== -1 ? endBoundary : content.length);

            if (filenameMatch) {
              // File field
              parts[fieldName] = {
                filename: filenameMatch[1],
                data: Buffer.from(actualContent, 'binary')
              };
            } else {
              // Regular field
              parts[fieldName] = actualContent.trim();
            }
          }
        }

        resolve(parts);
      } catch (e) {
        reject(new Error('Failed to parse multipart/form-data: ' + e.message));
      }
    });
    req.on('error', reject);
  });
}

// Send JSON response
function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Send file
function sendFile(res, filepath, contentType) {
  fs.readFile(filepath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
}

// Provider format detection
function isChutesProvider(baseUrl) {
  // Chutes providers use format: https://chutes-{model-name}.chutes.ai
  return baseUrl && baseUrl.includes('chutes.ai');
}

// Convert audio buffer to base64 string (for Chutes format)
function audioBufferToBase64(buffer) {
  return buffer.toString('base64');
}

// Transform Chutes transcription response to OpenAI format
function transformChutesTranscriptionResponse(chutesResponse) {
  // Chutes returns various formats, normalize to OpenAI format
  if (typeof chutesResponse === 'string') {
    return { text: chutesResponse };
  }

  if (chutesResponse.text) {
    return { text: chutesResponse.text };
  }

  if (chutesResponse.transcription) {
    return { text: chutesResponse.transcription };
  }

  // If already in correct format
  return chutesResponse;
}

// Image handling utilities
function isImageContent(content) {
  if (!Array.isArray(content)) return false;
  return content.some(item => item.type === 'image_url' && item.image_url);
}

function isVideoContent(content) {
  if (!Array.isArray(content)) return false;
  return content.some(item => {
    // Check for video_url type or data URLs with video MIME types
    if (item.type === 'video_url' && item.video_url) return true;
    if (item.type === 'image_url' && item.image_url) {
      const url = typeof item.image_url === 'string' ? item.image_url : item.image_url.url;
      return url && url.startsWith('data:video/');
    }
    return false;
  });
}

function extractImageData(imageUrl) {
  // Extract base64 data from data URL
  // Format: data:image/png;base64,iVBORw0KGgoAAAANS...
  if (!imageUrl || typeof imageUrl !== 'string') return null;

  const dataUrlMatch = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (dataUrlMatch) {
    return {
      mediaType: dataUrlMatch[1], // png, jpeg, webp, gif
      base64Data: dataUrlMatch[2],
      url: imageUrl
    };
  }

  // If it's already a URL (not base64), return as-is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return {
      mediaType: null,
      base64Data: null,
      url: imageUrl
    };
  }

  return null;
}

function validateImageSize(base64Data) {
  if (!base64Data) return { valid: true, size: 0 };

  // Calculate approximate size from base64
  // Base64 increases size by ~33%, so divide by 0.75 to get original size
  const sizeInBytes = (base64Data.length * 3) / 4;
  const sizeInMB = sizeInBytes / (1024 * 1024);

  // Max 20MB for server-side (more lenient than client's 10MB)
  const MAX_SIZE_MB = 20;

  return {
    valid: sizeInMB <= MAX_SIZE_MB,
    size: sizeInMB,
    maxSize: MAX_SIZE_MB
  };
}

// Transform messages with images for different provider types
function transformMessagesForProvider(messages, providerType, modelId = '') {
  if (!messages || !Array.isArray(messages)) return messages;

  // Check if this is a Qwen VL model
  const isQwenVL = modelId && (
    modelId.toLowerCase().includes('qwen-vl') ||
    modelId.toLowerCase().includes('qwen2-vl') ||
    modelId.toLowerCase().includes('qwen3-vl')
  );

  return messages.map(msg => {
    if (!msg.content || !Array.isArray(msg.content)) {
      return msg; // Text-only message
    }

    // Check if this message has images
    const hasImage = isImageContent(msg.content);
    if (!hasImage) {
      return msg;
    }

    // Transform based on provider type and model
    if (providerType === 'openai') {
      // Handle Qwen VL models specifically
      if (isQwenVL) {
        return {
          ...msg,
          content: msg.content.map(item => {
            if (item.type === 'image_url' && item.image_url) {
              const imageData = extractImageData(item.image_url.url);
              if (!imageData) {
                console.warn('Invalid image URL format:', item.image_url.url);
                return null;
              }

              // Validate size
              if (imageData.base64Data) {
                const validation = validateImageSize(imageData.base64Data);
                if (!validation.valid) {
                  throw new Error(`Image size (${validation.size.toFixed(2)}MB) exceeds maximum allowed size (${validation.maxSize}MB)`);
                }
              }

              // Qwen VL format: supports both data URLs and external URLs
              return {
                type: 'image_url',
                image_url: {
                  url: imageData.url
                }
              };
            }
            return item;
          }).filter(Boolean)
        };
      }

      // Standard OpenAI/Claude/Gemini format
      return {
        ...msg,
        content: msg.content.map(item => {
          if (item.type === 'image_url' && item.image_url) {
            const imageData = extractImageData(item.image_url.url);
            if (!imageData) {
              console.warn('Invalid image URL format:', item.image_url.url);
              return null;
            }

            // Validate size
            if (imageData.base64Data) {
              const validation = validateImageSize(imageData.base64Data);
              if (!validation.valid) {
                throw new Error(`Image size (${validation.size.toFixed(2)}MB) exceeds maximum allowed size (${validation.maxSize}MB)`);
              }
            }

            return {
              type: 'image_url',
              image_url: {
                url: imageData.url
              }
            };
          }
          return item;
        }).filter(Boolean)
      };
    }

    // For other provider types, keep original format
    return msg;
  });
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  }

  const promptTokens = usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens ?? usage.inputTokens ?? usage.prompt ?? 0;
  const completionTokens = usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens ?? usage.outputTokens ?? usage.completion ?? 0;
  const totalTokens = usage.total_tokens ?? usage.totalTokens ?? ((promptTokens || 0) + (completionTokens || 0));

  return {
    prompt_tokens: promptTokens || 0,
    completion_tokens: completionTokens || 0,
    total_tokens: totalTokens || (promptTokens || 0) + (completionTokens || 0)
  };
}

function extractText(value, visited = new Set()) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (typeof value === 'object') {
    if (visited.has(value)) return '';
    visited.add(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => extractText(item, visited)).filter(Boolean).join('\n');
  }

  if (typeof value === 'object') {
    const priorityKeys = [
      'text',
      'content',
      'output_text',
      'output',
      'result',
      'response',
      'completion',
      'answer',
      'value',
      'parts',
      'data',
      'message'
    ];

    const parts = [];

    for (const key of priorityKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const text = extractText(value[key], visited);
        if (text) parts.push(text);
      }
    }

    for (const key of Object.keys(value)) {
      if (priorityKeys.includes(key)) continue;
      const text = extractText(value[key], visited);
      if (text) parts.push(text);
    }

    return parts.filter(Boolean).join('\n');
  }

  return '';
}

function normalizeToOpenAIResponse(responseData, model) {
  const now = Math.floor(Date.now() / 1000);

  if (!responseData) {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: now,
      model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: '' },
        finish_reason: 'stop'
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };
  }

  const buildResponse = (choices, usage, base = {}) => ({
    id: base.id || `chatcmpl-${Date.now()}`,
    object: base.object === 'chat.completion' ? base.object : 'chat.completion',
    created: typeof base.created === 'number' ? base.created : now,
    model: base.model || model,
    choices,
    usage: normalizeUsage(usage || base.usage)
  });

  if (Array.isArray(responseData.choices)) {
    const normalizedChoices = responseData.choices.map((choice, idx) => {
      if (choice && typeof choice === 'object' && choice.message) {
        const message = { ...choice.message };
        if (message.content !== undefined && typeof message.content !== 'string') {
          message.content = extractText(message.content);
        }
        if (message.content === undefined) {
          message.content = extractText(choice);
        }
        if (!message.role) {
          message.role = 'assistant';
        }
        if (!message.tool_calls && choice.tool_calls) {
          message.tool_calls = choice.tool_calls;
        }
        const normalizedChoice = {
          index: typeof choice.index === 'number' ? choice.index : idx,
          message,
          finish_reason: choice.finish_reason || choice.finishReason || 'stop'
        };
        if (choice.logprobs !== undefined) {
          normalizedChoice.logprobs = choice.logprobs;
        }
        return normalizedChoice;
      }

      const content = extractText(choice);
      return {
        index: typeof choice?.index === 'number' ? choice.index : idx,
        message: { role: 'assistant', content },
        finish_reason: choice?.finish_reason || choice?.finishReason || 'stop'
      };
    });

    return buildResponse(normalizedChoices, responseData.usage, responseData);
  }

  if (responseData.data && typeof responseData.data === 'object') {
    const nested = normalizeToOpenAIResponse(responseData.data, model);
    if (!nested.id && responseData.id) nested.id = responseData.id;
    if (responseData.usage) nested.usage = normalizeUsage(responseData.usage);
    return nested;
  }

  if (Array.isArray(responseData.candidates)) {
    const normalizedChoices = responseData.candidates.map((candidate, idx) => {
      const content = extractText(candidate.content ?? candidate);
      return {
        index: typeof candidate.index === 'number' ? candidate.index : idx,
        message: { role: 'assistant', content },
        finish_reason: candidate.finishReason || candidate.finish_reason || 'stop'
      };
    }).filter(choice => choice.message.content !== '');

    if (normalizedChoices.length > 0) {
      return buildResponse(normalizedChoices, responseData.usage, responseData);
    }
  }

  const candidateChoices = [];

  if (Array.isArray(responseData.messages)) {
    const reversed = [...responseData.messages].reverse();
    const assistantMessage = reversed.find(msg => {
      const role = (msg.role || msg.type || '').toLowerCase();
      return role === 'assistant' || role === 'model' || role === 'ai' || role === 'bot';
    });

    if (assistantMessage) {
      const content = extractText(assistantMessage.content ?? assistantMessage);
      if (content) {
        candidateChoices.push({
          role: assistantMessage.role || 'assistant',
          content,
          finish_reason: assistantMessage.finish_reason || assistantMessage.finishReason || 'stop'
        });
      }
    }
  }

  const fields = ['output_text', 'output', 'result', 'text', 'message', 'content', 'response', 'completion', 'answer'];
  for (const field of fields) {
    if (responseData[field] === undefined) continue;
    const value = responseData[field];

    if (field === 'message' && value && typeof value === 'object') {
      const role = value.role || 'assistant';
      const content = extractText(value.content ?? value.text ?? value);
      if (content) {
        candidateChoices.push({
          role,
          content,
          finish_reason: value.finish_reason || value.finishReason || 'stop'
        });
      }
      continue;
    }

    const content = extractText(value);
    if (content) {
      candidateChoices.push({
        role: 'assistant',
        content,
        finish_reason: 'stop'
      });
    }
  }

  if (candidateChoices.length === 0) {
    if (typeof responseData === 'string') {
      candidateChoices.push({ role: 'assistant', content: responseData, finish_reason: 'stop' });
    } else {
      const fallback = extractText(responseData);
      if (fallback) {
        candidateChoices.push({ role: 'assistant', content: fallback, finish_reason: 'stop' });
      }
    }
  }

  if (candidateChoices.length === 0) {
    candidateChoices.push({ role: 'assistant', content: '', finish_reason: 'stop' });
  }

  const normalizedChoices = candidateChoices.map((choice, idx) => ({
    index: idx,
    message: {
      role: choice.role || 'assistant',
      content: choice.content
    },
    finish_reason: choice.finish_reason || 'stop'
  }));

  return buildResponse(normalizedChoices, responseData.usage, responseData);
}

// Create server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    // Serve static files
    if (req.method === 'GET' && req.url === '/') {
      return sendFile(res, path.join(__dirname, 'public', 'login.html'), 'text/html');
    }

    if (req.method === 'GET' && req.url === '/login.html') {
      return sendFile(res, path.join(__dirname, 'public', 'login.html'), 'text/html');
    }

    if (req.method === 'GET' && req.url === '/admin.html') {
      return sendFile(res, path.join(__dirname, 'public', 'admin.html'), 'text/html');
    }

    if (req.method === 'GET' && req.url === '/admin.js') {
      return sendFile(res, path.join(__dirname, 'public', 'admin.js'), 'application/javascript');
    }

    if (req.method === 'GET' && req.url === '/chat.html') {
      return sendFile(res, path.join(__dirname, 'public', 'chat.html'), 'text/html');
    }

    if (req.method === 'GET' && req.url === '/chat.js') {
      return sendFile(res, path.join(__dirname, 'public', 'chat.js'), 'application/javascript');
    }

    // Admin Login
    if (req.method === 'POST' && req.url === '/api/admin/login') {
      const body = await parseBody(req);
      if (body.username === UI_USERNAME && body.password === UI_PASSWORD) {
        const token = Buffer.from(`${UI_USERNAME}:${UI_PASSWORD}`).toString('base64');
        return sendJSON(res, 200, { token });
      } else {
        return sendJSON(res, 401, { error: 'Invalid credentials' });
      }
    }

    // Admin API - Providers
    if (req.url.startsWith('/api/admin/providers')) {
      if (!authenticateAdmin(req)) {
        return sendJSON(res, 401, { error: 'Unauthorized' });
      }

      // GET all providers
      if (req.method === 'GET' && req.url === '/api/admin/providers') {
        return sendJSON(res, 200, { providers: db.getProviders() });
      }

      // POST new provider
      if (req.method === 'POST' && req.url === '/api/admin/providers') {
        const body = await parseBody(req);
        const provider = db.addProvider(body);
        loadProvidersFromDB();
        return sendJSON(res, 201, provider);
      }

      // PUT update provider
      if (req.method === 'PUT') {
        const match = req.url.match(/^\/api\/admin\/providers\/([^\/]+)$/);
        if (match) {
          const id = decodeURIComponent(match[1]);
          const body = await parseBody(req);
          const provider = db.updateProvider(id, body);
          loadProvidersFromDB();
          return sendJSON(res, 200, provider);
        }
      }

      // DELETE provider
      if (req.method === 'DELETE') {
        const match = req.url.match(/^\/api\/admin\/providers\/([^\/]+)$/);
        if (match) {
          const id = decodeURIComponent(match[1]);
          db.deleteProvider(id);
          loadProvidersFromDB();
          loadModelsFromDB();
          return sendJSON(res, 200, { success: true });
        }
      }
    }

    // Admin API - Models
    if (req.url.startsWith('/api/admin/models')) {
      if (!authenticateAdmin(req)) {
        return sendJSON(res, 401, { error: 'Unauthorized' });
      }

      // GET all models
      if (req.method === 'GET' && req.url === '/api/admin/models') {
        return sendJSON(res, 200, { models: db.getModels() });
      }

      // POST new model
      if (req.method === 'POST' && req.url === '/api/admin/models') {
        const body = await parseBody(req);
        const model = db.addModel(body);
        loadModelsFromDB();
        return sendJSON(res, 201, model);
      }

      // PUT update model
      if (req.method === 'PUT') {
        const match = req.url.match(/^\/api\/admin\/models\/(.+)$/);
        if (match) {
          const id = decodeURIComponent(match[1]);
          const body = await parseBody(req);
          // Delete old and create new if ID changed
          if (id !== body.id) {
            db.deleteModel(id);
            const model = db.addModel(body);
            loadModelsFromDB();
            return sendJSON(res, 200, model);
          } else {
            const model = db.updateModel(id, body);
            loadModelsFromDB();
            return sendJSON(res, 200, model);
          }
        }
      }

      // DELETE model
      if (req.method === 'DELETE') {
        const match = req.url.match(/^\/api\/admin\/models\/(.+)$/);
        if (match) {
          const id = decodeURIComponent(match[1]);
          db.deleteModel(id);
          loadModelsFromDB();
          return sendJSON(res, 200, { success: true });
        }
      }
    }

    // Admin API - Get Master Key
    if (req.method === 'GET' && req.url === '/api/admin/masterkey') {
      if (!authenticateAdmin(req)) {
        return sendJSON(res, 401, { error: 'Unauthorized' });
      }
      return sendJSON(res, 200, { masterKey: MASTER_API_KEY });
    }

    // Admin API - API Keys
    if (req.url.startsWith('/api/admin/apikeys')) {
      if (!authenticateAdmin(req)) {
        return sendJSON(res, 401, { error: 'Unauthorized' });
      }

      // GET all API keys
      if (req.method === 'GET' && req.url === '/api/admin/apikeys') {
        return sendJSON(res, 200, { apiKeys: db.getApiKeys() });
      }

      // POST new API key
      if (req.method === 'POST' && req.url === '/api/admin/apikeys') {
        const body = await parseBody(req);
        const apiKey = db.addApiKey(body);
        return sendJSON(res, 201, apiKey);
      }

      // PUT update API key
      if (req.method === 'PUT') {
        const match = req.url.match(/^\/api\/admin\/apikeys\/([^\/]+)$/);
        if (match) {
          const id = decodeURIComponent(match[1]);
          const body = await parseBody(req);
          const apiKey = db.updateApiKey(id, body);
          return sendJSON(res, 200, apiKey);
        }
      }

      // DELETE API key
      if (req.method === 'DELETE') {
        const match = req.url.match(/^\/api\/admin\/apikeys\/([^\/]+)$/);
        if (match) {
          const id = decodeURIComponent(match[1]);
          const result = db.deleteApiKey(id);
          if (result) {
            return sendJSON(res, 200, { success: true });
          } else {
            return sendJSON(res, 400, { error: 'Cannot delete master key' });
          }
        }
      }
    }

    // Admin API - Users Management
    if (req.url.startsWith('/api/admin/users')) {
      if (!authenticateAdmin(req)) {
        return sendJSON(res, 401, { error: 'Unauthorized' });
      }

      // GET all users
      if (req.method === 'GET' && req.url === '/api/admin/users') {
        return sendJSON(res, 200, { users: db.getUsers() });
      }

      // POST new user
      if (req.method === 'POST' && req.url === '/api/admin/users') {
        const body = await parseBody(req);

        // Check if username already exists
        if (db.findUserByUsername(body.username)) {
          return sendJSON(res, 400, { error: 'Username already exists' });
        }

        // Hash the password
        const hashedPassword = hashPassword(body.password);

        const user = db.addUser({
          username: body.username,
          password: hashedPassword,
          apiKeyId: body.apiKeyId,
          enabled: body.enabled !== false
        });

        return sendJSON(res, 201, { ...user, password: undefined });
      }

      // PUT update user
      if (req.method === 'PUT') {
        const match = req.url.match(/^\/api\/admin\/users\/([^\/]+)$/);
        if (match) {
          const id = decodeURIComponent(match[1]);
          const body = await parseBody(req);

          // If password is being updated, hash it
          if (body.password) {
            body.password = hashPassword(body.password);
          }

          const user = db.updateUser(id, body);
          return sendJSON(res, 200, { ...user, password: undefined });
        }
      }

      // DELETE user
      if (req.method === 'DELETE') {
        const match = req.url.match(/^\/api\/admin\/users\/([^\/]+)$/);
        if (match) {
          const id = decodeURIComponent(match[1]);
          const result = db.deleteUser(id);
          if (result) {
            return sendJSON(res, 200, { success: true });
          } else {
            return sendJSON(res, 400, { error: 'User not found' });
          }
        }
      }
    }

    // User Login
    if (req.method === 'POST' && req.url === '/api/user/login') {
      const body = await parseBody(req);
      const user = db.findUserByUsername(body.username);

      if (!user || !user.enabled) {
        return sendJSON(res, 401, { error: 'Invalid credentials' });
      }

      const hashedPassword = hashPassword(body.password);
      if (user.password !== hashedPassword) {
        return sendJSON(res, 401, { error: 'Invalid credentials' });
      }

      // Create token
      const token = Buffer.from(`${user.username}:${user.id}`).toString('base64');

      // Get user's API key
      const apiKey = db.getApiKey(user.apiKeyId);

      return sendJSON(res, 200, {
        token,
        user: {
          id: user.id,
          username: user.username,
          apiKeyId: user.apiKeyId
        },
        apiKey: apiKey ? {
          id: apiKey.id,
          key: apiKey.key,
          name: apiKey.name,
          allowedModels: apiKey.allowedModels
        } : null
      });
    }

    // User API - Get user info and API key
    if (req.method === 'GET' && req.url === '/api/user/me') {
      const user = authenticateUser(req);
      if (!user) {
        return sendJSON(res, 401, { error: 'Unauthorized' });
      }

      const apiKey = db.getApiKey(user.apiKeyId);

      return sendJSON(res, 200, {
        user: {
          id: user.id,
          username: user.username,
          apiKeyId: user.apiKeyId
        },
        apiKey: apiKey ? {
          id: apiKey.id,
          key: apiKey.key,
          name: apiKey.name,
          allowedModels: apiKey.allowedModels
        } : null
      });
    }

    // Serve user.html
    if (req.method === 'GET' && req.url === '/user.html') {
      return sendFile(res, path.join(__dirname, 'public', 'user.html'), 'text/html');
    }

    // Serve user.js
    if (req.method === 'GET' && req.url === '/user.js') {
      return sendFile(res, path.join(__dirname, 'public', 'user.js'), 'application/javascript');
    }

    // GET /v1/models
    if (req.method === 'GET' && req.url === '/v1/models') {
      // Authenticate
      const apiKey = authenticate(req);
      if (!apiKey) {
        return sendJSON(res, 401, {
          error: {
            message: 'Invalid authentication credentials',
            type: 'invalid_request_error',
            code: 'invalid_api_key'
          }
        });
      }

      // Filter models based on API key permissions
      const allowedModels = apiKey.allowedModels || [];
      const allModels = Object.keys(MODEL_ROUTES);

      // If allowedModels is empty, return all models
      const modelIds = allowedModels.length === 0 ? allModels : allModels.filter(id => allowedModels.includes(id));

      const models = modelIds.map(modelId => ({
        id: modelId,
        object: 'model',
        created: Date.now(),
        owned_by: MODEL_ROUTES[modelId]?.providerId || 'unknown',
        type: MODEL_ROUTES[modelId]?.type || 'chat'
      }));

      return sendJSON(res, 200, {
        object: 'list',
        data: models
      });
    }

    // GET /health
    if (req.method === 'GET' && req.url === '/health') {
      return sendJSON(res, 200, {
        status: 'healthy',
        timestamp: Date.now(),
        service: 'ipin-proxy',
        providers: Object.keys(PROVIDERS),
        models: Object.keys(MODEL_ROUTES).length
      });
    }

    // POST /v1/chat/completions
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      // Authenticate
      const apiKey = authenticate(req);
      if (!apiKey) {
        return sendJSON(res, 401, {
          error: {
            message: 'Invalid authentication credentials',
            type: 'invalid_request_error',
            code: 'invalid_api_key'
          }
        });
      }

      const body = await parseBody(req);
      const { model, messages, stream, ...params } = body;

      // Detect if request contains images or videos
      const hasImages = messages && messages.some(msg => isImageContent(msg.content));
      const hasVideos = messages && messages.some(msg => isVideoContent(msg.content));

      if (hasImages) {
        console.log(`[${new Date().toISOString()}] Image upload detected in request for model: ${model}`);
      }
      if (hasVideos) {
        console.log(`[${new Date().toISOString()}] Video upload detected in request for model: ${model}`);
      }

      // Check if model is supported
      const modelConfig = MODEL_ROUTES[model];
      if (!modelConfig) {
        return sendJSON(res, 400, {
          error: {
            message: `Model '${model}' not supported. Available models: ${Object.keys(MODEL_ROUTES).join(', ')}`,
            type: 'invalid_request_error',
            code: 'model_not_found'
          }
        });
      }

      // Validate image upload capability
      if (hasImages && !modelConfig.supportsImageUpload) {
        return sendJSON(res, 400, {
          error: {
            message: `Model '${model}' does not support image uploads. Please use a model with image upload capability enabled.`,
            type: 'invalid_request_error',
            code: 'image_upload_not_supported'
          }
        });
      }

      // Validate video upload capability
      if (hasVideos && !modelConfig.supportsVideoUpload) {
        return sendJSON(res, 400, {
          error: {
            message: `Model '${model}' does not support video uploads. Please use a model with video upload capability enabled.`,
            type: 'invalid_request_error',
            code: 'video_upload_not_supported'
          }
        });
      }

      const providerName = modelConfig.providerId;

      // Check if API key has permission to use this model
      const allowedModels = apiKey.allowedModels || [];
      if (allowedModels.length > 0 && !allowedModels.includes(model)) {
        return sendJSON(res, 403, {
          error: {
            message: `Access denied. This API key does not have permission to use model '${model}'.`,
            type: 'permission_error',
            code: 'model_not_allowed'
          }
        });
      }

      const provider = PROVIDERS[providerName];
      if (!provider || !provider.apiKey) {
        return sendJSON(res, 500, {
          error: {
            message: `Provider '${providerName}' not configured. Missing API key.`,
            type: 'server_error',
            code: 'provider_not_configured'
          }
        });
      }

      console.log(`[${new Date().toISOString()}] ${model} -> ${providerName}`);

      // Transform messages for provider (handles images, validation, etc.)
      let transformedMessages;
      try {
        transformedMessages = transformMessagesForProvider(messages, provider.type, model);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Image validation error:`, error.message);
        return sendJSON(res, 400, {
          error: {
            message: error.message,
            type: 'invalid_request_error',
            code: 'image_validation_failed'
          }
        });
      }

      // OpenAI-compatible request
      const providerRequest = {
        model: model,
        messages: transformedMessages,
        stream: stream || false,
        ...params
      };

      const response = await makeRequest(
        `${provider.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000
        },
        providerRequest
      );

      console.log(`[${new Date().toISOString()}] ${providerName} response: ${response.status}`);

      if (response.status !== 200) {
        return sendJSON(res, response.status, response.data);
      }

      // Debug: Log raw response for troubleshooting
      if (providerName === 'google') {
        console.log(`[${new Date().toISOString()}] Google raw response:`, JSON.stringify(response.data).substring(0, 500));
      }

      const normalizedResponse = normalizeToOpenAIResponse(response.data, model);
      return sendJSON(res, 200, normalizedResponse);
    }

    // POST /v1/embeddings
    if (req.method === 'POST' && req.url === '/v1/embeddings') {
      // Authenticate
      const apiKey = authenticate(req);
      if (!apiKey) {
        return sendJSON(res, 401, {
          error: {
            message: 'Invalid authentication credentials',
            type: 'invalid_request_error',
            code: 'invalid_api_key'
          }
        });
      }

      const body = await parseBody(req);
      const { model, input, encoding_format, ...params } = body;

      // Validate input
      if (!input) {
        return sendJSON(res, 400, {
          error: {
            message: 'Missing required parameter: input',
            type: 'invalid_request_error',
            code: 'missing_input'
          }
        });
      }

      // Check if model is supported
      const modelConfig = MODEL_ROUTES[model];
      if (!modelConfig) {
        return sendJSON(res, 400, {
          error: {
            message: `Model '${model}' not supported. Available models: ${Object.keys(MODEL_ROUTES).join(', ')}`,
            type: 'invalid_request_error',
            code: 'model_not_found'
          }
        });
      }

      const providerName = modelConfig.providerId;

      // Check if API key has permission to use this model
      const allowedModels = apiKey.allowedModels || [];
      if (allowedModels.length > 0 && !allowedModels.includes(model)) {
        return sendJSON(res, 403, {
          error: {
            message: `Access denied. This API key does not have permission to use model '${model}'.`,
            type: 'permission_error',
            code: 'model_not_allowed'
          }
        });
      }

      const provider = PROVIDERS[providerName];
      if (!provider || !provider.apiKey) {
        return sendJSON(res, 500, {
          error: {
            message: `Provider '${providerName}' not configured. Missing API key.`,
            type: 'server_error',
            code: 'provider_not_configured'
          }
        });
      }

      console.log(`[${new Date().toISOString()}] Embeddings: ${model} -> ${providerName}`);

      // Build embeddings request (OpenAI-compatible format)
      const embeddingRequest = {
        model: model,
        input: input,
        encoding_format: encoding_format || 'float',
        ...params
      };

      const response = await makeRequest(
        `${provider.baseUrl}/embeddings`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000
        },
        embeddingRequest
      );

      console.log(`[${new Date().toISOString()}] ${providerName} embeddings response: ${response.status}`);

      if (response.status !== 200) {
        return sendJSON(res, response.status, response.data);
      }

      // Return embeddings response (already in OpenAI format)
      return sendJSON(res, 200, response.data);
    }

    // POST /v1/rerank
    if (req.method === 'POST' && req.url === '/v1/rerank') {
      // Authenticate
      const apiKey = authenticate(req);
      if (!apiKey) {
        return sendJSON(res, 401, {
          error: {
            message: 'Invalid authentication credentials',
            type: 'invalid_request_error',
            code: 'invalid_api_key'
          }
        });
      }

      const body = await parseBody(req);
      const { model, query, documents, top_n, return_documents, ...params } = body;

      // Validate input
      if (!query) {
        return sendJSON(res, 400, {
          error: {
            message: 'Missing required parameter: query',
            type: 'invalid_request_error',
            code: 'missing_query'
          }
        });
      }

      if (!documents || !Array.isArray(documents) || documents.length === 0) {
        return sendJSON(res, 400, {
          error: {
            message: 'Missing or invalid required parameter: documents (must be a non-empty array)',
            type: 'invalid_request_error',
            code: 'missing_documents'
          }
        });
      }

      // Check if model is supported
      const modelConfig = MODEL_ROUTES[model];
      if (!modelConfig) {
        return sendJSON(res, 400, {
          error: {
            message: `Model '${model}' not supported. Available models: ${Object.keys(MODEL_ROUTES).join(', ')}`,
            type: 'invalid_request_error',
            code: 'model_not_found'
          }
        });
      }

      const providerName = modelConfig.providerId;

      // Check if API key has permission to use this model
      const allowedModels = apiKey.allowedModels || [];
      if (allowedModels.length > 0 && !allowedModels.includes(model)) {
        return sendJSON(res, 403, {
          error: {
            message: `Access denied. This API key does not have permission to use model '${model}'.`,
            type: 'permission_error',
            code: 'model_not_allowed'
          }
        });
      }

      const provider = PROVIDERS[providerName];
      if (!provider || !provider.apiKey) {
        return sendJSON(res, 500, {
          error: {
            message: `Provider '${providerName}' not configured. Missing API key.`,
            type: 'server_error',
            code: 'provider_not_configured'
          }
        });
      }

      console.log(`[${new Date().toISOString()}] Reranking: ${model} -> ${providerName} (${documents.length} docs)`);

      // Build reranking request
      const rerankRequest = {
        model: model,
        query: query,
        documents: documents,
        top_n: top_n,
        return_documents: return_documents !== false,
        ...params
      };

      const response = await makeRequest(
        `${provider.baseUrl}/rerank`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000
        },
        rerankRequest
      );

      console.log(`[${new Date().toISOString()}] ${providerName} rerank response: ${response.status}`);

      if (response.status !== 200) {
        return sendJSON(res, response.status, response.data);
      }

      // Return reranking response
      return sendJSON(res, 200, response.data);
    }

    // POST /v1/audio/transcriptions
    if (req.method === 'POST' && req.url === '/v1/audio/transcriptions') {
      // Authenticate
      const apiKey = authenticate(req);
      if (!apiKey) {
        return sendJSON(res, 401, {
          error: {
            message: 'Invalid authentication credentials',
            type: 'invalid_request_error',
            code: 'invalid_api_key'
          }
        });
      }

      // Parse multipart form data
      let formData;
      try {
        formData = await parseMultipartFormData(req);
      } catch (error) {
        return sendJSON(res, 400, {
          error: {
            message: 'Failed to parse multipart/form-data: ' + error.message,
            type: 'invalid_request_error',
            code: 'invalid_multipart_data'
          }
        });
      }

      const model = formData.model;
      const file = formData.file;

      // Validate required fields
      if (!file || !file.data) {
        return sendJSON(res, 400, {
          error: {
            message: 'Missing required parameter: file',
            type: 'invalid_request_error',
            code: 'missing_file'
          }
        });
      }

      if (!model) {
        return sendJSON(res, 400, {
          error: {
            message: 'Missing required parameter: model',
            type: 'invalid_request_error',
            code: 'missing_model'
          }
        });
      }

      // Check if model is supported
      const modelConfig = MODEL_ROUTES[model];
      if (!modelConfig) {
        return sendJSON(res, 400, {
          error: {
            message: `Model '${model}' not supported. Available models: ${Object.keys(MODEL_ROUTES).join(', ')}`,
            type: 'invalid_request_error',
            code: 'model_not_found'
          }
        });
      }

      const providerName = modelConfig.providerId;

      // Check if API key has permission to use this model
      const allowedModels = apiKey.allowedModels || [];
      if (allowedModels.length > 0 && !allowedModels.includes(model)) {
        return sendJSON(res, 403, {
          error: {
            message: `Access denied. This API key does not have permission to use model '${model}'.`,
            type: 'permission_error',
            code: 'model_not_allowed'
          }
        });
      }

      const provider = PROVIDERS[providerName];
      if (!provider || !provider.apiKey) {
        return sendJSON(res, 500, {
          error: {
            message: `Provider '${providerName}' not configured. Missing API key.`,
            type: 'server_error',
            code: 'provider_not_configured'
          }
        });
      }

      console.log(`[${new Date().toISOString()}] Transcription: ${model} -> ${providerName}, file: ${file.filename}`);

      // Check if this is a Chutes provider
      const isChutes = isChutesProvider(provider.baseUrl);
      let response;

      if (isChutes) {
        // Chutes format: POST /transcribe with audio_b64
        console.log(`[${new Date().toISOString()}] Using Chutes format for transcription (file: ${file.filename})`);

        const audio_b64 = audioBufferToBase64(file.data);

        const chutesRequest = {
          audio_b64: audio_b64
        };

        // Add optional parameters if Chutes supports them
        if (formData.language) chutesRequest.language = formData.language;
        if (formData.prompt) chutesRequest.prompt = formData.prompt;

        response = await makeRequest(
          `${provider.baseUrl}/transcribe`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${provider.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 300000 // 5 minutes for large audio files
          },
          chutesRequest
        );

        console.log(`[${new Date().toISOString()}] ${providerName} transcription response: ${response.status}`);

        if (response.status !== 200) {
          return sendJSON(res, response.status, response.data);
        }

        // Transform Chutes response to OpenAI format
        const openaiResponse = transformChutesTranscriptionResponse(response.data);
        return sendJSON(res, 200, openaiResponse);

      } else {
        // Standard OpenAI format: POST /audio/transcriptions with multipart file
        console.log(`[${new Date().toISOString()}] Using OpenAI format for transcription`);

        const transcriptionFormData = {
          file: {
            filename: file.filename,
            data: file.data,
            contentType: 'application/octet-stream'
          },
          model: model
        };

        // Add optional parameters if present
        if (formData.language) transcriptionFormData.language = formData.language;
        if (formData.prompt) transcriptionFormData.prompt = formData.prompt;
        if (formData.response_format) transcriptionFormData.response_format = formData.response_format;
        if (formData.temperature) transcriptionFormData.temperature = formData.temperature;
        if (formData.timestamp_granularities) transcriptionFormData.timestamp_granularities = formData.timestamp_granularities;

        response = await makeMultipartRequest(
          `${provider.baseUrl}/audio/transcriptions`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${provider.apiKey}`
            },
            timeout: 300000 // 5 minutes for large audio files
          },
          transcriptionFormData
        );

        console.log(`[${new Date().toISOString()}] ${providerName} transcription response: ${response.status}`);

        if (response.status !== 200) {
          return sendJSON(res, response.status, response.data);
        }

        // Return transcription response (already in OpenAI format)
        return sendJSON(res, 200, response.data);
      }
    }

    // POST /v1/ocr - Image OCR (Optical Character Recognition)
    if (req.method === 'POST' && req.url === '/v1/ocr') {
      // Authenticate
      const apiKey = authenticate(req);
      if (!apiKey) {
        return sendJSON(res, 401, {
          error: {
            message: 'Invalid authentication credentials',
            type: 'invalid_request_error',
            code: 'invalid_api_key'
          }
        });
      }

      // Parse multipart form data
      let formData;
      try {
        formData = await parseMultipartFormData(req);
      } catch (error) {
        return sendJSON(res, 400, {
          error: {
            message: 'Failed to parse multipart/form-data: ' + error.message,
            type: 'invalid_request_error',
            code: 'invalid_multipart_data'
          }
        });
      }

      const model = formData.model;
      const file = formData.file;

      // Validate required fields
      if (!file || !file.data) {
        return sendJSON(res, 400, {
          error: {
            message: 'Missing required parameter: file (image)',
            type: 'invalid_request_error',
            code: 'missing_file'
          }
        });
      }

      if (!model) {
        return sendJSON(res, 400, {
          error: {
            message: 'Missing required parameter: model',
            type: 'invalid_request_error',
            code: 'missing_model'
          }
        });
      }

      // Check if model is supported
      const modelConfig = MODEL_ROUTES[model];
      if (!modelConfig) {
        return sendJSON(res, 400, {
          error: {
            message: `Model '${model}' not supported. Available models: ${Object.keys(MODEL_ROUTES).join(', ')}`,
            type: 'invalid_request_error',
            code: 'model_not_found'
          }
        });
      }

      const providerName = modelConfig.providerId;

      // Check if API key has permission to use this model
      const allowedModels = apiKey.allowedModels || [];
      if (allowedModels.length > 0 && !allowedModels.includes(model)) {
        return sendJSON(res, 403, {
          error: {
            message: `Access denied. This API key does not have permission to use model '${model}'.`,
            type: 'permission_error',
            code: 'model_not_allowed'
          }
        });
      }

      const provider = PROVIDERS[providerName];
      if (!provider || !provider.apiKey) {
        return sendJSON(res, 500, {
          error: {
            message: `Provider '${providerName}' not configured. Missing API key.`,
            type: 'server_error',
            code: 'provider_not_configured'
          }
        });
      }

      console.log(`[${new Date().toISOString()}] OCR: ${model} -> ${providerName}, file: ${file.filename}`);

      // Check if this is a Chutes provider
      const isChutes = isChutesProvider(provider.baseUrl);
      let response;

      if (isChutes) {
        // Chutes format for OCR: POST /ocr with image_b64
        console.log(`[${new Date().toISOString()}] Using Chutes format for OCR`);

        const image_b64 = audioBufferToBase64(file.data); // Same base64 conversion

        const chutesRequest = {
          image_b64: image_b64
        };

        response = await makeRequest(
          `${provider.baseUrl}/ocr`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${provider.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 120000
          },
          chutesRequest
        );

        console.log(`[${new Date().toISOString()}] ${providerName} OCR response: ${response.status}`);

        if (response.status !== 200) {
          return sendJSON(res, response.status, response.data);
        }

        // Transform response to standard format
        const text = typeof response.data === 'string' ? response.data :
                     response.data.text || response.data.result || JSON.stringify(response.data);

        return sendJSON(res, 200, {
          text: text,
          model: model,
          provider: providerName
        });

      } else {
        // Use Vision API for OCR (for SiliconFlow and other OpenAI-compatible providers)
        console.log(`[${new Date().toISOString()}] Using Vision API for OCR`);

        const image_b64 = audioBufferToBase64(file.data);
        const mimeType = file.contentType || 'image/png';

        const visionRequest = {
          model: model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract all text from this image. Return only the extracted text without any additional commentary or formatting.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${image_b64}`
                  }
                }
              ]
            }
          ],
          max_tokens: 4000
        };

        response = await makeRequest(
          `${provider.baseUrl}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${provider.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 120000
          },
          visionRequest
        );

        console.log(`[${new Date().toISOString()}] ${providerName} Vision OCR response: ${response.status}`);

        if (response.status !== 200) {
          return sendJSON(res, response.status, response.data);
        }

        // Extract text from vision response
        const text = response.data?.choices?.[0]?.message?.content || '';

        return sendJSON(res, 200, {
          text: text.trim(),
          model: model,
          provider: providerName
        });
      }
    }

    // 404 for unknown routes
    sendJSON(res, 404, {
      error: {
        message: 'Not found',
        type: 'invalid_request_error',
        code: 'not_found'
      }
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error:`, error.message);
    sendJSON(res, 500, {
      error: {
        message: error.message,
        type: 'server_error',
        code: 'internal_error'
      }
    });
  }
});

// Start server
server.listen(PORT, () => {
  const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  console.log(`🚀 iPin Proxy - Multi-Provider AI Gateway`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`👤 Admin: ${UI_USERNAME}`);
  console.log(`🔑 API Keys: ${db.getEnabledApiKeys().length}`);
  console.log(`📦 Providers: ${Object.keys(PROVIDERS).length}`);
  console.log(`🎯 Models: ${Object.keys(MODEL_ROUTES).length}`);
  console.log(`💾 Memory: ${mem}MB`);
  console.log(`\n🔗 Endpoints:`);
  console.log(`  • http://localhost:${PORT}/ (Admin UI)`);
  console.log(`  • http://localhost:${PORT}/chat.html (Chat Interface)`);
  console.log(`  • http://localhost:${PORT}/v1/chat/completions (API)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = server;
