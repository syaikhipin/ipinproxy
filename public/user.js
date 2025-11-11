// User Dashboard JavaScript
let userToken = null;
let userData = null;
let apiKeyData = null;
let messages = [];
let allowedModels = [];
let availableModels = []; // Store actual available models from API

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

    // Store available models for documentation generation
    availableModels = data.data || [];

    // Display models
    const modelsList = document.getElementById('models-list');
    const modelSelect = document.getElementById('model-select');
    const embeddingSelect = document.getElementById('embedding-model-select');
    const transcriptionSelect = document.getElementById('transcription-model-select');
    const ocrSelect = document.getElementById('ocr-model-select');
    const apiDocsSelect = document.getElementById('user-apidocs-model-select');

    if (data.data && data.data.length > 0) {
      modelsList.innerHTML = data.data.map(model =>
        `<span class="model-tag">${model.id}</span>`
      ).join('');

      // Chat models - all models can be used for chat
      modelSelect.innerHTML = data.data.map(model =>
        `<option value="${model.id}">${model.id}</option>`
      ).join('');

      // API Docs model selector - all models
      apiDocsSelect.innerHTML = '<option value="">Choose a model...</option>' +
        data.data.map(model =>
          `<option value="${model.id}">${model.id}</option>`
        ).join('');

      // Embedding models - filter by type
      const embeddingModels = data.data.filter(m => m.type === 'embedding');
      if (embeddingModels.length > 0) {
        embeddingSelect.innerHTML = embeddingModels.map(model =>
          `<option value="${model.id}">${model.id}</option>`
        ).join('');
      } else {
        embeddingSelect.innerHTML = '<option value="">No embedding models available</option>';
      }

      // Transcription models - filter by type
      const transcriptionModels = data.data.filter(m => m.type === 'transcription');
      if (transcriptionModels.length > 0) {
        transcriptionSelect.innerHTML = transcriptionModels.map(model =>
          `<option value="${model.id}">${model.id}</option>`
        ).join('');
      } else {
        transcriptionSelect.innerHTML = '<option value="">No transcription models available</option>';
      }

      // OCR models - filter by type
      const ocrModels = data.data.filter(m => m.type === 'ocr');
      if (ocrModels.length > 0) {
        ocrSelect.innerHTML = ocrModels.map(model =>
          `<option value="${model.id}">${model.id}</option>`
        ).join('');
      } else {
        ocrSelect.innerHTML = '<option value="">No OCR models available</option>';
      }

      // Reranking models - filter by type
      const rerankingSelect = document.getElementById('reranking-model-select');
      if (rerankingSelect) {
        const rerankingModels = data.data.filter(m => m.type === 'reranking');
        if (rerankingModels.length > 0) {
          rerankingSelect.innerHTML = rerankingModels.map(model =>
            `<option value="${model.id}">${model.id}</option>`
          ).join('');
        } else {
          rerankingSelect.innerHTML = '<option value="">No reranking models available</option>';
        }
      }
    } else {
      modelsList.innerHTML = '<div class="no-models">No models available</div>';
      modelSelect.innerHTML = '<option value="">No models available</option>';
      embeddingSelect.innerHTML = '<option value="">No models available</option>';
      transcriptionSelect.innerHTML = '<option value="">No models available</option>';
      ocrSelect.innerHTML = '<option value="">No models available</option>';
      apiDocsSelect.innerHTML = '<option value="">No models available</option>';
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

function switchTab(tabName, event) {
  // Remove active class from all tabs and contents
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  // Add active class to selected tab and content
  if (event && event.target) {
    event.target.classList.add('active');
  }
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

  // Get selected model from dropdown
  const selectedModelId = document.getElementById('user-apidocs-model-select').value;
  const selectedModelObj = availableModels.find(m => m.id === selectedModelId);
  const exampleModel = selectedModelId || (availableModels.length > 0 ? availableModels[0].id : 'your-model-id');
  const modelType = selectedModelObj?.type || 'chat';

  // Hide content if no model is selected
  const contentDiv = document.getElementById('user-apidocs-content');
  if (!selectedModelId && availableModels.length > 0) {
    contentDiv.style.display = 'none';
    return;
  }
  contentDiv.style.display = 'block';

  // Base URL
  document.getElementById('base-url-display').textContent = `${baseUrl}/v1`;

  // Generate examples based on model type
  let curlExample, pythonExample, jsExample;

  if (modelType === 'embedding') {
    // Embedding examples
    curlExample = `curl ${baseUrl}/v1/embeddings \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "${exampleModel}",
    "input": "Your text here"
  }'`;

    pythonExample = `import requests

url = "${baseUrl}/v1/embeddings"
headers = {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json"
}
data = {
    "model": "${exampleModel}",
    "input": "Your text here"
}

response = requests.post(url, headers=headers, json=data)
print(response.json())`;

    jsExample = `const response = await fetch('${baseUrl}/v1/embeddings', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${apiKey}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: '${exampleModel}',
    input: 'Your text here'
  })
});

const data = await response.json();
console.log(data);`;

  } else if (modelType === 'transcription') {
    // Transcription examples
    curlExample = `curl ${baseUrl}/v1/audio/transcriptions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -F model="${exampleModel}" \\
  -F file="@audio.mp3"`;

    pythonExample = `import requests

url = "${baseUrl}/v1/audio/transcriptions"
headers = {
    "Authorization": "Bearer ${apiKey}"
}
files = {
    "file": open("audio.mp3", "rb")
}
data = {
    "model": "${exampleModel}"
}

response = requests.post(url, headers=headers, files=files, data=data)
print(response.json())`;

    jsExample = `const formData = new FormData();
formData.append('file', audioFile);
formData.append('model', '${exampleModel}');

const response = await fetch('${baseUrl}/v1/audio/transcriptions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${apiKey}'
  },
  body: formData
});

const data = await response.json();
console.log(data);`;

  } else if (modelType === 'reranking') {
    // Reranking examples
    curlExample = `curl ${baseUrl}/v1/rerank \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "${exampleModel}",
    "query": "Apple",
    "documents": ["apple", "banana", "fruit", "vegetable"]
  }'`;

    pythonExample = `import requests

url = "${baseUrl}/v1/rerank"
headers = {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json"
}
data = {
    "model": "${exampleModel}",
    "query": "Apple",
    "documents": ["apple", "banana", "fruit", "vegetable"]
}

response = requests.post(url, headers=headers, json=data)
print(response.json())`;

    jsExample = `const response = await fetch('${baseUrl}/v1/rerank', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${apiKey}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: '${exampleModel}',
    query: 'Apple',
    documents: ['apple', 'banana', 'fruit', 'vegetable']
  })
});

const data = await response.json();
console.log(data);`;

  } else {
    // Chat (default) examples
    curlExample = `curl ${baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "${exampleModel}",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`;

    pythonExample = `import requests

url = "${baseUrl}/v1/chat/completions"
headers = {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json"
}
data = {
    "model": "${exampleModel}",
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
#     model="${exampleModel}",
#     messages=[{"role": "user", "content": "Hello!"}]
# )`;

    jsExample = `const response = await fetch('${baseUrl}/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${apiKey}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: '${exampleModel}',
    messages: [
      { role: 'user', content: 'Hello!' }
    ]
  })
});

const data = await response.json();
console.log(data);`;
  }

  document.getElementById('curl-example').textContent = curlExample;
  document.getElementById('python-example').textContent = pythonExample;
  document.getElementById('js-example').textContent = jsExample;
}

// Copy code to clipboard
function copyCode(elementId) {
  const codeElement = document.getElementById(elementId);
  const code = codeElement.textContent;

  navigator.clipboard.writeText(code).then(() => {
    // Find the button that was clicked
    const button = codeElement.parentElement.querySelector('button');
    if (button) {
      const originalText = button.textContent;
      button.textContent = 'Copied!';
      button.style.background = '#10b981';

      setTimeout(() => {
        button.textContent = originalText;
        button.style.background = '#667eea';
      }, 2000);
    }
  }).catch(err => {
    console.error('Failed to copy code:', err);
    alert('Failed to copy code to clipboard');
  });
}

// Keyboard shortcuts
document.addEventListener('DOMContentLoaded', () => {
  const messageInput = document.getElementById('message-input');
  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        sendMessage();
      }
    });
  }
});

