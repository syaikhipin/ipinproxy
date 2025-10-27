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
    MODEL_ROUTES[m.id] = m.providerId;
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

// Transform request for HuggingFace
function transformHuggingFaceRequest(messages, params) {
  let prompt = '';
  for (const msg of messages) {
    if (msg.role === 'system') {
      prompt += `System: ${msg.content}\n\n`;
    } else if (msg.role === 'user') {
      prompt += `User: ${msg.content}\n\n`;
    } else if (msg.role === 'assistant') {
      prompt += `Assistant: ${msg.content}\n\n`;
    }
  }
  prompt += 'Assistant:';

  return {
    inputs: prompt,
    parameters: {
      max_new_tokens: params.max_tokens || 1024,
      temperature: params.temperature || 0.7,
      top_p: params.top_p || 0.9,
      return_full_text: false
    }
  };
}

// Transform HuggingFace response to OpenAI format
function transformHuggingFaceResponse(hfResponse, model) {
  // Validate HuggingFace response format
  if (!Array.isArray(hfResponse) || hfResponse.length === 0) {
    throw new Error('Invalid HuggingFace response format: expected non-empty array');
  }

  const text = hfResponse[0]?.generated_text || '';

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: text.trim()
      },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
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
        owned_by: MODEL_ROUTES[modelId]
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

      // Check if model is supported
      const providerName = MODEL_ROUTES[model];
      if (!providerName) {
        return sendJSON(res, 400, {
          error: {
            message: `Model '${model}' not supported. Available models: ${Object.keys(MODEL_ROUTES).join(', ')}`,
            type: 'invalid_request_error',
            code: 'model_not_found'
          }
        });
      }

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

      let response;

      if (provider.type === 'huggingface') {
        // HuggingFace request
        const hfRequest = transformHuggingFaceRequest(messages, params);
        const url = `${provider.baseUrl}/${model}`;

        response = await makeRequest(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000
        }, hfRequest);

        if (response.status !== 200) {
          return sendJSON(res, response.status, {
            error: {
              message: response.data.error || 'HuggingFace API error',
              type: 'api_error',
              code: 'provider_error'
            }
          });
        }

        const openaiResponse = transformHuggingFaceResponse(response.data, model);
        return sendJSON(res, 200, openaiResponse);

      } else {
        // OpenAI-compatible request
        const providerRequest = {
          model: model,
          messages: messages,
          stream: stream || false,
          ...params
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
          providerRequest
        );

        console.log(`[${new Date().toISOString()}] ${providerName} response: ${response.status}`);

        if (response.status !== 200) {
          return sendJSON(res, response.status, response.data);
        }

        const normalizedResponse = normalizeToOpenAIResponse(response.data, model);
        return sendJSON(res, 200, normalizedResponse);
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
