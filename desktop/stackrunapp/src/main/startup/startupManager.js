const logger = require('../../sdk/logger');

function normalizeFilePath(filePath) {
  if (!filePath) return filePath;
  
  if (filePath.startsWith('file://')) {
    filePath = filePath.substring(7);
  }
  
  if (filePath.startsWith('/data/')) {
    filePath = filePath.substring(6);
  }
  
  return filePath;
}

class StartupRequest {
  constructor(type, params = {}) {
    this.type = type;
    this.source = params.source || 'command-line';
    this.path = params.path || null;
    this.workspaceId = params.workspaceId || null;
    this.appId = params.appId || null;
    this.appUuid = params.appUuid || null;
    this.filePath = params.filePath || params.path || null;
    this.timestamp = Date.now();
  }

  static fromCommandLine(args) {
    const parsedArgs = args.slice(1);
    let type = 'NORMAL';
    const params = { source: 'command-line' };

    for (let i = 0; i < parsedArgs.length; i++) {
      let arg = parsedArgs[i];
      let value = parsedArgs[i + 1];

      if ((arg === '--open' || arg === '-o') && value) {
        type = 'OPEN_FILE';
        const filePath = normalizeFilePath(value);
        params.filePath = filePath;
        params.path = filePath;
        break;
      } else if ((arg === '--launch' || arg === '-l') && value) {
        type = 'RUN_APP';
        params.appUuid = value;
        params.appId = value;
        break;
      } else if (arg.startsWith('/') || arg.startsWith('./') || arg.startsWith('../')) {
        type = 'OPEN_FILE';
        const filePath = normalizeFilePath(arg);
        params.filePath = filePath;
        params.path = filePath;
        break;
      } else if (arg.endsWith('.exe') || arg.endsWith('.msi') || arg.endsWith('.srtar')) {
        type = 'OPEN_FILE';
        const filePath = normalizeFilePath(arg);
        params.filePath = filePath;
        params.path = filePath;
        break;
      }
    }

    return new StartupRequest(type, params);
  }

  toJSON() {
    return {
      type: this.type,
      source: this.source,
      path: this.path,
      workspaceId: this.workspaceId,
      appId: this.appId,
      appUuid: this.appUuid,
      filePath: this.filePath,
      timestamp: this.timestamp
    };
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }
}

class StartupManager {
  constructor() {
    this.handlers = {};
    this.currentRequest = null;
    this._dserverClient = null;
    this._windowManager = null;
    this._eventClient = null;
  }

  registerHandler(type, handler) {
    this.handlers[type] = handler;
    logger.info(`[StartupManager] Registered handler for type: ${type}`);
  }

  setDependencies(dserverClient, windowManager, eventClient) {
    this._dserverClient = dserverClient;
    this._windowManager = windowManager;
    this._eventClient = eventClient;
  }

  parseCommandLine(args) {
    console.log('[DIAGNOSTIC] StartupManager.parseCommandLine called with args:', args);
    this.currentRequest = StartupRequest.fromCommandLine(args);
    console.log('[DIAGNOSTIC] Parsed startup request type:', this.currentRequest.type);
    console.log('[DIAGNOSTIC] Parsed startup request params:', JSON.stringify(this.currentRequest.toJSON()));
    logger.info(`[StartupManager] Parsed startup request: ${this.currentRequest.type}`);
    return this.currentRequest;
  }

