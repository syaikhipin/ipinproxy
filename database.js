const fs = require('fs');

// Simple JSON database without dependencies
class Database {
  constructor(filepath) {
    this.filepath = filepath;
    this.data = { providers: [], models: [], apiKeys: [] };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filepath)) {
        const content = fs.readFileSync(this.filepath, 'utf8');
        this.data = JSON.parse(content);
      } else {
        // Initialize empty database - configure via Admin UI
        console.log('⚠️  Database file not found. Creating empty database.');
        console.log('📝 Please configure providers, models, and API keys via Admin UI.');

        this.data = {
          apiKeys: [],
          providers: [],
          models: []
        };
        this.save();
      }
    } catch (error) {
      console.error('Error loading database:', error);
      this.data = { providers: [], models: [], apiKeys: [] };
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filepath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving database:', error);
    }
  }

  // Provider operations
  getProviders() {
    return this.data.providers;
  }

  getProvider(id) {
    return this.data.providers.find(p => p.id === id);
  }

  addProvider(provider) {
    const newProvider = {
      id: provider.id || `provider_${Date.now()}`,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      type: provider.type || 'openai',
      enabled: provider.enabled !== false
    };
    this.data.providers.push(newProvider);
    this.save();
    return newProvider;
  }

  updateProvider(id, updates) {
    const index = this.data.providers.findIndex(p => p.id === id);
    if (index !== -1) {
      this.data.providers[index] = { ...this.data.providers[index], ...updates };
      this.save();
      return this.data.providers[index];
    }
    return null;
  }

  deleteProvider(id) {
    const index = this.data.providers.findIndex(p => p.id === id);
    if (index !== -1) {
      this.data.providers.splice(index, 1);
      // Also delete associated models
      this.data.models = this.data.models.filter(m => m.providerId !== id);
      this.save();
      return true;
    }
    return false;
  }

  // Model operations
  getModels() {
    return this.data.models;
  }

  getModel(id) {
    return this.data.models.find(m => m.id === id);
  }

  addModel(model) {
    const newModel = {
      id: model.id,
      name: model.name,
      providerId: model.providerId,
      enabled: model.enabled !== false
    };
    this.data.models.push(newModel);
    this.save();
    return newModel;
  }

  updateModel(id, updates) {
    const index = this.data.models.findIndex(m => m.id === id);
    if (index !== -1) {
      this.data.models[index] = { ...this.data.models[index], ...updates };
      this.save();
      return this.data.models[index];
    }
    return null;
  }

  deleteModel(id) {
    const index = this.data.models.findIndex(m => m.id === id);
    if (index !== -1) {
      this.data.models.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  // Get enabled providers and models for runtime
  getEnabledProviders() {
    return this.data.providers.filter(p => p.enabled);
  }

  getEnabledModels() {
    return this.data.models.filter(m => m.enabled);
  }

  // API Key operations
  getApiKeys() {
    return this.data.apiKeys || [];
  }

  getApiKey(id) {
    return this.data.apiKeys?.find(k => k.id === id);
  }

  findApiKeyByValue(key) {
    return this.data.apiKeys?.find(k => k.key === key && k.enabled);
  }

  addApiKey(apiKey) {
    if (!this.data.apiKeys) this.data.apiKeys = [];

    const newKey = {
      id: apiKey.id || `key_${Date.now()}`,
      key: apiKey.key,
      name: apiKey.name || 'Unnamed Key',
      username: apiKey.username || '',
      allowedModels: apiKey.allowedModels || [], // Array of model IDs, empty = all models
      enabled: apiKey.enabled !== false,
      createdAt: Date.now()
    };
    this.data.apiKeys.push(newKey);
    this.save();
    return newKey;
  }

  updateApiKey(id, updates) {
    if (!this.data.apiKeys) return null;

    const index = this.data.apiKeys.findIndex(k => k.id === id);
    if (index !== -1) {
      this.data.apiKeys[index] = { ...this.data.apiKeys[index], ...updates };
      this.save();
      return this.data.apiKeys[index];
    }
    return null;
  }

  deleteApiKey(id) {
    if (!this.data.apiKeys) return false;

    // Don't allow deleting master key
    if (id === 'master') return false;

    const index = this.data.apiKeys.findIndex(k => k.id === id);
    if (index !== -1) {
      this.data.apiKeys.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  getEnabledApiKeys() {
    return this.data.apiKeys?.filter(k => k.enabled) || [];
  }
}

module.exports = Database;
