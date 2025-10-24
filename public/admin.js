// Global state
let providers = [];
let models = [];
let apiKeys = [];

// Authentication
function checkAuth() {
  const token = localStorage.getItem('admin_token');
  if (!token) {
    window.location.href = '/login.html';
  }
}

function logout() {
  localStorage.removeItem('admin_token');
  window.location.href = '/login.html';
}

// API calls
async function apiCall(url, options = {}) {
  const token = localStorage.getItem('admin_token');
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });

  if (response.status === 401) {
    logout();
    throw new Error('Unauthorized');
  }

  return response.json();
}

// Tab switching
function switchTab(tab, e) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  e.target.classList.add('active');
  document.getElementById(`${tab}-tab`).classList.add('active');
}

// Modal functions
function showModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Providers
async function loadProviders() {
  try {
    const data = await apiCall('/api/admin/providers');
    providers = data.providers;
    renderProviders();
    updateProviderSelect();
  } catch (error) {
    console.error('Error loading providers:', error);
  }
}

function renderProviders() {
  const tbody = document.querySelector('#providers-table tbody');
  tbody.innerHTML = providers.map(p => `
    <tr>
      <td><strong>${p.name}</strong></td>
      <td><code>${p.baseUrl}</code></td>
      <td><span class="badge badge-${p.type === 'openai' ? 'success' : 'danger'}">${p.type}</span></td>
      <td><span class="badge badge-${p.enabled ? 'success' : 'danger'}">${p.enabled ? 'Enabled' : 'Disabled'}</span></td>
      <td>
        <button class="btn" onclick="editProvider('${p.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteProvider('${p.id}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

function showAddProviderModal() {
  document.getElementById('provider-modal-title').textContent = 'Add Custom Provider';
  document.getElementById('provider-form').reset();
  document.getElementById('provider-id').value = '';
  document.getElementById('provider-is-edit').value = '';
  document.getElementById('provider-id-input').disabled = false;

  // Reset API key visibility toggle to hidden state
  const apiKeyInput = document.getElementById('provider-api-key');
  apiKeyInput.type = 'password';
  document.getElementById('provider-api-key-toggle-text').textContent = 'Show';
  delete apiKeyInput.dataset.originalKey;

  showModal('provider-modal');
}

// Toggle provider API key visibility
function toggleProviderApiKeyVisibility() {
  const apiKeyInput = document.getElementById('provider-api-key');
  const toggleText = document.getElementById('provider-api-key-toggle-text');

  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleText.textContent = 'Hide';
  } else {
    apiKeyInput.type = 'password';
    toggleText.textContent = 'Show';
  }
}

function editProvider(id) {
  const provider = providers.find(p => p.id === id);
  if (!provider) return;

  document.getElementById('provider-modal-title').textContent = 'Edit Provider';
  document.getElementById('provider-id').value = provider.id;
  document.getElementById('provider-is-edit').value = 'true';
  document.getElementById('provider-id-input').value = provider.id;
  document.getElementById('provider-id-input').disabled = true; // Can't change ID when editing
  document.getElementById('provider-name').value = provider.name;
  document.getElementById('provider-base-url').value = provider.baseUrl;

  // Store the original API key for comparison
  const apiKeyInput = document.getElementById('provider-api-key');
  apiKeyInput.value = provider.apiKey;
  apiKeyInput.dataset.originalKey = provider.apiKey;

  // Reset visibility toggle to hidden state
  apiKeyInput.type = 'password';
  document.getElementById('provider-api-key-toggle-text').textContent = 'Show';

  document.getElementById('provider-type').value = provider.type;
  document.getElementById('provider-enabled').checked = provider.enabled;
  showModal('provider-modal');
}

async function deleteProvider(id) {
  if (!confirm('Are you sure you want to delete this provider? All associated models will be deleted.')) {
    return;
  }

  try {
    await apiCall(`/api/admin/providers/${id}`, { method: 'DELETE' });
    await loadProviders();
    await loadModels();
  } catch (error) {
    alert('Error deleting provider');
  }
}

// Models
async function loadModels() {
  try {
    const data = await apiCall('/api/admin/models');
    models = data.models;
    renderModels();
  } catch (error) {
    console.error('Error loading models:', error);
  }
}

function renderModels() {
  const tbody = document.querySelector('#models-table tbody');
  tbody.innerHTML = models.map(m => {
    const provider = providers.find(p => p.id === m.providerId);
    return `
      <tr>
        <td><strong>${m.name}</strong></td>
        <td><code>${m.id}</code></td>
        <td>${provider ? provider.name : m.providerId}</td>
        <td><span class="badge badge-${m.enabled ? 'success' : 'danger'}">${m.enabled ? 'Enabled' : 'Disabled'}</span></td>
        <td>
          <button class="btn" onclick="editModel('${m.id}')">Edit</button>
          <button class="btn btn-danger" onclick="deleteModel('${m.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function updateProviderSelect() {
  const select = document.getElementById('model-provider');
  select.innerHTML = providers.map(p =>
    `<option value="${p.id}">${p.name}</option>`
  ).join('');
}

function showAddModelModal() {
  document.getElementById('model-modal-title').textContent = 'Add Model';
  document.getElementById('model-form').reset();
  document.getElementById('model-old-id').value = '';
  showModal('model-modal');
}

function editModel(id) {
  const model = models.find(m => m.id === id);
  if (!model) return;

  document.getElementById('model-modal-title').textContent = 'Edit Model';
  document.getElementById('model-old-id').value = model.id;
  document.getElementById('model-name').value = model.name;
  document.getElementById('model-id').value = model.id;
  document.getElementById('model-provider').value = model.providerId;
  document.getElementById('model-enabled').checked = model.enabled;
  showModal('model-modal');
}

async function deleteModel(id) {
  if (!confirm('Are you sure you want to delete this model?')) {
    return;
  }

  try {
    await apiCall(`/api/admin/models/${id}`, { method: 'DELETE' });
    await loadModels();
  } catch (error) {
    alert('Error deleting model');
  }
}

// Form submissions
document.getElementById('provider-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const oldId = document.getElementById('provider-id').value;
  const isEdit = document.getElementById('provider-is-edit').value === 'true';
  const newId = document.getElementById('provider-id-input').value.toLowerCase().trim();

  // Validate ID format
  if (!/^[a-z0-9_-]+$/.test(newId)) {
    alert('Provider ID can only contain lowercase letters, numbers, hyphens, and underscores');
    return;
  }

  const data = {
    id: newId,
    name: document.getElementById('provider-name').value,
    baseUrl: document.getElementById('provider-base-url').value,
    apiKey: document.getElementById('provider-api-key').value,
    type: document.getElementById('provider-type').value,
    enabled: document.getElementById('provider-enabled').checked
  };

  try {
    if (isEdit) {
      await apiCall(`/api/admin/providers/${oldId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } else {
      await apiCall('/api/admin/providers', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }

    closeModal('provider-modal');
    await loadProviders();
    await loadModels(); // Refresh models to show new provider option
  } catch (error) {
    alert('Error saving provider: ' + error.message);
  }
});

document.getElementById('model-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const oldId = document.getElementById('model-old-id').value;
  const data = {
    id: document.getElementById('model-id').value,
    name: document.getElementById('model-name').value,
    providerId: document.getElementById('model-provider').value,
    enabled: document.getElementById('model-enabled').checked
  };

  try {
    if (oldId) {
      await apiCall(`/api/admin/models/${oldId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } else {
      await apiCall('/api/admin/models', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }

    closeModal('model-modal');
    await loadModels();
  } catch (error) {
    alert('Error saving model');
  }
});

// API Keys
async function loadApiKeys() {
  try {
    const data = await apiCall('/api/admin/apikeys');
    apiKeys = data.apiKeys;
    renderApiKeys();
  } catch (error) {
    console.error('Error loading API keys:', error);
  }
}

function renderApiKeys() {
  const tbody = document.querySelector('#apikeys-table tbody');
  tbody.innerHTML = apiKeys.map(k => {
    const date = new Date(k.createdAt).toLocaleDateString();
    const maskedKey = k.key.substring(0, 7) + '...' + k.key.substring(k.key.length - 4);
    const isMaster = k.id === 'master';
    const allowedModels = k.allowedModels || [];
    const modelsText = allowedModels.length === 0 ? 'All Models' : `${allowedModels.length} model(s)`;

    return `
      <tr>
        <td><strong>${k.name}</strong>${isMaster ? ' <span class="badge badge-danger">Master</span>' : ''}</td>
        <td>${k.username || '-'}</td>
        <td><code>${maskedKey}</code></td>
        <td><span class="badge badge-success">${modelsText}</span></td>
        <td>${date}</td>
        <td><span class="badge badge-${k.enabled ? 'success' : 'danger'}">${k.enabled ? 'Enabled' : 'Disabled'}</span></td>
        <td>
          ${!isMaster ? `<button class="btn" onclick="editApiKey('${k.id}')">Edit</button>` : ''}
          ${!isMaster ? `<button class="btn btn-danger" onclick="deleteApiKey('${k.id}')">Delete</button>` : '<span style="color: #999;">Protected</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

function showAddApiKeyModal() {
  document.getElementById('apikey-modal-title').textContent = 'Add API Key';
  document.getElementById('apikey-form').reset();
  document.getElementById('apikey-id').value = '';
  document.getElementById('apikey-key').value = 'sk-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  // Populate models dropdown
  const modelSelect = document.getElementById('apikey-models');
  modelSelect.innerHTML = models.map(m =>
    `<option value="${m.id}">${m.name} (${m.id})</option>`
  ).join('');

  showModal('apikey-modal');
}

function editApiKey(id) {
  const apiKey = apiKeys.find(k => k.id === id);
  if (!apiKey) return;

  document.getElementById('apikey-modal-title').textContent = 'Edit API Key';
  document.getElementById('apikey-id').value = apiKey.id;
  document.getElementById('apikey-name').value = apiKey.name;
  document.getElementById('apikey-username').value = apiKey.username || '';
  document.getElementById('apikey-key').value = apiKey.key;
  document.getElementById('apikey-enabled').checked = apiKey.enabled;

  // Populate models dropdown
  const modelSelect = document.getElementById('apikey-models');
  modelSelect.innerHTML = models.map(m =>
    `<option value="${m.id}">${m.name} (${m.id})</option>`
  ).join('');

  // Select allowed models
  const allowedModels = apiKey.allowedModels || [];
  Array.from(modelSelect.options).forEach(option => {
    option.selected = allowedModels.includes(option.value);
  });

  showModal('apikey-modal');
}

async function deleteApiKey(id) {
  if (!confirm('Are you sure you want to delete this API key? Users using this key will lose access.')) {
    return;
  }

  try {
    await apiCall(`/api/admin/apikeys/${id}`, { method: 'DELETE' });
    await loadApiKeys();
  } catch (error) {
    alert('Error deleting API key');
  }
}

// API Key form submission
document.getElementById('apikey-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('apikey-id').value;
  const modelSelect = document.getElementById('apikey-models');
  const selectedModels = Array.from(modelSelect.selectedOptions).map(opt => opt.value);

  const data = {
    id: id || `key_${Date.now()}`,
    name: document.getElementById('apikey-name').value,
    username: document.getElementById('apikey-username').value,
    key: document.getElementById('apikey-key').value,
    allowedModels: selectedModels,
    enabled: document.getElementById('apikey-enabled').checked
  };

  try {
    if (id) {
      await apiCall(`/api/admin/apikeys/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } else {
      await apiCall('/api/admin/apikeys', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }

    closeModal('apikey-modal');
    await loadApiKeys();
  } catch (error) {
    alert('Error saving API key');
  }
});

// Chat functionality
let chatMessages = [];
let chatApiKey = null;
let currentImage = null; // Store current image as base64

async function loadChatModels() {
  // Get master API key from server (from .env)
  try {
    const response = await apiCall('/api/admin/masterkey');
    chatApiKey = response.masterKey;
  } catch (error) {
    console.error('Failed to get master key:', error);
  }

  if (!chatApiKey) {
    document.getElementById('chat-model-select').innerHTML = '<option value="">No API key available</option>';
    return;
  }

  try {
    const response = await fetch('/v1/models', {
      headers: {
        'Authorization': `Bearer ${chatApiKey}`
      }
    });

    if (!response.ok) throw new Error('Failed to load models');

    const data = await response.json();
    const select = document.getElementById('chat-model-select');

    if (data.data && data.data.length > 0) {
      select.innerHTML = data.data.map(m => {
        const hasVision = supportsVision(m.id);
        const visionIcon = hasVision ? '📷 ' : '';
        return `<option value="${m.id}">${visionIcon}${m.id}</option>`;
      }).join('');
    } else {
      select.innerHTML = '<option value="">No models available</option>';
    }
  } catch (error) {
    console.error('Error loading chat models:', error);
  }
}

async function testChatConnection() {
  const model = document.getElementById('chat-model-select').value;

  if (!chatApiKey) {
    showChatStatus('error', 'No API key available');
    return;
  }

  if (!model) {
    showChatStatus('error', 'Please select a model');
    return;
  }

  try {
    const response = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${chatApiKey}`,
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

    showChatStatus('success', `✓ Connection successful! Model: ${model}`);
  } catch (error) {
    showChatStatus('error', `✗ Connection failed: ${error.message}`);
  }
}

function showChatStatus(type, message) {
  const status = document.getElementById('chat-status');
  status.style.display = 'block';
  status.style.background = type === 'success' ? '#d4edda' : '#f8d7da';
  status.style.color = type === 'success' ? '#155724' : '#721c24';
  status.style.border = `1px solid ${type === 'success' ? '#c3e6cb' : '#f5c6cb'}`;
  status.textContent = message;

  setTimeout(() => {
    status.style.display = 'none';
  }, 5000);
}

async function sendChatMessage() {
  const model = document.getElementById('chat-model-select').value;
  const input = document.getElementById('chat-input');
  const message = input.value.trim();

  if (!chatApiKey) {
    showChatStatus('error', 'No API key available');
    return;
  }

  if (!model) {
    showChatStatus('error', 'Please select a model');
    return;
  }

  if (!message && !currentImage) {
    showChatStatus('error', 'Please enter a message or attach an image');
    return;
  }

  // Check if model supports vision when image is attached
  if (currentImage && !supportsVision(model)) {
    showChatStatus('error', 'This model does not support image inputs. Please select a vision-capable model (Claude, GPT-4 Vision, Gemini, or Qwen-VL)');
    return;
  }

  // Prepare user message content
  let userContent;
  let hasImage = false;

  if (currentImage) {
    // Format message with image for vision models
    userContent = [
      {
        type: 'text',
        text: message || 'What is in this image?'
      },
      {
        type: 'image_url',
        image_url: {
          url: currentImage
        }
      }
    ];
    hasImage = true;
  } else {
    // Text-only message
    userContent = message;
  }

  // Add user message
  chatMessages.push({ role: 'user', content: userContent, hasImage: hasImage, imageData: hasImage ? currentImage : null });
  renderChatMessages();
  input.value = '';

  // Clear image after sending
  if (currentImage) {
    removeImage();
  }

  // Disable send button
  const sendBtn = document.getElementById('chat-send-btn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';

  try {
    const response = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${chatApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: chatMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to send message');
    }

    const data = await response.json();
    const assistantMessage = data.choices[0].message.content;

    // Format model name
    const modelDisplay = formatModelName(model);

    // Add assistant message
    chatMessages.push({ role: 'assistant', content: assistantMessage, model: modelDisplay });
    renderChatMessages();
  } catch (error) {
    showChatStatus('error', `Error: ${error.message}`);
    chatMessages.pop();
    renderChatMessages();
    input.value = message;
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
  }
}

function formatModelName(modelId) {
  if (modelId.includes('claude-sonnet-4-5')) return 'Claude Sonnet 4.5';
  if (modelId.includes('claude')) return modelId.replace('claude-', 'Claude ').replace(/-/g, ' ');
  if (modelId === 'qwen3-max') return 'Qwen3 Max';
  if (modelId === 'glm-4.6') return 'GLM 4.6';
  if (modelId === 'kimi-k2') return 'Kimi K2';
  if (modelId === 'deepseek-v3.2') return 'DeepSeek V3.2';

  return modelId.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

function renderChatMessages() {
  const container = document.getElementById('chat-messages');

  if (chatMessages.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: #999; padding: 60px 20px;">
        <h3 style="font-size: 18px; margin-bottom: 10px;">No messages yet</h3>
        <p style="font-size: 14px;">Select a model and start chatting!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = chatMessages.map(msg => {
    const isUser = msg.role === 'user';
    const modelBadge = msg.model ? `<span style="display: inline-block; background: #667eea; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; margin-left: 8px;">${msg.model}</span>` : '';

    // Handle content - could be string or array (for vision messages)
    let contentHtml = '';
    if (msg.hasImage && msg.imageData) {
      // Display image with text
      const textContent = Array.isArray(msg.content)
        ? msg.content.find(c => c.type === 'text')?.text || ''
        : msg.content;
      contentHtml = `
        <div style="margin-bottom: 8px;">
          <img src="${msg.imageData}" style="max-width: 100%; max-height: 300px; border-radius: 8px; border: 1px solid ${isUser ? 'rgba(255,255,255,0.3)' : '#e0e0e0'};">
        </div>
        ${textContent ? `<div>${escapeHtml(textContent)}</div>` : ''}
      `;
    } else {
      // Text-only message
      const textContent = typeof msg.content === 'string'
        ? msg.content
        : (Array.isArray(msg.content) ? msg.content.find(c => c.type === 'text')?.text || '' : '');
      contentHtml = escapeHtml(textContent);
    }

    return `
      <div style="margin-bottom: 16px; display: flex; flex-direction: column; align-items: ${isUser ? 'flex-end' : 'flex-start'};">
        <div style="font-size: 11px; color: #999; margin-bottom: 4px; font-weight: 600;">${isUser ? 'YOU' : 'ASSISTANT'}${modelBadge}</div>
        <div style="max-width: 70%; padding: 12px 16px; border-radius: 12px; background: ${isUser ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white'}; color: ${isUser ? 'white' : '#333'}; ${!isUser ? 'border: 1px solid #e0e0e0;' : ''} white-space: pre-wrap; word-wrap: break-word;">
          ${contentHtml}
        </div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function clearChatHistory() {
  if (chatMessages.length === 0) return;

  if (confirm('Are you sure you want to clear the chat history?')) {
    chatMessages = [];
    renderChatMessages();
    showChatStatus('success', 'Chat cleared');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Image upload functionality
function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate file type
  if (!file.type.startsWith('image/')) {
    showChatStatus('error', 'Please select an image file');
    return;
  }

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    showChatStatus('error', 'Image size must be less than 10MB');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    currentImage = e.target.result; // Store base64 data
    document.getElementById('image-preview').src = currentImage;
    document.getElementById('image-preview-container').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  currentImage = null;
  document.getElementById('image-preview-container').style.display = 'none';
  document.getElementById('image-upload').value = '';
}

// Check if model supports vision
function supportsVision(modelId) {
  const visionModels = [
    'claude-sonnet',
    'claude-opus',
    'claude-haiku',
    'gpt-4-vision',
    'gpt-4-turbo',
    'gpt-4o',
    'gemini-2.5-pro',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'qwen-vl',
    'qwen2-vl'
  ];

  return visionModels.some(vm => modelId.toLowerCase().includes(vm));
}

// Keyboard shortcut for chat
document.addEventListener('DOMContentLoaded', () => {
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        sendChatMessage();
      }
    });
  }
});

// Initialize
checkAuth();
loadProviders();
loadModels();
loadApiKeys();

// Load chat models when switching to chat tab or when API keys are loaded
const originalSwitchTab = switchTab;
switchTab = function(tab, e) {
  originalSwitchTab(tab, e);
  if (tab === 'chat') {
    loadChatModels();
  }
  if (tab === 'apidocs') {
    loadApiDocsModels();
  }
};

// API Docs functionality
async function loadApiDocsModels() {
  try {
    const data = await apiCall('/api/admin/models');
    const select = document.getElementById('apidocs-model-select');

    select.innerHTML = '<option value="">Choose a model...</option>';

    if (data.models && data.models.length > 0) {
      data.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = `${model.name} (${model.id})`;
        select.appendChild(option);
      });
    } else {
      select.innerHTML = '<option value="">No models available</option>';
    }
  } catch (error) {
    console.error('Failed to load models for API docs:', error);
    const select = document.getElementById('apidocs-model-select');
    select.innerHTML = '<option value="">Error loading models</option>';
  }
}