// ============================================
// EMBEDDINGS FUNCTIONS
// ============================================

async function generateEmbedding() {
  const model = document.getElementById('embedding-model-select').value;
  const input = document.getElementById('embedding-input').value.trim();
  const btn = document.getElementById('embedding-btn');
  const status = document.getElementById('embedding-status');
  const result = document.getElementById('embedding-result');

  if (!model) {
    status.className = 'status error';
    status.textContent = 'Please select an embedding model';
    return;
  }

  if (!input) {
    status.className = 'status error';
    status.textContent = 'Please enter text to generate embeddings';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Generating...';
  status.style.display = 'none';
  result.style.display = 'none';

  try {
    const response = await fetch('/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeyData.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        input: input
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to generate embedding');
    }

    const data = await response.json();

    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      throw new Error('Invalid response format');
    }

    const embedding = data.data[0].embedding;

    // Display results
    document.getElementById('embedding-result-model').textContent = data.model || model;
    document.getElementById('embedding-result-dims').textContent = embedding.length;
    document.getElementById('embedding-result-vector').textContent =
      JSON.stringify(embedding.slice(0, 10), null, 2) + '\n... (' + (embedding.length - 10) + ' more values)';

    result.style.display = 'block';
    status.className = 'status success';
    status.textContent = `✓ Embedding generated successfully! (${embedding.length} dimensions)`;
  } catch (error) {
    status.className = 'status error';
    status.textContent = `✗ Error: ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Embedding';
  }
}

// ============================================
// TRANSCRIPTION FUNCTIONS
// ============================================

async function transcribeAudio() {
  const model = document.getElementById('transcription-model-select').value;
  const fileInput = document.getElementById('audio-file-input');
  const language = document.getElementById('transcription-language').value.trim();
  const btn = document.getElementById('transcription-btn');
  const status = document.getElementById('transcription-status');
  const result = document.getElementById('transcription-result');

  if (!model) {
    status.className = 'status error';
    status.textContent = 'Please select a transcription model';
    return;
  }

  if (!fileInput.files || !fileInput.files[0]) {
    status.className = 'status error';
    status.textContent = 'Please select an audio file';
    return;
  }

  const file = fileInput.files[0];
  const maxSize = 25 * 1024 * 1024; // 25MB

  if (file.size > maxSize) {
    status.className = 'status error';
    status.textContent = `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (25MB)`;
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Transcribing...';
  status.style.display = 'none';
  result.style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', model);
    if (language) {
      formData.append('language', language);
    }

    const response = await fetch('/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeyData.key}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to transcribe audio');
    }

    const data = await response.json();

    if (!data.text) {
      throw new Error('Invalid response format');
    }

    // Display result
    document.getElementById('transcription-result-text').textContent = data.text;
    result.style.display = 'block';
    status.className = 'status success';
    status.textContent = `✓ Audio transcribed successfully!`;
  } catch (error) {
    status.className = 'status error';
    status.textContent = `✗ Error: ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Transcribe Audio';
  }
}

