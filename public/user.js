// User Dashboard JavaScript
let userToken = null;
let userData = null;
let apiKeyData = null;
let messages = [];
let allowedModels = [];

// Check authentication on load
window.addEventListener('DOMContentLoaded', async () => {
  userToken = localStorage.getItem('user_token');

  if (!userToken) {
    window.location.href = '/login.html';
    return;
  }

  await loadUserData();
});

async function loadUserData() {
  try {
    const response = await fetch('/api/user/me', {
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load user data');
    }

    const data = await response.json();
    userData = data.user;
    apiKeyData = data.apiKey;

    // Update UI
    document.getElementById('username-display').textContent = userData.username;

    if (apiKeyData) {
      document.getElementById('api-key-display').textContent = apiKeyData.key;
      document.getElementById('key-name-display').textContent = apiKeyData.name;

      // Get allowed models
      allowedModels = apiKeyData.allowedModels || [];

      // Load models
      await loadModels();
      generateDocumentation();
    } else {
      document.getElementById('api-key-display').textContent = 'No API key assigned';
      document.getElementById('key-name-display').textContent = 'N/A';
      document.getElementById('models-list').innerHTML = '<div class="no-models">No API key assigned</div>';
    }
  } catch (error) {
    console.error('Error loading user data:', error);
    localStorage.removeItem('user_token');
    window.location.href = '/login.html';
  }
}

async function loadModels() {
  if (!apiKeyData) return;

  try {
    const response = await fetch('/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKeyData.key}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load models');
    }

    const data = await response.json();

    // Display models
    const modelsList = document.getElementById('models-list');
    const modelSelect = document.getElementById('model-select');

    if (data.data && data.data.length > 0) {
      modelsList.innerHTML = data.data.map(model =>
        `<span class="model-tag">${model.id}</span>`
      ).join('');

      modelSelect.innerHTML = data.data.map(model =>
        `<option value="${model.id}">${model.id} (${model.owned_by})</option>`
      ).join('');
    } else {
      modelsList.innerHTML = '<div class="no-models">No models available</div>';
      modelSelect.innerHTML = '<option value="">No models available</option>';
    }
  } catch (error) {
    console.error('Error loading models:', error);
    document.getElementById('models-list').innerHTML = '<div class="no-models">Failed to load models</div>';
  }
}

function copyApiKey() {
  const apiKey = document.getElementById('api-key-display').textContent;
  const copyBtn = document.getElementById('copy-btn');

  navigator.clipboard.writeText(apiKey).then(() => {
    copyBtn.textContent = 'Copied!';
    copyBtn.classList.add('copied');

    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('copied');
    }, 2000);
  });
}

function logout() {
  localStorage.removeItem('user_token');
  window.location.href = '/login.html';
}

function switchTab(tabName) {
  // Remove active class from all tabs and contents
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  // Add active class to selected tab and content
  event.target.classList.add('active');
  document.getElementById(`${tabName}-tab`).classList.add('active');
}

async function testConnection() {
  const model = document.getElementById('model-select').value;
  const testBtn = document.getElementById('test-btn');
  const testStatus = document.getElementById('test-status');

  if (!model) {
    testStatus.className = 'status error';
    testStatus.textContent = 'Please select a model';
    return;
  }

  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';
  testStatus.style.display = 'none';

  try {
    const response = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeyData.key}`,
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

    testStatus.className = 'status success';
    testStatus.textContent = `✓ Connection successful! Model: ${model}`;
  } catch (error) {
    testStatus.className = 'status error';
    testStatus.textContent = `✗ Connection failed: ${error.message}`;
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  }
}

async function sendMessage() {
  const model = document.getElementById('model-select').value;
  const input = document.getElementById('message-input');
  const message = input.value.trim();
  const sendBtn = document.getElementById('send-btn');

  if (!model) {
    alert('Please select a model');
    return;
  }

  if (!message) {
    alert('Please enter a message');
    return;
  }

  // Add user message
  messages.push({ role: 'user', content: message });
  renderMessages();
  input.value = '';

  // Disable send button
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';

  try {
    const response = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeyData.key}`,
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

    if (!data.choices || !data.choices[0]) {
      throw new Error('Invalid response format');
    }

    const assistantMessage = data.choices[0].message.content;
    messages.push({ role: 'assistant', content: assistantMessage, model: model });
    renderMessages();
  } catch (error) {
    alert(`Error: ${error.message}`);
    // Remove the last user message since it failed
    messages.pop();
    renderMessages();
    input.value = message; // Restore the message
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
  }
}

function renderMessages() {
  const container = document.getElementById('chat-container');

  if (messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Select a model and start chatting to test your API key!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = messages.map(msg => {
    const modelBadge = msg.model ? ` <span style="font-size:10px;opacity:0.7;">(${msg.model})</span>` : '';
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function generateDocumentation() {
  const baseUrl = window.location.origin;
  const apiKey = apiKeyData.key;

  // Base URL
  document.getElementById('base-url-display').textContent = `${baseUrl}/v1`;

  // cURL Example
  const curlExample = `curl ${baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "${allowedModels.length > 0 ? allowedModels[0] : 'your-model-id'}",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`;

  document.getElementById('curl-example').textContent = curlExample;

  // Python Example
  const pythonExample = `import requests

url = "${baseUrl}/v1/chat/completions"
headers = {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json"
}
data = {
    "model": "${allowedModels.length > 0 ? allowedModels[0] : 'your-model-id'}",
    "messages": [
        {"role": "user", "content": "Hello!"}
    ]
}

response = requests.post(url, headers=headers, json=data)
print(response.json())

# Or use OpenAI SDK:
# from openai import OpenAI
# client = OpenAI(
#     api_key="${apiKey}",
#     base_url="${baseUrl}/v1"
# )
# response = client.chat.completions.create(
#     model="${allowedModels.length > 0 ? allowedModels[0] : 'your-model-id'}",
#     messages=[{"role": "user", "content": "Hello!"}]
# )`;

  document.getElementById('python-example').textContent = pythonExample;

  // JavaScript Example
  const jsExample = `const response = await fetch('${baseUrl}/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${apiKey}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: '${allowedModels.length > 0 ? allowedModels[0] : 'your-model-id'}',
    messages: [
      { role: 'user', content: 'Hello!' }
    ]
  })
});

const data = await response.json();
console.log(data);`;

  document.getElementById('js-example').textContent = jsExample;
}

// Keyboard shortcuts
document.getElementById('message-input').addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') {
    sendMessage();
  }
});