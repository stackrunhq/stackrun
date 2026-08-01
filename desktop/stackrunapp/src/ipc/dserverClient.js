const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const TokenManager = require('./TokenManager');
const ipcConfig = require('./ipcConfig');

class DServerClient extends EventEmitter {
  constructor(socketPath) {
    super();
    this.socketPaths = socketPath 
        ? [socketPath]
        : ipcConfig.socketPaths;
    this.currentPathIndex = 0;
    this.socketPath = this.socketPaths[0];
    
    this.socket = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.connected = false;
    this.reconnectTimer = null;
    this.statusCheckTimer = null;
    this.tokenManager = new TokenManager();
    this.token = null;
    this.serverStatus = 'unknown';
    this._readBuffer = '';
    
    this.serverInfo = null;
  }
  
  async waitForReady() {
    return new Promise((resolve, reject) => {
      const maxAttempts = ipcConfig.maxReconnectAttempts;
      let attempts = 0;
      
      const checkReady = () => {
        attempts++;
        
        try {
          const content = fs.readFileSync(ipcConfig.readyFile, 'utf8');
          const info = JSON.parse(content);
          
          if (info.protocol !== ipcConfig.protocolVersion) {
            console.warn(`[DServerClient] Protocol version mismatch: server=${info.protocol}, client=${ipcConfig.protocolVersion}`);
          }
          
          this.serverInfo = info;
          console.log(`[DServerClient] Server ready: version=${info.version}, protocol=${info.protocol}, pid=${info.pid}`);
          resolve(info);
        } catch (err) {
          if (attempts >= maxAttempts) {
            reject(new Error(`Server not ready after ${maxAttempts} attempts`));
          } else {
            setTimeout(checkReady, ipcConfig.reconnectDelay);
          }
        }
      };
      
      checkReady();
    });
  }
  
  async hello() {
    try {
      const result = await this.call('server_hello', {});
      if (result) {
        this.serverInfo = {
          protocol: result.protocol,
          version: result.version,
          build: result.build,
          user: result.user
        };
        
        if (result.capabilities) {
          this.capabilities = result.capabilities;
          console.log(`[DServerClient] Server capabilities: ${result.capabilities.join(', ')}`);
        }
        
        if (result.environment) {
          this.environment = result.environment;
          console.log(`[DServerClient] Environment status: ${result.environment.status}, i386=${result.environment.i386}`);
          
          if (result.environment.status !== 1) {
            console.warn(`[DServerClient] Environment not ready, status=${result.environment.status}`);
          }
        }
        
        if (result.protocol !== ipcConfig.protocolVersion) {
          console.warn(`[DServerClient] Protocol version mismatch: server=${result.protocol}, client=${ipcConfig.protocolVersion}`);
        }
        
        console.log(`[DServerClient] Hello successful: version=${result.version}, protocol=${result.protocol}`);
        return result;
      }
    } catch (error) {
      console.warn(`[DServerClient] Hello handshake failed: ${error.message}`);
    }
    return null;
  }
  
  isEnvironmentReady() {
    return this.environment && this.environment.status === 1;
  }
  
  async prepareEnvironment() {
    try {
      const result = await this.call('environment_prepare', {});
      console.log('[DServerClient] Environment prepare result:', result);
      return result;
    } catch (error) {
      console.error(`[DServerClient] Environment prepare failed: ${error.message}`);
      throw error;
    }
  }
  
  hasCapability(capability) {
    return this.capabilities && this.capabilities.includes(capability);
  }

  async init() {
    await this.tokenManager.init();
    this.token = this.tokenManager.getToken();
    process.env['STACKRUN_DSERVER_TOKEN'] = this.token;
    console.log('[DServerClient] Token initialized for communication');
    
    this._startStatusMonitor();
  }

  async handshake() {
    try {
      const result = await this.call('handshake', {});
      if (result && result.token) {
        this.token = result.token;
        process.env['STACKRUN_DSERVER_TOKEN'] = this.token;
        console.log(`[DServerClient] Handshake successful, token: ${this.token.substring(0, 8)}...`);
        return result;
      }
    } catch (error) {
      console.warn(`[DServerClient] Handshake failed: ${error.message}`);
    }
    return null;
  }