// ============================================
// OCR FUNCTIONS
// ============================================

// Preview image when selected
document.addEventListener('DOMContentLoaded', () => {
  const ocrFileInput = document.getElementById('ocr-file-input');
  if (ocrFileInput) {
    ocrFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          document.getElementById('ocr-preview-img').src = e.target.result;
          document.getElementById('ocr-preview').style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });
  }
});

async function performOCR() {
  const model = document.getElementById('ocr-model-select').value;
  const fileInput = document.getElementById('ocr-file-input');
  const btn = document.getElementById('ocr-btn');
  const status = document.getElementById('ocr-status');
  const result = document.getElementById('ocr-result');

  if (!model) {
    status.className = 'status error';
    status.textContent = 'Please select an OCR model';
    return;
  }

  if (!fileInput.files || !fileInput.files[0]) {
    status.className = 'status error';
    status.textContent = 'Please select an image file';
    return;
  }

  const file = fileInput.files[0];
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (file.size > maxSize) {
    status.className = 'status error';
    status.textContent = `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (10MB)`;
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Extracting...';
  status.style.display = 'none';
  result.style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', model);

    const response = await fetch('/v1/ocr', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeyData.key}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to perform OCR');
    }

    const data = await response.json();

    if (!data.text) {
      throw new Error('Invalid response format');
    }

    // Display result
    document.getElementById('ocr-result-text').textContent = data.text;
    result.style.display = 'block';
    status.className = 'status success';
    status.textContent = `✓ Text extracted successfully!`;
  } catch (error) {
    status.className = 'status error';
    status.textContent = `✗ Error: ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Extract Text';
  }
}

// ============================================
// RERANKING FUNCTIONS
// ============================================

async function performReranking() {
  const model = document.getElementById('reranking-model-select').value;
  const query = document.getElementById('reranking-query').value.trim();
  const documentsText = document.getElementById('reranking-documents').value.trim();
  const btn = document.getElementById('reranking-btn');
  const status = document.getElementById('reranking-status');
  const result = document.getElementById('reranking-result');

  if (!model) {
    status.className = 'status error';
    status.textContent = 'Please select a reranking model';
    return;
  }

  if (!query) {
    status.className = 'status error';
    status.textContent = 'Please enter a query';
    return;
  }

  if (!documentsText) {
    status.className = 'status error';
    status.textContent = 'Please enter documents to rerank (one per line)';
    return;
  }

  // Parse documents (one per line)
  const documents = documentsText.split('\n').map(d => d.trim()).filter(d => d.length > 0);

  if (documents.length < 2) {
    status.className = 'status error';
    status.textContent = 'Please enter at least 2 documents to rerank';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Reranking...';
  status.style.display = 'none';
  result.style.display = 'none';

  try {
    const response = await fetch('/v1/rerank', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeyData.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        query: query,
        documents: documents
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to perform reranking');
    }

    const data = await response.json();

    if (!data.results || !Array.isArray(data.results)) {
      throw new Error('Invalid response format');
    }

    // Display results
    const resultList = document.getElementById('reranking-result-list');
    resultList.innerHTML = data.results.map((item, idx) => `
      <div style="margin-bottom: 12px; padding: 12px; background: white; border-radius: 6px; border-left: 4px solid #667eea;">
        <div style="font-weight: 600; margin-bottom: 4px;">
          #${idx + 1} - Score: ${item.relevance_score.toFixed(4)}
        </div>
        <div style="color: #666;">
          ${escapeHtml(item.document || documents[item.index])}
        </div>
      </div>
    `).join('');

    result.style.display = 'block';
    status.className = 'status success';
    status.textContent = `✓ Reranked ${data.results.length} documents successfully!`;
  } catch (error) {
    status.className = 'status error';
    status.textContent = `✗ Error: ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Rerank Documents';
  }
}