function generateApiDocs() {
  const modelId = document.getElementById('apidocs-model-select').value;
  if (!modelId) {
    document.getElementById('apidocs-content').style.display = 'none';
    return;
  }

  document.getElementById('apidocs-content').style.display = 'block';

  const apiUrl = window.location.origin;

  // Generate cURL example
  const curlCode = `curl ${apiUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "${modelId}",
    "messages": [
      {
        "role": "user",
        "content": "Hello! How are you?"
      }
    ],
    "max_tokens": 1000,
    "temperature": 0.7
  }'`;

  // Generate Python example
  const pythonCode = `import requests

url = "${apiUrl}/v1/chat/completions"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_KEY"
}

data = {
    "model": "${modelId}",
    "messages": [
        {
            "role": "user",
            "content": "Hello! How are you?"
        }
    ],
    "max_tokens": 1000,
    "temperature": 0.7
}

response = requests.post(url, headers=headers, json=data)
result = response.json()
print(result["choices"][0]["message"]["content"])`;

  // Generate Node.js example
  const nodejsCode = `const fetch = require('node-fetch');

const url = '${apiUrl}/v1/chat/completions';
const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer YOUR_API_KEY'
};

const data = {
  model: '${modelId}',
  messages: [
    {
      role: 'user',
      content: 'Hello! How are you?'
    }
  ],
  max_tokens: 1000,
  temperature: 0.7
};

fetch(url, {
  method: 'POST',
  headers: headers,
  body: JSON.stringify(data)
})
  .then(res => res.json())
  .then(result => {
    console.log(result.choices[0].message.content);
  })
  .catch(error => {
    console.error('Error:', error);
  });`;

  document.getElementById('apidocs-curl').textContent = curlCode;
  document.getElementById('apidocs-python').textContent = pythonCode;
  document.getElementById('apidocs-nodejs').textContent = nodejsCode;
}

function copyCode(elementId) {
  const element = document.getElementById(elementId);
  const text = element.textContent;

  navigator.clipboard.writeText(text).then(() => {
    // Visual feedback
    const button = element.previousElementSibling;
    const originalText = button.textContent;
    button.textContent = '✓ Copied!';
    button.style.background = '#10b981';

    setTimeout(() => {
      button.textContent = originalText;
      button.style.background = '#667eea';
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy code:', err);
    alert('Failed to copy code to clipboard');
  });
}
