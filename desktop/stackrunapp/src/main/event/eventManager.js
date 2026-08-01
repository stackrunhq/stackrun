const logger = require('../../sdk/logger');

class EventManager {
  constructor() {
    this._eventClient = null;
    this._windowManager = null;
    this._subscriptions = {};
  }

  setDependencies(eventClient, windowManager) {
    this._eventClient = eventClient;
    this._windowManager = windowManager;
  }

  init() {
    if (!this._eventClient) {
      logger.warn('[EventManager] Event client not set');
      return;
    }

    this._subscribeToEvents();
  }

  _subscribeToEvents() {
    const events = [
      'task.progress',
      'task.completed',
      'task.failed',
      'container.created',
      'container.moved_to_trash',
      'container.restored',
      'container.purged',
      'server.upgrade_prepare',
      'server.shutdown.phase'
    ];

    events.forEach(eventName => {
      this._eventClient.subscribe(eventName, (data) => {
        this._handleEvent(eventName, data);
      });
    });

    this._eventClient.on('disconnect', () => {
      logger.warn('[EventManager] Event server disconnected, will reconnect...');
      this._windowManager.sendToMain('event:disconnected');
      
      this._eventClient.once('reconnect', () => {
        logger.info('[EventManager] Event server reconnected, resubscribing...');
        this._subscribeToEvents();
        this._windowManager.sendToMain('event:reconnected');
      });
    });
  }

  _handleEvent(eventName, data) {
    logger.debug(`[EventManager] Received ${eventName}:`, data);
    
    if (eventName === 'server.upgrade_prepare') {
      logger.info('[EventManager] Server upgrade prepare event received, forwarding quit-app to renderer');
      this._windowManager.sendToMain('dserver:quit-app', data);
      this._windowManager.sendToSplash('dserver:quit-app', data);
      this._windowManager.sendToWizard('dserver:quit-app', data);
      return;
    }
    
    const unifiedEvent = this._unifyEvent(eventName, data);
    
    this._windowManager.sendToMain(`event:${eventName}`, unifiedEvent);
    this._windowManager.sendToSplash(`event:${eventName}`, unifiedEvent);
    this._windowManager.sendToWizard(`event:${eventName}`, unifiedEvent);
    
    if (this._subscriptions[eventName]) {
      this._subscriptions[eventName].forEach(callback => {
        try {
          callback(unifiedEvent);
        } catch (error) {
          logger.error(`[EventManager] Error in ${eventName} callback:`, error);
        }
      });
    }
  }

  _unifyEvent(eventName, data) {
    let type = eventName;
    let state = 'UNKNOWN';
    
    if (eventName === 'task.progress') {
      type = 'TASK';
      state = 'RUNNING';
    } else if (eventName === 'task.completed') {
      type = 'TASK';
      state = 'SUCCESS';
    } else if (eventName === 'task.failed') {
      type = 'TASK';
      state = 'FAILED';
    } else if (eventName.startsWith('container.')) {
      type = 'CONTAINER';
      if (eventName === 'container.created') state = 'CREATED';
      else if (eventName === 'container.moved_to_trash') state = 'MOVED_TO_TRASH';
      else if (eventName === 'container.restored') state = 'RESTORED';
      else if (eventName === 'container.purged') state = 'PURGED';
    }

    return {
      task_id: data.task_id || data.taskId || null,
      taskId: data.task_id || data.taskId || null,
      type: data.type || type,
      state,
      progress: data.progress || data.task_progress || null,
      message: data.message || data.task_message || '',
      message_key: data.message_key || data.task_message_key || '',
      stage: data.stage || '',
      result: data.result || null,
      error_message: data.error_message || '',
      payload: data
    };
  }

  subscribe(eventName, callback) {
    if (!this._subscriptions[eventName]) {
      this._subscriptions[eventName] = [];
    }
    this._subscriptions[eventName].push(callback);
    
    return () => {
      const index = this._subscriptions[eventName].indexOf(callback);
      if (index !== -1) {
        this._subscriptions[eventName].splice(index, 1);
      }
    };
  }

  unsubscribe(eventName, callback) {
    if (this._subscriptions[eventName]) {
      const index = this._subscriptions[eventName].indexOf(callback);
      if (index !== -1) {
        this._subscriptions[eventName].splice(index, 1);
      }
    }
  }

  unsubscribeAll(eventName) {
    if (eventName) {
      this._subscriptions[eventName] = [];
    } else {
      this._subscriptions = {};
    }
  }

  disconnect() {
    if (this._eventClient) {
      this._eventClient.disconnect();
    }
    this.unsubscribeAll();
  }
}

module.exports = { EventManager };