  async checkServerStatus() {
    try {
      if (!this.connected) {
        try {
          await this.connect();
        } catch (connectError) {
          this.serverStatus = 'offline';
          return { online: false, status: 'offline', error: connectError.message };
        }
      }

      const result = await this.call('ping', {});
      if (result && result.pong === true) {
        this.serverStatus = 'online';
        return { online: true, status: 'online' };
      }

      this.serverStatus = 'offline';
      this.connected = false;
      return { online: false, status: 'offline' };
    } catch (error) {
      this.serverStatus = 'offline';
      this.connected = false;
      return { online: false, status: 'offline', error: error.message };
    }
  }

  _startStatusMonitor() {
    this.statusCheckTimer = setInterval(async () => {
      console.log('[DServerClient] Status monitor check started, connected:', this.connected, 'serverStatus:', this.serverStatus);
      const status = await this.checkServerStatus();
      if (status.error) {
        console.log('[DServerClient] Status monitor check completed, online:', status.online, 'error:', status.error);
      } else {
        console.log('[DServerClient] Status monitor check completed, online:', status.online);
      }
      
      if (!status.online && this.serverStatus === 'online') {
        this.emit('serverOffline');
        console.log('[DServerClient] Server went offline');
      } else if (status.online && (this.serverStatus === 'offline' || this.serverStatus === 'unknown')) {
        this.emit('serverOnline', status);
        console.log('[DServerClient] Server came online (from', this.serverStatus + ')');
      }
    }, 30000);
  }

  _stopStatusMonitor() {
    if (this.statusCheckTimer) {
      clearInterval(this.statusCheckTimer);
      this.statusCheckTimer = null;
    }
  }

  // 取消任务
  async cancelTask(taskId) {
    try {
      const result = await this.call('task.cancel', { task_id: taskId });
      console.log(`[DServerClient] Task cancelled: ${taskId}`);
      return result;
    } catch (error) {
      console.error(`[DServerClient] Failed to cancel task: ${error.message}`);
      throw error;
    }
  }

  // 获取所有活动任务
  async getActiveTasks() {
    try {
      const result = await this.call('task.list', {});
      return result;
    } catch (error) {
      console.error(`[DServerClient] Failed to get tasks: ${error.message}`);
      return [];
    }
  }

  // 获取单个任务状态
  async getTaskStatus(taskId) {
    try {
      const result = await this.call('task.get', { task_id: taskId });
      return result;
    } catch (error) {
      console.error(`[DServerClient] Failed to get task status: ${error.message}`);
      return null;
    }
  }

  async connect() {
    if (this.connected && this.socket) {
      return;
    }

    for (let i = 0; i < this.socketPaths.length; i++) {
      this.socketPath = this.socketPaths[i];
      this.currentPathIndex = i;
      
      try {
        await this._connectToPath(this.socketPath);
        return;
      } catch (err) {
        console.debug(`[DServerClient] Failed to connect to ${this.socketPath}: ${err.message}`);
      }
    }
    
    throw new Error('Failed to connect to dserver on any socket path');
  }