  async ensureDefaultWorkspace() {
    if (!this._dserverClient) {
      logger.error('[StartupManager] DServer not connected');
      throw new Error('DServer not connected');
    }

    try {
      const result = await this._dserverClient.call('container.list', {});
      let containers = [];
      if (result) {
        if (Array.isArray(result)) {
          containers = result;
        } else if (result.result && Array.isArray(result.result)) {
          containers = result.result;
        } else if (result.data && Array.isArray(result.data)) {
          containers = result.data;
        } else if (result.containers && Array.isArray(result.containers)) {
          containers = result.containers;
        }
      }
      const defaultContainer = containers.find(c => c.is_default === 1);

      if (defaultContainer) {
        logger.info('[StartupManager] Default workspace already exists');
        return defaultContainer;
      }

      logger.info('[StartupManager] Creating default workspace...');
      this._windowManager.sendToMain('startup:status', { message: '创建默认工作区...' });
      
      const createResult = await this._dserverClient.call('container.create', {
        name: '默认工作区',
        description: '系统提供默认工作区',
        type: 4,
        os_type: 4,
        is_default: 1
      });

      logger.info('[StartupManager] Default workspace created');
      return createResult;
    } catch (error) {
      logger.error('[StartupManager] Failed to ensure default workspace:', error);
      throw error;
    }
  }

  async checkAppInstalled(exePath) {
    if (!this._dserverClient) {
      return null;
    }

    try {
      const result = await this._dserverClient.call('container.list', {});
      let containers = [];
      if (result) {
        if (Array.isArray(result)) {
          containers = result;
        } else if (result.result && Array.isArray(result.result)) {
          containers = result.result;
        } else if (result.data && Array.isArray(result.data)) {
          containers = result.data;
        } else if (result.containers && Array.isArray(result.containers)) {
          containers = result.containers;
        }
      }

      for (const container of containers) {
        const appsResult = await this._dserverClient.call('app.list', { container_id: container.id });
        let apps = [];
        if (appsResult) {
          if (Array.isArray(appsResult)) {
            apps = appsResult;
          } else if (appsResult.result && Array.isArray(appsResult.result)) {
            apps = appsResult.result;
          } else if (appsResult.data && Array.isArray(appsResult.data)) {
            apps = appsResult.data;
          } else if (appsResult.apps && Array.isArray(appsResult.apps)) {
            apps = appsResult.apps;
          }
        }
        
        for (const app of apps) {
          if (app.path && app.path.includes(exePath)) {
            return { app, container };
          }
        }
      }
      return null;
    } catch (error) {
      logger.error('[StartupManager] Failed to check app installed:', error);
      return null;
    }
  }

  async handleRequest(request = this.currentRequest) {
    console.log('[DIAGNOSTIC] StartupManager.handleRequest called');
    console.log('[DIAGNOSTIC] Current request:', request ? JSON.stringify(request.toJSON()) : 'null');
    
    if (!request) {
      logger.warn('[StartupManager] No startup request to handle');
      return;
    }

    const handler = this.handlers[request.type];
    console.log('[DIAGNOSTIC] Handler for type', request.type, ':', handler ? 'found' : 'not found');
    
    if (!handler) {
      logger.warn(`[StartupManager] No handler found for type: ${request.type}, using NORMAL`);
      request.type = 'NORMAL';
      this.currentRequest = request;
      return this.handlers['NORMAL']?.execute(request);
    }

    try {
      console.log('[DIAGNOSTIC] Executing handler for type:', request.type);
      logger.info(`[StartupManager] Handling ${request.type} with params:`, request.toJSON());
      
      const needsWorkspace = ['OPEN_FILE'].includes(request.type);
      
      if (needsWorkspace) {
        await this.ensureDefaultWorkspace();
        this._windowManager.hideMainWindow();
      }
      
      return await handler.execute(request, {
        dserverClient: this._dserverClient,
        windowManager: this._windowManager,
        eventClient: this._eventClient,
        startupManager: this
      });
    } catch (error) {
      logger.error(`[StartupManager] Failed to handle ${request.type}:`, error);
      throw error;
    }
  }

  async handleSecondInstance(request) {
    logger.info(`[StartupManager] Handling second instance: ${request.type}`);
    this.currentRequest = request;
    await this.handleRequest(request);
  }

  getCurrentRequest() {
    return this.currentRequest;
  }
}

module.exports = { StartupManager, StartupRequest };
