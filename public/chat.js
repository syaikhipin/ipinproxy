// Chat Interface JavaScript
let messages = [];
let isAdmin = false;
let adminToken = null;
let currentApiKey = null;
let modelProviderMap = {}; // Store model -> provider mapping

// Check if user is already logged in as admin
window.addEventListener('DOMContentLoaded', () => {
  adminToken = localStorage.getItem('adminToken');

  if (adminToken) {
    // User is already logged in from admin panel
    isAdmin = true;
    showChatInterface();
    loadApiKeysAndModels();
  } else {
    // Show login section
    document.getElementById('login-section').classList.add('active');
  }

  // Keyboard shortcut for sending
  document.getElementById('message-input').addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      sendMessage();
    }
  });
});

function logout() {
  localStorage.removeItem('adminToken');
  window.location.href = '/login.html';
}

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    showLoginStatus('error', 'Please enter username and password');
    return;
  }

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      throw new Error('Invalid credentials');
    }

    const data = await response.json();
    adminToken = data.token;
    localStorage.setItem('adminToken', adminToken);
    isAdmin = true;

    showChatInterface();
    loadApiKeysAndModels();
  } catch (error) {
    showLoginStatus('error', error.message);
  }
}

function showLoginStatus(type, message) {
  const status = document.getElementById('login-status');
  status.className = `status ${type}`;
  status.textContent = message;
  status.style.display = 'block';

  setTimeout(() => {
    status.style.display = 'none';
  }, 3000);
}

function showChatInterface() {
  // Hide login, show chat interface
  document.getElementById('login-section').classList.remove('active');
  document.getElementById('config-section').classList.add('active');

  // Show admin badge
  if (isAdmin) {
    document.getElementById('admin-badge').style.display = 'inline-block';
    // Hide API key input for admins
    document.getElementById('api-key').closest('.config-group').style.display = 'none';
  }
}

async function loadApiKeysAndModels() {
  if (!isAdmin) return;

  try {
    // Load API keys from admin API
    const keysResponse = await fetch('/api/admin/apikeys', {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    if (!keysResponse.ok) throw new Error('Failed to load API keys');

    const keysData = await keysResponse.json();
    const enabledKeys = keysData.apiKeys.filter(k => k.enabled);

    if (enabledKeys.length > 0) {
      // Use the first enabled key (master key)
      currentApiKey = enabledKeys[0].key;
      document.getElementById('api-key').value = currentApiKey;
    }

    // Load models with provider information
    await loadModels();
  } catch (error) {
    showStatus('error', `Failed to load data: ${error.message}`);
  }
}

async function loadModels() {
  const apiKey = currentApiKey || document.getElementById('api-key').value;

  if (!apiKey) {
    document.getElementById('model-select').innerHTML = '<option value="">No API key available</option>';
    return;
  }

  try {
    const response = await fetch('/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load models');
    }

    const data = await response.json();
    const select = document.getElementById('model-select');

    if (data.data && data.data.length > 0) {
      // Store model -> provider mapping
      data.data.forEach(model => {
        modelProviderMap[model.id] = model.owned_by;
      });

      select.innerHTML = data.data.map(model =>
        `<option value="${model.id}">${model.id} (${model.owned_by})</option>`
      ).join('');
    } else {
      select.innerHTML = '<option value="">No models available</option>';
    }
  } catch (error) {
    showStatus('error', error.message);
    document.getElementById('model-select').innerHTML = '<option value="">Failed to load models</option>';
  }
}

async function testConnection() {
  const apiKey = currentApiKey || document.getElementById('api-key').value;
  const model = document.getElementById('model-select').value;

  if (!apiKey) {
    showStatus('error', 'No API key available');
    return;
  }

  if (!model) {
    showStatus('error', 'Please select a model');
    return;
  }

  try {
    const response = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'Hi! Just testing the connection.' }],
        max_tokens: 50
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Connection test failed');
    }

    const provider = modelProviderMap[model] || 'unknown';
    showStatus('success', `✓ Connection successful! Model: ${model} (Provider: ${provider})`);
  } catch (error) {
    showStatus('error', `✗ Connection failed: ${error.message}`);
  }
}

function showStatus(type, message) {
  const status = document.getElementById('status');
  status.className = `status ${type}`;
  status.textContent = message;
  status.style.display = 'block';

  setTimeout(() => {
    status.style.display = 'none';
  }, 5000);
}

async function sendMessage() {
  const apiKey = currentApiKey || document.getElementById('api-key').value;
  const model = document.getElementById('model-select').value;
  const input = document.getElementById('message-input');
  const message = input.value.trim();

  if (!apiKey) {
    showStatus('error', 'No API key available');
    return;
  }

  if (!model) {
    showStatus('error', 'Please select a model');
    return;
  }

  if (!message) {
    showStatus('error', 'Please enter a message');
    return;
  }

  // Add user message
  messages.push({ role: 'user', content: message });
  renderMessages();
  input.value = '';

  // Disable send button
  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';

  try {
    const response = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to send message');
    }

    const data = await response.json();

    // Validate response structure
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      throw new Error('Invalid response format from API');
    }

    const assistantMessage = data.choices[0].message.content;

    // Format model name for display
    const modelDisplay = formatModelName(model);

    // Add assistant message with model info
    messages.push({ role: 'assistant', content: assistantMessage, model: modelDisplay });
    renderMessages();
  } catch (error) {
    showStatus('error', `Error: ${error.message}`);
    // Remove the last user message since it failed
    messages.pop();
    renderMessages();
    input.value = message; // Restore the message
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
  }
}

function formatModelName(modelId) {
  // Format model ID to a nice display name
  if (modelId.includes('claude-sonnet-4-5')) return 'Claude Sonnet 4.5';
  if (modelId.includes('claude')) return modelId.replace('claude-', 'Claude ').replace(/-/g, ' ');
  if (modelId === 'qwen3-max') return 'Qwen3 Max';
  if (modelId === 'glm-4.6') return 'GLM 4.6';
  if (modelId === 'kimi-k2') return 'Kimi K2';
  if (modelId === 'deepseek-v3.2') return 'DeepSeek V3.2';

  // Default: capitalize and remove dashes
  return modelId.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

function renderMessages() {
  const container = document.getElementById('chat-container');

  if (messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No messages yet</h3>
        <p>Select a model and start chatting!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = messages.map(msg => {
    const modelBadge = msg.model ? `<span class="provider-badge">${msg.model}</span>` : '';
    return `
      <div class="message ${msg.role}">
        <div class="message-label">${msg.role === 'user' ? 'You' : 'Assistant'}${modelBadge}</div>
        <div class="message-content">${escapeHtml(msg.content)}</div>
      </div>
    `;
  }).join('');

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function clearChat() {
  if (messages.length === 0) return;

  if (confirm('Are you sure you want to clear the chat history?')) {
    messages = [];
    renderMessages();
    showStatus('success', 'Chat cleared');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Enable enter key on login
document.getElementById('login-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    login();
  }
});