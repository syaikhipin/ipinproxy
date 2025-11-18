const fs = require('fs');
const path = require('path');

// Simple JSON database without dependencies
class Database {
  constructor(filepath) {
    // Use /tmp on read-only filesystems (like Render free tier)
    this.originalPath = filepath;
    this.filepath = this.getWritablePath(filepath);
    this.data = { providers: [], models: [], apiKeys: [], users: [] };
    this.load();
  }

  // Find a writable location for the database
  getWritablePath(filepath) {
    const baseName = path.basename(filepath);
    const candidates = [filepath];
    const fallbackDirs = this.getFallbackDirectories();

    fallbackDirs.forEach(dir => {
      const target = path.join(dir, baseName);
      if (!candidates.includes(target)) {
        candidates.push(target);
      }
    });

    for (const candidate of candidates) {
      try {
        const dir = path.dirname(candidate);
        fs.mkdirSync(dir, { recursive: true });
        const testPath = candidate + '.test';
        fs.writeFileSync(testPath, 'test', 'utf8');
        fs.unlinkSync(testPath);

        if (candidate === filepath) {
          console.log(`✅ Using database path: ${candidate}`);
        } else {
          console.log(`⚠️  Original path not writable, using fallback: ${candidate}`);
          if (candidate.startsWith('/tmp')) {
            console.log('💡 Note: Data will reset on restart. Configure via Admin UI after each deployment.');
          } else {
            console.log('💡 Set DB_STORAGE_PATHS to control fallback paths. Data persists if the mount is persistent.');
          }
        }
        return candidate;
      } catch (error) {
        console.warn(`⚠️  Unable to use database path ${candidate}: ${error.message}`);
      }
    }

    throw new Error('❌ No writable location found for database file. Check DB_STORAGE_PATHS or permissions.');
  }

  getFallbackDirectories() {
    const envValue = process.env.DB_STORAGE_PATHS || '';
    const fallbackDirs = envValue
      .split(',')
      .map(dir => dir.trim())
      .filter(Boolean);

    if (!fallbackDirs.includes('/tmp')) {
      fallbackDirs.push('/tmp');
    }

    return fallbackDirs;
  }

  load() {
    try {
      // First try to copy from /etc/secrets if it exists (Render Secret Files)
      const secretPath = path.join('/etc/secrets', path.basename(this.originalPath));
      if (fs.existsSync(secretPath) && !fs.existsSync(this.filepath)) {
        console.log(`📋 Copying initial database from ${secretPath}`);
        const secretContent = fs.readFileSync(secretPath, 'utf8');
        fs.writeFileSync(this.filepath, secretContent, 'utf8');
      }

      if (fs.existsSync(this.filepath)) {
        const content = fs.readFileSync(this.filepath, 'utf8');
        this.data = JSON.parse(content);
        console.log('✅ Database loaded successfully');

        // Migrate existing models to add upload flags if missing
        this.migrateModels();
      } else {
        // Initialize empty database - configure via Admin UI
        console.log('⚠️  Database file not found. Creating empty database.');
        console.log('📝 Please configure providers, models, and API keys via Admin UI.');

        this.data = {
          apiKeys: [],
          providers: [],
          models: [],
          users: []
        };
        this.save();
      }
    } catch (error) {
      console.error('Error loading database:', error);
      this.data = { providers: [], models: [], apiKeys: [], users: [] };
    }
  }

  // Migrate existing models to add upload capability flags
  migrateModels() {
    let migrated = false;
    if (this.data.models) {
      this.data.models = this.data.models.map(model => {
        if (model.supportsImageUpload === undefined || model.supportsVideoUpload === undefined) {
          migrated = true;
          return {
            ...model,
            supportsImageUpload: model.supportsImageUpload || false,
            supportsVideoUpload: model.supportsVideoUpload || false
          };
        }
        return model;
      });

      if (migrated) {
        this.save();
        console.log('✅ Migrated models to include upload capability flags');
      }
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filepath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving database:', error);
      throw error;
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
      type: model.type || 'chat', // chat, embedding, transcription, reranking
      enabled: model.enabled !== false,
      supportsImageUpload: model.supportsImageUpload || false,
      supportsVideoUpload: model.supportsVideoUpload || false
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

  // User operations
  getUsers() {
    return this.data.users || [];
  }

  getUser(id) {
    return this.data.users?.find(u => u.id === id);
  }

  findUserByUsername(username) {
    return this.data.users?.find(u => u.username === username);
  }

  findUserByApiKeyId(apiKeyId) {
    return this.data.users?.find(u => u.apiKeyId === apiKeyId);
  }

  addUser(user) {
    if (!this.data.users) this.data.users = [];

    const newUser = {
      id: user.id || `user_${Date.now()}`,
      username: user.username,
      password: user.password, // Store hashed password
      apiKeyId: user.apiKeyId, // Link to API key
      enabled: user.enabled !== false,
      createdAt: Date.now()
    };
    this.data.users.push(newUser);
    this.save();
    return newUser;
  }

  updateUser(id, updates) {
    if (!this.data.users) return null;

    const index = this.data.users.findIndex(u => u.id === id);
    if (index !== -1) {
      this.data.users[index] = { ...this.data.users[index], ...updates };
      this.save();
      return this.data.users[index];
    }
    return null;
  }

  deleteUser(id) {
    if (!this.data.users) return false;

    const index = this.data.users.findIndex(u => u.id === id);
    if (index !== -1) {
      this.data.users.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  getEnabledUsers() {
    return this.data.users?.filter(u => u.enabled) || [];
  }
}

module.exports = Database;