  _connectToPath(socketPath) {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(socketPath);
      const connectionTimer = setTimeout(() => {
        if (!this.connected) {
          if (this.socket) {
            this.socket.destroy();
          }
          reject(new Error(`Connection timeout to ${socketPath}`));
        }
      }, 5000);

      this.socket.on('connect', () => {
        clearTimeout(connectionTimer);
        this.connected = true;
        console.log('[DServerClient] Connected to dserver at:', socketPath);
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        resolve();
      });

      this.socket.on('data', (data) => {
        this.handleData(data);
      });

      this.socket.on('error', (err) => {
        clearTimeout(connectionTimer);
        console.error('[DServerClient] Socket error:', err.message);
        if (!this.connected) {
          reject(err);
        }
        this.handleDisconnect();
      });

      this.socket.on('close', () => {
        clearTimeout(connectionTimer);
        this.handleDisconnect();
      });

      this.socket.on('end', () => {
        clearTimeout(connectionTimer);
        this.handleDisconnect();
      });
    });
  }

  handleData(data) {
    this._readBuffer += data.toString();
    let idx;
    while ((idx = this._readBuffer.indexOf('\n')) !== -1) {
      const rawLine = this._readBuffer.slice(0, idx);
      this._readBuffer = this._readBuffer.slice(idx + 1);
      const msg = rawLine.trim();
      if (!msg) continue;
      
      let parsed;
      try {
        parsed = JSON.parse(msg);
      } catch (e) {
        const preview = msg.length > 300
          ? msg.slice(0, 150) + ` ... [len=${msg.length}] ... ` + msg.slice(-150)
          : `[len=${msg.length}] ${msg}`;
        console.error('[DServerClient] Failed to parse message:', e);
        console.error('[DServerClient] Raw message preview:', preview);
        continue;
      }
        
      if (parsed.type === 'rpc.response') {
        const pending = this.pendingRequests.get(parsed.id);
        if (pending) {
          this.pendingRequests.delete(parsed.id);
          if (parsed.data && parsed.data.error) {
            pending.reject(new Error(`RPC error: ${parsed.data.error.code} - ${parsed.data.error.message}`));
          } else if (parsed.data && parsed.data.result) {
            pending.resolve(parsed.data.result);
          } else {
            pending.resolve(parsed.data);
          }
        }
      } else if (parsed.type === 'rpc.request') {
        console.warn('[DServerClient] Received rpc.request from server (unexpected):', parsed);
      } else if (parsed.type === 'event') {
        this.emit(parsed.method || 'event', parsed);
      } else if (parsed.type === 'stream') {
        this.emit('stream', parsed);
      } else if (parsed.type === 'progress' || parsed.type === 'log') {
        this.emit(parsed.type, parsed);
      } else if (parsed.method === 'task.output') {
        this.emit('taskOutput', parsed.params);
      } else if (parsed.id) {
        const pending = this.pendingRequests.get(parsed.id);
        if (pending) {
          this.pendingRequests.delete(parsed.id);
          if (parsed.error) {
            pending.reject(new Error(`RPC error: ${parsed.error.code} - ${parsed.error.message}`));
          } else {
            pending.resolve(parsed.result);
          }
        }
      }
    }
    if (this._readBuffer.length > 65536) {
      console.warn('[DServerClient] readBuffer overflow (>64KB, no newline), dropping stale fragment:',
                   this._readBuffer.length);
      this._readBuffer = '';
    }
  }

  handleDisconnect() {
    console.log('[DServerClient] handleDisconnect called, connected:', this.connected);
    if (this.connected) {
      this.connected = false;
      this.emit('disconnect');
      console.log('[DServerClient] Emitted disconnect event');
    }
    this.socket = null;
    this.pendingRequests.forEach((pending) => {
      pending.reject(new Error('Connection lost'));
    });
    this.pendingRequests.clear();
    console.log('[DServerClient] Scheduling reconnect');
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, 3000);
  }

  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.socket) {
        reject(new Error('Not connected to dserver'));
        return;
      }

      const id = `req_${++this.requestId}_${Date.now()}`;
      const channel = `rpc:${method}`;
      const request = {
        type: 'rpc.request',
        channel: channel,
        id: id,
        method: method,
        data: {
          jsonrpc: '2.0',
          method: method,
          params: params,
          token: this.token
        },
        ts: Date.now()
      };

      this.pendingRequests.set(id, { resolve, reject });

      this.socket.write(JSON.stringify(request) + '\n', (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          reject(err);
        }
      });

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 120000);
    });
  }

  isConnected() {
    return this.connected;
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
    this.connected = false;
  }

  async cleanup() {
    this._stopStatusMonitor();
    this.disconnect();
    await this.tokenManager.cleanup();
  }

  getToken() {
    return this.token;
  }

  getServerStatus() {
    return this.serverStatus;
  }

  onProgress(callback) {
    this.on('progress', callback);
  }

  onLog(callback) {
    this.on('log', callback);
  }

  onDisconnect(callback) {
    this.on('disconnect', callback);
  }

  onServerOnline(callback) {
    this.on('serverOnline', callback);
  }

  onServerOffline(callback) {
    this.on('serverOffline', callback);
  }

  onTaskOutput(callback) {
    this.on('taskOutput', callback);
  }
}

module.exports = { DServerClient, TokenManager };