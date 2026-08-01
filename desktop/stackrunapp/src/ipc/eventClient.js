const net = require('net');
const fs = require('fs');
const { EventEmitter } = require('events');

class EventClient extends EventEmitter {
  constructor(socketPath) {
    super();
    this.socketPaths = socketPath 
      ? [socketPath]
      : [
          '/run/stackrun/events.sock'
        ];
    this.currentPathIndex = 0;
    this.socketPath = this.socketPaths[0];
    
    this.socket = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.subscriptions = new Map();
    this._readBuffer = '';
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.connected && this.socket) {
        resolve();
        return;
      }

      this.socket = net.createConnection(this.socketPath);

      this.socket.on('connect', () => {
        this.connected = true;
        console.log('[EventClient] Connected to event server');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.emit('reconnect');
        resolve();
      });

      this.socket.on('data', (data) => {
        this.handleData(data);
      });

      this.socket.on('error', (err) => {
        console.error('[EventClient] Socket error:', err.message);
        if (!this.connected) {
          reject(err);
        }
        this.handleDisconnect();
      });

      this.socket.on('close', () => {
        this.handleDisconnect();
      });

      this.socket.on('end', () => {
        this.handleDisconnect();
      });

      setTimeout(() => {
        if (!this.connected) {
          this.socket.destroy();
          reject(new Error('Connection timeout'));
        }
      }, 5000);
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
        console.warn('[EventClient] JSON.parse failed, trying fallback regex extraction:', e.message);
        console.warn('[EventClient] Raw message preview:', preview);
        parsed = this._fallbackParseBrokenJson(msg);
        if (!parsed) {
          continue;
        }
      }
        
      if (parsed.type === 'event') {
        const eventName = parsed.method || parsed.event;
        const eventData = parsed.data;
        
        this.emit(eventName, eventData);
        
        const callbacks = this.subscriptions.get(eventName);
        if (callbacks) {
          callbacks.forEach(cb => cb(eventData));
        }
        
        if (parsed.channel) {
          this.emit(parsed.channel, eventData);
          const channelCallbacks = this.subscriptions.get(parsed.channel);
          if (channelCallbacks) {
            channelCallbacks.forEach(cb => cb(eventData));
          }
        }
      } else if (parsed.type === 'stream') {
        this.emit('stream', parsed);
        if (parsed.channel) {
          this.emit(parsed.channel, parsed.data);
        }
      } else if (parsed.event) {
        this.emit(parsed.event, parsed.data);
        
        const callbacks = this.subscriptions.get(parsed.event);
        if (callbacks) {
          callbacks.forEach(cb => cb(parsed.data));
        }
      }
    }
    if (this._readBuffer.length > 65536) {
      console.warn('[EventClient] readBuffer overflow (>64KB, no newline), dropping stale fragment:',
                   this._readBuffer.length);
      this._readBuffer = '';
    }
  }

  _fallbackParseBrokenJson(rawMsg) {
    if (!rawMsg || typeof rawMsg !== 'string') return null;
    try {
      const typeMatch = rawMsg.match(/"type"\s*:\s*"([^"]+)"/);
      const type = typeMatch ? typeMatch[1] : null;
      const methodMatch = rawMsg.match(/"method"\s*:\s*"([^"]+)"/);
      const method = methodMatch ? methodMatch[1] : null;
      const channelMatch = rawMsg.match(/"channel"\s*:\s*"([^"]+)"/);
      const channel = channelMatch ? channelMatch[1] : null;

      const resultJsonMatch = rawMsg.match(/"result"\s*:\s*(\{[\s\S]*?\})\s*\}\s*,\s*"ts"\s*:/);
      const dataFieldMatch = rawMsg.match(/"data"\s*:\s*(\{[\s\S]*?)\s*\}\s*,\s*"ts"\s*:/);

      let data = null;
      if (resultJsonMatch) {
        try {
          data = { ...JSON.parse(resultJsonMatch[1] + '}') };
        } catch (_) {}
      }
      if (!data && dataFieldMatch) {
        try {
          data = JSON.parse(dataFieldMatch[1] + '}');
        } catch (_) {}
      }

      if (!data) {
        const hasAppExists = /"appExists"\s*:\s*true/.test(rawMsg);
        const taskIdMatch = rawMsg.match(/"task_id"\s*:\s*"([^"]+)"/);
        if (hasAppExists && taskIdMatch) {
          const guidMatch = rawMsg.match(/"guid"\s*:\s*"([^"]+)"/);
          const nameMatch = rawMsg.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"(?=[^}]*"id"\s*:)/);
          const idMatch = rawMsg.match(/"existingApp"\s*:\s*\{[^}]*"id"\s*:\s*(\d+)/);
          const msgMatch = rawMsg.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          const containerMatch = rawMsg.match(/"container_id"\s*:\s*"([^"]+)"/);
          const errorMsgMatch = rawMsg.match(/"error_message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          const resolvedMsg = msgMatch ? msgMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : '应用已经安装，请确认是否重复添加';
          data = {
            task_id: taskIdMatch[1],
            status: 'failed',
            progress: 100,
            stage: 'failed',
            message_key: '',
            message: errorMsgMatch ? errorMsgMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : resolvedMsg,
            container_id: containerMatch ? containerMatch[1] : '',
            error_message: errorMsgMatch ? errorMsgMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : resolvedMsg,
            error_code: -1,
            result: {
              success: false,
              appExists: true,
              message: resolvedMsg,
              existingApp: {
                guid: guidMatch ? guidMatch[1] : '',
                name: nameMatch ? nameMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : '',
                id: idMatch ? parseInt(idMatch[1], 10) : 0
              }
            }
          };
        }
      }

      if (!data) return null;

      const typeActual = type || (data && (data.status === 'failed' || data.appExists) ? 'event' : null);
      const methodActual = method || (data && data.status === 'failed' ? 'task.failed' : null);
      const eventActual = methodActual || '';

      return {
        type: typeActual || 'event',
        method: methodActual,
        event: eventActual,
        channel: channel || (eventActual ? 'event:' + eventActual : ''),
        data: data
      };
    } catch (e) {
      console.error('[EventClient] _fallbackParseBrokenJson error:', e);
      return null;
    }
  }

  handleDisconnect() {
    if (this.connected) {
      this.connected = false;
      this.emit('disconnect');
    }
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, 3000);
  }

  subscribe(eventType, callback) {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }
    this.subscriptions.get(eventType).push(callback);
    console.log(`[EventClient] Subscribed to event: ${eventType}`);
  }

  unsubscribe(eventType, callback) {
    const callbacks = this.subscriptions.get(eventType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
        console.log(`[EventClient] Unsubscribed from event: ${eventType}`);
      }
    }
  }

  unsubscribeAll(eventType) {
    if (eventType) {
      this.subscriptions.delete(eventType);
    } else {
      this.subscriptions.clear();
    }
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
}

module.exports = { EventClient };