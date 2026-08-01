import { t } from './i18n/i18n.js';
import { taskStore } from './taskStore.js';

const TASK_STATES = {
  INIT: 'init',
  QUEUED: 'queued',
  RUNNING: 'running',
  PAUSED: 'paused',
  RECOVERING: 'recovering',
  UI_ACTIVE: 'ui_active',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  CLEANED: 'cleaned'
};

const UI_ZONES = {
  MODAL: 'modal',
  PANEL: 'panel',
  BACKGROUND: 'background'
};

class UIInstance {
  constructor(taskId, uiState) {
    this.taskId = taskId;
    this.type = uiState.view;
    this.uiZone = uiState.uiZone || UI_ZONES.MODAL;
    this.state = uiState;
    this.mountedAt = Date.now();
    this.lastUpdated = Date.now();
    this.destroyed = false;
  }

  update(uiState) {
    if (this.destroyed) return;
    this.state = { ...this.state, ...uiState };
    this.lastUpdated = Date.now();
    console.log('[UIInstance] Updated:', this.taskId, 'state:', this.state);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    console.log('[UIInstance] Destroyed:', this.taskId);
  }
}

class TaskManager {
  constructor() {
    this.recoveredTaskViews = new Set();
    this.recoveryHandlers = this.initRecoveryHandlers();
    this.recoveryQueue = [];
    this.recovering = false;
    this.payloadMigrations = this.initPayloadMigrations();
    
    this.uiInstances = new Map();
    this.activeModal = null;
    
    this._isCreatingDefaultContainer = false;
    
    this.initEventListeners();
    this.setupTaskStoreSync();
  }

  initRecoveryHandlers() {
    return {
      container_create: (task) => ({
        view: 'default_container_modal',
        uiZone: UI_ZONES.MODAL,
        taskId: task.task_id,
        data: {
          progress: task.progress,
          message: task.message_key || task.message
        }
      }),
      container_create_custom: (task) => ({
        view: 'create_container',
        uiZone: UI_ZONES.MODAL,
        taskId: task.task_id,
        data: {
          ...task.payload,
          progress: task.progress,
          status: task.status
        }
      }),
      'container.ensuredefault': (task) => ({
        view: 'default_container_modal',
        uiZone: UI_ZONES.MODAL,
        taskId: task.task_id,
        data: {
          progress: task.progress,
          message: task.message_key || task.message
        }
      }),
      app_install: (task) => ({
        view: 'add_app',
        uiZone: UI_ZONES.MODAL,
        taskId: task.task_id,
        data: {
          ...task.payload,
          container_id: task.container_id,
          progress: task.progress,
          status: task.status
        }
      }),
      container_import: (task) => ({
        view: 'import_container',
        uiZone: UI_ZONES.MODAL,
        taskId: task.task_id,
        data: {
          ...task.payload,
          progress: task.progress,
          status: task.status
        }
      }),
      container_export: (task) => ({
        view: 'export_container',
        uiZone: UI_ZONES.MODAL,
        taskId: task.task_id,
        data: {
          ...task.payload,
          container_id: task.container_id,
          progress: task.progress,
          status: task.status
        }
      }),
      app_uninstall: (task) => ({
        view: 'task_detail',
        uiZone: UI_ZONES.MODAL,
        taskId: task.task_id,
        data: {
          ...task.payload,
          container_id: task.container_id,
          progress: task.progress,
          status: task.status
        }
      }),
      'app.uninstall': (task) => ({
        view: 'task_detail',
        uiZone: UI_ZONES.MODAL,
        taskId: task.task_id,
        data: {
          ...task.payload,
          container_id: task.container_id,
          progress: task.progress,
          status: task.status
        }
      })
    };
  }

  renderUI(uiState) {
    console.log('[TaskManager] Rendering UI state:', uiState);
    
    if (!this.acquireUIZone(uiState)) {
      console.log('[TaskManager] UI Zone occupied, skipping:', uiState.taskId);
      return false;
    }

    let instance = this.uiInstances.get(uiState.taskId);
    
    if (instance) {
      instance.update(uiState);
    } else {
      instance = new UIInstance(uiState.taskId, uiState);
      this.uiInstances.set(uiState.taskId, instance);
      console.log('[TaskManager] Created UIInstance:', uiState.taskId);
    }

    this.updateTaskState(uiState.taskId, TASK_STATES.UI_ACTIVE);
    
    switch (uiState.view) {
      case 'default_container_modal':
        this.showDefaultContainerModal();
        this.updateDefaultContainerProgress(uiState.data.progress, uiState.data.message);
        break;
      case 'create_container':
        this.openContainerCreateView(uiState.taskId);
        break;
      case 'add_app':
        this.openAddAppView(uiState.taskId);
        break;
      case 'import_container':
        this.openImportContainerView(uiState.taskId);
        break;
      case 'export_container':
        this.openExportContainerView(uiState.taskId);
        break;
      default:
        console.warn('[TaskManager] Unknown view type:', uiState.view);
        this.openTaskInView(uiState.taskId);
    }
    
    return true;
  }

  acquireUIZone(uiState) {
    const uiZone = uiState.uiZone || UI_ZONES.MODAL;
    
    if (uiZone === UI_ZONES.MODAL) {
      if (this.activeModal && this.activeModal !== uiState.taskId) {
        console.log('[TaskManager] Modal zone already occupied by:', this.activeModal);
        return false;
      }
      this.activeModal = uiState.taskId;
      return true;
    }
    
    return true;
  }

  releaseUIZone(taskId) {
    const instance = this.uiInstances.get(taskId);
    if (instance && instance.uiZone === UI_ZONES.MODAL && this.activeModal === taskId) {
      this.activeModal = null;
      console.log('[TaskManager] Released modal zone:', taskId);
    }
  }

  destroyUI(taskId) {
    const instance = this.uiInstances.get(taskId);
    if (instance) {
      instance.destroy();
      this.uiInstances.delete(taskId);
      this.releaseUIZone(taskId);
      this.recoveredTaskViews.delete(taskId);
      console.log('[TaskManager] Destroyed UI for task:', taskId);
    }
  }

  updateTaskState(taskId, state) {
    const task = taskStore.getState(taskId);
    if (task) {
      taskStore.setState(taskId, { ...task, status: state });
    }
  }

  initEventListeners() {
    if (!window.electronAPI || !window.electronAPI.receive) {
      console.error('[TaskManager] electronAPI.receive not available');
      return;
    }

    window.electronAPI.receive('dserver:initializing', (data) => {
      console.log('[TaskManager] dserver:initializing:', data);
      if (data && data.init_task_id) {
        window.stackrunInitTaskId = data.init_task_id;
        
        const existingTask = taskStore.getState(data.init_task_id);
        if (!existingTask) {
          this.createTask({
            id: data.init_task_id,
            type: 'container_create',
            status: 'running',
            progress: data.task_progress || 5,
            message_key: data.task_message_key || 'defaultContainer.creating',
            message: data.task_message || t('defaultContainer.creating')
          });
        } else {
          this.updateTask(data.init_task_id, {
            progress: data.task_progress || existingTask.progress,
            message_key: data.task_message_key || existingTask.message_key,
            message: data.task_message || existingTask.message
          });
        }
        
        this.showDefaultContainerModal();
        this.updateDefaultContainerProgress(data.task_progress, data.task_message);
        
        let completedUnsubscribe = window.electronAPI.receive('event:task.completed', (completedData) => {
          let taskData = completedData;
          if (Array.isArray(completedData) && completedData.length > 0) {
            taskData = completedData[0];
          }
          if (taskData && taskData.task_id === data.init_task_id) {
            try { completedUnsubscribe(); } catch(e) {}
            this.handleDefaultContainerComplete();
          }
        });
        
        let failedUnsubscribe = window.electronAPI.receive('event:task.failed', (failedData) => {
          let taskData = failedData;
          if (Array.isArray(failedData) && failedData.length > 0) {
            taskData = failedData[0];
          }
          if (taskData && taskData.task_id === data.init_task_id) {
            try { failedUnsubscribe(); } catch(e) {}
            this.handleDefaultContainerFailed(taskData.error_message || t('defaultContainer.unknownError'));
          }
        });
      }
    });

    window.electronAPI.receive('event:task.progress', (data) => {
      console.log('[TaskManager] event:task.progress:', data);
      let taskData = data;
      if (Array.isArray(data) && data.length > 0) {
        taskData = data[0];
      }
      if (!taskData || !taskData.task_id) return;

      const existingTask = taskStore.getState(taskData.task_id);
      if (!existingTask) {
        this.createTask({
          id: String(taskData.task_id),
          type: taskData.type || taskData.task_type || 'unknown',
          status: 'running',
          progress: taskData.progress || 0,
          stage: taskData.stage || taskData.task_stage || '',
          message_key: taskData.message_key || taskData.task_message_key || '',
          message: taskData.message || taskData.task_message || '',
          container_id: taskData.container_id ? String(taskData.container_id) : '',
          app_id: taskData.app_id ? String(taskData.app_id) : ''
        });
      } else {
        const currStatus = existingTask.status;
        const updates = {
          progress: typeof taskData.progress === 'number' ? taskData.progress : (existingTask.progress || 0),
          stage: taskData.stage || taskData.task_stage || existingTask.stage || '',
          message_key: taskData.message_key || taskData.task_message_key || existingTask.message_key || '',
          message: taskData.message || taskData.task_message || existingTask.message || ''
        };
        if (!currStatus || currStatus === 'pending' || currStatus === 'queued') {
          updates.status = 'running';
        } else if (taskData.status && !this.isTerminalStatus(taskData.status) && currStatus !== taskData.status) {
          updates.status = taskData.status;
        }
        if (taskData.container_id && !existingTask.container_id) {
          updates.container_id = String(taskData.container_id);
        }
        if (taskData.app_id && !existingTask.app_id) {
          updates.app_id = String(taskData.app_id);
        }
        this.updateTask(String(taskData.task_id), updates);
      }

      const task = taskStore.getState(taskData.task_id);
      const taskType = (task && task.type) || taskData.type || '';
      const initTaskId = window.stackrunInitTaskId;
      const isDefaultContainerTask = String(taskData.task_id) === String(initTaskId) ||
        taskType === 'container.ensuredefault';
      if ((taskType === 'container_create' && isDefaultContainerTask) || taskType === 'container.ensuredefault') {
        this.showDefaultContainerModal();
        this.updateDefaultContainerProgress(taskData.progress, taskData.message_key || taskData.message);
      } else if ((taskType === 'container_create_custom' ||
                  (taskType === 'container_create' && !isDefaultContainerTask)) &&
                 !this.uiInstances.has(taskData.task_id)) {
        this.openContainerCreateView(taskData.task_id);
      }

      this.notifyListeners('progress', taskData);
    });

    window.electronAPI.receive('event:task.completed', (data) => {
      console.log('[TaskManager] event:task.completed:', data);
      let taskData = data;
      if (Array.isArray(data) && data.length > 0) {
        taskData = data[0];
      }
      if (!taskData || !taskData.task_id) return;

      const existingTask = taskStore.getState(taskData.task_id);
      if (existingTask) {
        this.updateTask(taskData.task_id, {
          status: 'completed',
          progress: 100,
          result: taskData.result,
          type: existingTask.type || taskData.type,
          container_id: taskData.container_id || existingTask.container_id
        });
      } else {
        this.createTask({
          id: taskData.task_id,
          type: taskData.type || 'unknown',
          status: 'completed',
          progress: 100,
          result: taskData.result,
          container_id: taskData.container_id || ''
        });
      }

      taskStore.updateLocksFromTasks();

      const task = taskStore.getState(taskData.task_id);
      const taskType = (task && task.type) || taskData.type || '';
      const initTaskId = window.stackrunInitTaskId;
      const isDefaultContainerTask = String(taskData.task_id) === String(initTaskId) ||
        taskType === 'container.ensuredefault';
      if ((taskType === 'container_create' && isDefaultContainerTask) || taskType === 'container.ensuredefault') {
        this.handleDefaultContainerComplete();
      } else if (taskType === 'container_create_custom' ||
                 (taskType === 'container_create' && !isDefaultContainerTask)) {
        const ui = this.uiInstances.get(taskData.task_id);
        if (ui && typeof ui.onCompleted === 'function') {
          ui.onCompleted(taskData.result);
        } else {
          this.destroyUI(taskData.task_id);
          if (typeof loadContainers === 'function') loadContainers();
          if (typeof renderHome === 'function' && !currentContainerId) renderHome();
        }
      }

      this.notifyListeners('completed', taskData);
      
      this.onTaskTerminal(taskData.task_id);
    });

    window.electronAPI.receive('event:task.failed', (data) => {
      console.log('[TaskManager] event:task.failed:', data);
      let taskData = data;
      if (Array.isArray(data) && data.length > 0) {
        taskData = data[0];
      }
      if (!taskData || !taskData.task_id) return;

      this.updateTask(taskData.task_id, {
        status: 'failed',
        error_message: taskData.error_message || ''
      });

      taskStore.updateLocksFromTasks();

      const task = taskStore.getState(taskData.task_id);
      const taskType = (task && task.type) || taskData.type || '';
      const initTaskId = window.stackrunInitTaskId;
      const isDefaultContainerTask = String(taskData.task_id) === String(initTaskId) ||
        taskType === 'container.ensuredefault';
      if ((taskType === 'container_create' && isDefaultContainerTask) || taskType === 'container.ensuredefault') {
        this.handleDefaultContainerFailed(taskData.error_message);
      } else if (taskType === 'container_create_custom' ||
                 (taskType === 'container_create' && !isDefaultContainerTask)) {
        const ui = this.uiInstances.get(taskData.task_id);
        if (ui && typeof ui.onFailed === 'function') {
          ui.onFailed(taskData.error_message);
        } else {
          showToast(taskData.error_message || '创建工作区失败', 'error');
          this.destroyUI(taskData.task_id);
        }
      }

      this.notifyListeners('failed', taskData);
      
      this.onTaskTerminal(taskData.task_id);
    });

    window.electronAPI.receive('event:task.cancelled', (data) => {
      console.log('[TaskManager] event:task.cancelled:', data);
      let taskData = data;
      if (Array.isArray(data) && data.length > 0) {
        taskData = data[0];
      }
      if (!taskData || !taskData.task_id) return;

      this.updateTask(taskData.task_id, {
        status: 'cancelled'
      });

      taskStore.updateLocksFromTasks();
      this.notifyListeners('cancelled', taskData);
      
      this.onTaskTerminal(taskData.task_id);
    });
  }

  onTaskTerminal(taskId) {
    console.log('[TaskManager] onTaskTerminal:', taskId);
    
    setTimeout(() => {
      this.destroyUI(taskId);
      this.updateTaskState(taskId, TASK_STATES.CLEANED);
    }, 2000);
  }

  isTerminalStatus(status) {
    if (!status) return false;
    const s = String(status).toLowerCase();
    return s === 'completed' || s === 'failed' || s === 'cancelled' ||
           s === 'canceled' || s === 'done' || s === 'error' || s === 'success';
  }

  isRunningStatus(status) {
    return taskStore.isRunningStatus(status);
  }

  setupTaskStoreSync() {
    taskStore.subscribe((taskId, event, data) => {
      if (event === 'update') {
        console.log('[TaskManager] Task updated in store:', taskId, data);
      }
      if (event === 'lock' || event === 'unlock') {
        console.log('[TaskManager] Container lock changed:', data);
        this.notifyListeners('lockChanged', data);
      }
    });
  }

  async recoverTasks() {
    console.log('[TaskManager] Recovering tasks from server...');
    try {
      const taskList = await this.listTasks();
      if (taskList && Array.isArray(taskList)) {
        taskStore.restore(taskList);
        console.log('[TaskManager] Restored', taskList.length, 'tasks from server');

        const runningTasks = taskList.filter(task => 
          task.status === 'running' || task.status === 'initializing' || 
          task.status === 'queued' || task.status === 'retrying'
        );

        if (runningTasks.length > 0) {
          console.log('[TaskManager] Scheduling UI recovery for', runningTasks.length, 'tasks');
          setTimeout(() => {
            this.applyRecoveryPolicy(runningTasks);
          }, 500);
        }
      }
    } catch (err) {
      console.error('[TaskManager] Failed to recover tasks:', err);
    }
  }

  applyRecoveryPolicy(tasks) {
    console.log('[TaskManager] Applying recovery policy to', tasks.length, 'tasks');
    
    const uiTasks = tasks.filter(task => task.recovery_mode === 'ui');
    const stateOnlyTasks = tasks.filter(task => task.recovery_mode === 'state_only');
    
    console.log('[TaskManager] UI tasks:', uiTasks.length, ', State-only tasks:', stateOnlyTasks.length);

    stateOnlyTasks.forEach(task => {
      console.log('[TaskManager] State-only recovery for task:', task.task_id);
    });

    uiTasks.forEach(task => {
      this.enqueueRecovery(task);
    });

    this.processRecoveryQueue();
  }

  enqueueRecovery(task) {
    if (this.recoveredTaskViews.has(task.task_id)) {
      console.log('[TaskManager] Task already recovered, skipping:', task.task_id);
      return;
    }
    this.recoveryQueue.push(task);
    console.log('[TaskManager] Task enqueued for recovery:', task.task_id);
  }

  async processRecoveryQueue() {
    if (this.recovering) {
      console.log('[TaskManager] Recovery already in progress, waiting...');
      return;
    }

    this.recovering = true;
    
    const processNext = async () => {
      if (this.recoveryQueue.length === 0) {
        this.recovering = false;
        console.log('[TaskManager] Recovery queue processing complete');
        return;
      }
      
      const task = this.recoveryQueue.shift();
      
      try {
        await this.recoverTaskUI(task);
      } catch (err) {
        console.error('[TaskManager] Failed to recover task:', task.task_id, err);
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
      await processNext();
    };
    
    await processNext();
  }

  async recoverTaskUI(task) {
    if (this.recoveredTaskViews.has(task.task_id)) {
      console.log('[TaskManager] Task UI already recovered:', task.task_id);
      return;
    }

    this.updateTaskState(task.task_id, TASK_STATES.RECOVERING);
    
    const migratedTask = this.migratePayload(task);
    
    const handler = this.recoveryHandlers[migratedTask.type];
    if (handler) {
      try {
        console.log('[TaskManager] Recovering UI for task:', task.task_id, 'type:', task.type);
        
        const uiState = handler(migratedTask);
        
        if (uiState) {
          const rendered = this.renderUI(uiState);
          if (rendered) {
            this.recoveredTaskViews.add(task.task_id);
          } else {
            console.log('[TaskManager] UI render blocked by zone, re-enqueueing:', task.task_id);
            this.enqueueRecovery(task);
            this.updateTaskState(task.task_id, TASK_STATES.QUEUED);
          }
        }
      } catch (err) {
        console.error('[TaskManager] Failed to recover UI for task:', task.task_id, err);
        this.updateTaskState(task.task_id, TASK_STATES.FAILED);
      }
    } else {
      console.log('[TaskManager] No recovery handler for task type:', task.type);
      this.openTaskInView(task.task_id);
      this.recoveredTaskViews.add(task.task_id);
      this.updateTaskState(task.task_id, TASK_STATES.UI_ACTIVE);
    }
  }

  initPayloadMigrations() {
    return {
      1: (payload) => {
        console.log('[TaskManager] Migrating payload v1 → v2');
        return {
          version: 2,
          ...(typeof payload === 'string' ? {} : payload),
          ...(!payload?.name ? { name: payload?.containerName || '' } : {})
        };
      },
      2: (payload) => {
        console.log('[TaskManager] Migrating payload v2 → v3');
        return {
          version: 3,
          ...payload,
          schema: payload?.schema || 'default'
        };
      }
    };
  }

  migratePayload(task) {
    let currentVersion = task.payload_version || task.payload?.version || 1;
    const latestVersion = Object.keys(this.payloadMigrations).length + 1;
    
    let payload = typeof task.payload === 'string' ? {} : { ...task.payload };
    
    while (currentVersion < latestVersion) {
      const migration = this.payloadMigrations[currentVersion];
      if (migration) {
        payload = migration(payload);
        currentVersion = payload.version || (currentVersion + 1);
      } else {
        currentVersion++;
      }
    }
    
    return {
      ...task,
      payload,
      payload_version: currentVersion
    };
  }

  createTask(options) {
    const uiMode = options.uiMode || taskStore.getUIModeFromType(options.type);
    const latestVersion = Object.keys(this.payloadMigrations).length + 1;
    const task = {
      task_id: options.id,
      type: options.type,
      status: options.status || 'pending',
      progress: options.progress || 0,
      stage: options.stage || '',
      message_key: options.message_key || '',
      message: options.message || '',
      error_message: '',
      result: null,
      uiMode: uiMode,
      created_at: Date.now(),
      payload: {
        version: latestVersion,
        schema: 'default',
        ...(options.payload || {})
      },
      payload_version: latestVersion,
      recovery_mode: options.recovery_mode || 'ui',
      container_id: options.container_id || '',
      app_id: options.app_id || ''
    };
    taskStore.setState(options.id, task);
    this.notifyListeners('created', task);
    return task;
  }

  updateTask(taskId, updates) {
    taskStore.setState(taskId, updates);
    // Emit 'progress'/'completed'/'failed' taskManager events so subscribers
    // (e.g. the header task-button updater) are aware of explicit updates
    // made outside of the global RPC listeners.
    if (updates && typeof updates === 'object') {
      if (updates.status === 'completed') {
        const task = taskStore.getState(taskId);
        this.notifyListeners('completed', task || { task_id: taskId, ...updates });
      } else if (updates.status === 'failed') {
        const task = taskStore.getState(taskId);
        this.notifyListeners('failed', task || { task_id: taskId, ...updates });
      } else if (updates.status === 'cancelled') {
        const task = taskStore.getState(taskId);
        this.notifyListeners('cancelled', task || { task_id: taskId, ...updates });
      } else if (typeof updates.progress === 'number' || updates.stage != null || updates.message != null) {
        const task = taskStore.getState(taskId);
        this.notifyListeners('progress', task || { task_id: taskId, ...updates });
      }
    }
  }

  completeTask(taskId, result) {
    if (!taskId) return;
    this.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      result: result != null ? result : undefined
    });
    this.onTaskTerminal(taskId);
  }

  failTask(taskId, errorMessage) {
    if (!taskId) return;
    this.updateTask(taskId, {
      status: 'failed',
      error_message: errorMessage || ''
    });
    this.onTaskTerminal(taskId);
  }

  cancelTask(taskId) {
    if (!taskId) return;
    this.updateTask(taskId, { status: 'cancelled' });
    this.onTaskTerminal(taskId);
  }

  getTask(taskId) {
    return taskStore.getState(taskId);
  }

  getAllTasks() {
    return taskStore.getAllState();
  }

  getTasksByUIMode(uiMode) {
    return taskStore.getTasksByUIMode(uiMode);
  }

  getRunningTasks() {
    return taskStore.getRunningTasks();
  }

  on(event, callback) {
    if (!this.listeners) {
      this.listeners = new Map();
    }
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) callbacks.splice(index, 1);
    };
  }

  off(event, callback) {
    if (!this.listeners || !this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) callbacks.splice(index, 1);
  }

  notifyListeners(event, data) {
    if (!this.listeners || !this.listeners.has(event)) return;
    this.listeners.get(event).forEach(cb => cb(data));
  }

  showDefaultContainerModal() {
    const modal = document.getElementById('createDefaultContainerModal');
    if (!modal) return;

    const title = document.getElementById('defaultContainerModalTitle');
    const errorEl = document.getElementById('defaultContainerErrorMessage');
    const actionsEl = document.getElementById('defaultContainerActions');
    const loadingEl = document.getElementById('defaultContainerLoading');

    if (title) title.textContent = t('defaultContainer.creating');
    if (errorEl) errorEl.style.display = 'none';
    if (actionsEl) actionsEl.style.display = 'none';
    if (loadingEl) loadingEl.style.display = 'flex';

    modal.classList.add('active');
  }

  updateDefaultContainerProgress(progress, message) {
    const progressPercent = document.getElementById('defaultContainerProgressPercent');
    const progressFill = document.getElementById('defaultContainerProgressBarFill');
    const progressText = document.getElementById('defaultContainerProgressText');

    const p = Math.max(5, Math.min(100, progress || 5));
    if (progressPercent) progressPercent.textContent = `${p}%`;
    if (progressFill) progressFill.style.width = `${p}%`;

    if (progressText) progressText.textContent = t('defaultContainer.creating');
  }

  handleDefaultContainerComplete() {
    this._isCreatingDefaultContainer = false;
    try { delete window.stackrunInitTaskId; } catch(e) {}
    const modal = document.getElementById('createDefaultContainerModal');
    if (modal && modal.classList.contains('active')) {
      modal.classList.remove('active');
    }
    
    if (typeof loadContainers === 'function') {
      loadContainers(true).then(() => {
        if (typeof renderHome === 'function') {
          renderHome();
        }
        if (typeof renderSidebar === 'function') {
          renderSidebar();
        }
      }).catch(err => {
        console.error('[TaskManager] Failed to load containers after default container creation:', err);
        if (typeof renderHome === 'function') {
          renderHome();
        }
      });
    } else if (typeof renderHome === 'function') {
      renderHome();
    }
  }

  handleDefaultContainerFailed(errorMessage) {
    this._isCreatingDefaultContainer = false;
    try { delete window.stackrunInitTaskId; } catch(e) {}
    const modal = document.getElementById('createDefaultContainerModal');
    if (!modal || !modal.classList.contains('active')) return;

    const title = document.getElementById('defaultContainerModalTitle');
    const errorEl = document.getElementById('defaultContainerErrorMessage');
    const actionsEl = document.getElementById('defaultContainerActions');
    const loadingEl = document.getElementById('defaultContainerLoading');

    if (title) title.textContent = t('defaultContainer.createFailed');
    if (errorEl) {
      errorEl.textContent = errorMessage || t('defaultContainer.createFailed');
      errorEl.style.display = 'block';
    }
    if (actionsEl) actionsEl.style.display = 'flex';
    if (loadingEl) loadingEl.style.display = 'none';
  }

  closeDefaultContainerModal() {
    const modal = document.getElementById('createDefaultContainerModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  retryCreateDefaultContainer() {
    this.ensureDefaultContainer();
  }

  ensureDefaultContainer() {
    if (this._isCreatingDefaultContainer) {
      console.log('[TaskManager] ensureDefaultContainer already in progress, skipping');
      return;
    }
    this._isCreatingDefaultContainer = true;
    
    this.showDefaultContainerModal();
    if (window.electronAPI && window.electronAPI.invoke) {
      window.electronAPI.invoke('ensure-default-container').then((result) => {
        this._isCreatingDefaultContainer = false;
        if (!result || !result.success) {
          const errorMsg = (result && result.error) || t('defaultContainer.unknownError');
          this.handleDefaultContainerFailed(errorMsg);
          return;
        }
        
        if (result.alreadyExists || result.initTaskCompleted) {
          this.handleDefaultContainerComplete();
          return;
        }
        
        const taskId = result.result && (result.result.taskId || result.result.task_id);
        if (taskId) {
          window.stackrunInitTaskId = taskId;
          const existingTask = taskStore.getState(taskId);
          if (!existingTask) {
            this.createTask({
              id: taskId,
              type: 'container_create',
              status: 'running',
              progress: 5,
              message_key: 'defaultContainer.creating',
              message: t('defaultContainer.creating')
            });
          }
          this._waitForDefaultContainerTask(taskId);
        } else {
          this.handleDefaultContainerComplete();
        }
      }).catch(err => {
        this._isCreatingDefaultContainer = false;
        this.handleDefaultContainerFailed(err && err.message ? err.message : t('defaultContainer.unknownError'));
      });
    } else {
      this._isCreatingDefaultContainer = false;
    }
  }
  
  _waitForDefaultContainerTask(taskId) {
    let progressUnsubscribe = null;
    let completedUnsubscribe = null;
    let failedUnsubscribe = null;
    let pollTimer = null;
    let done = false;
    
    const cleanup = () => {
      done = true;
      if (progressUnsubscribe) {
        try { progressUnsubscribe(); } catch(e) {}
        progressUnsubscribe = null;
      }
      if (completedUnsubscribe) {
        try { completedUnsubscribe(); } catch(e) {}
        completedUnsubscribe = null;
      }
      if (failedUnsubscribe) {
        try { failedUnsubscribe(); } catch(e) {}
        failedUnsubscribe = null;
      }
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };
    
    const onFailed = (errorMsg) => {
      if (done) return;
      cleanup();
      this.handleDefaultContainerFailed(errorMsg || t('defaultContainer.unknownError'));
    };
    
    const onCompleted = () => {
      if (done) return;
      cleanup();
      this.handleDefaultContainerComplete();
    };
    
    if (window.electronAPI && window.electronAPI.receive) {
      progressUnsubscribe = window.electronAPI.receive('event:task.progress', (data) => {
        let taskData = data;
        if (Array.isArray(data) && data.length > 0) taskData = data[0];
        if (taskData && taskData.task_id === taskId) {
          const progress = taskData.progress || 0;
          this.updateDefaultContainerProgress(progress, taskData.message_key || taskData.message);
          if (taskData.status === 'failed') {
            onFailed(taskData.error_message || taskData.message);
          } else if (taskData.status === 'completed' && progress === 100) {
            onCompleted();
          }
        }
      });
      
      completedUnsubscribe = window.electronAPI.receive('event:task.completed', (data) => {
        let taskData = data;
        if (Array.isArray(data) && data.length > 0) taskData = data[0];
        if (taskData && taskData.task_id === taskId) {
          onCompleted();
        }
      });
      
      failedUnsubscribe = window.electronAPI.receive('event:task.failed', (data) => {
        let taskData = data;
        if (Array.isArray(data) && data.length > 0) taskData = data[0];
        if (taskData && taskData.task_id === taskId) {
          onFailed(taskData.error_message || t('defaultContainer.unknownError'));
        }
      });
    }
    
    const pollStatus = async () => {
      if (done) return;
      try {
        const res = await dserverCall('task.status', { taskId });
        const task = res && res.status ? res : null;
        if (task) {
          if (task.status === 'failed' || task.status === 'cancelled') {
            onFailed(task.error_message || task.message);
            return;
          }
          if (task.status === 'completed') {
            onCompleted();
            return;
          }
          if (task.progress !== undefined) {
            this.updateDefaultContainerProgress(task.progress, task.message_key || task.message);
          }
        }
      } catch (e) {}
      pollTimer = setTimeout(pollStatus, 2000);
    };
    pollTimer = setTimeout(pollStatus, 2000);
  }

  async listTasks() {
    if (!window.stackrun || !window.stackrun.call) {
      console.warn('[TaskManager] stackrun.call not available');
      return [];
    }
    try {
      const result = await window.stackrun.call('task.list', {});
      if (result && result.success && result.data) {
        let data = result.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (e) {}
        }
        const tasks = Array.isArray(data) ? data : [];
        taskStore.updateLocksFromTasks();
        return tasks;
      }
      return [];
    } catch (err) {
      console.error('[TaskManager] Failed to list tasks:', err);
      return [];
    }
  }

  openTaskInView(taskId) {
    console.log('[TaskManager] Opening task in view:', taskId);
    const task = taskStore.getState(taskId);
    if (!task) {
      showToast('任务不存在', 'error');
      return;
    }

    const taskType = task.type.toLowerCase();
    if (taskType === 'container_create' || taskType === 'container.ensuredefault') {
      this.showDefaultContainerModal();
      this.updateDefaultContainerProgress(task.progress, task.message_key || task.message);
    } else if (taskType.includes('container_create') || taskType.includes('container.ensure')) {
      this.openContainerCreateView(taskId);
    } else if (taskType.includes('app_install') || taskType.includes('app.install')) {
      this.openAddAppView(taskId);
    } else if (taskType.includes('import')) {
      this.openImportContainerView(taskId);
    } else if (taskType.includes('export')) {
      this.openExportContainerView(taskId);
    } else {
      showTaskDetailModal(taskId);
    }
  }

  openContainerCreateView(taskId) {
    const initTaskId = window.stackrunInitTaskId;
    if (initTaskId && String(taskId) === String(initTaskId)) {
      console.log('[TaskManager] Skipping openContainerCreateView for default container task:', taskId);
      this.showDefaultContainerModal();
      return;
    }
    
    const task = taskStore.getState(taskId);
    if (!task) return;

    const modal = document.getElementById('createContainerModal');
    if (!modal) return;

    document.getElementById('containerName').value = task.payload?.name || '';
    document.getElementById('containerType').value = task.payload?.osType?.toString() || '4';
    document.getElementById('containerDescription').value = task.payload?.description || '';
    
    document.getElementById('progressContainer').style.display = 'block';
    document.getElementById('logContainer').style.display = 'none';
    
    document.getElementById('containerName').disabled = true;
    document.getElementById('containerType').disabled = true;
    document.getElementById('containerDescription').disabled = true;
    document.getElementById('createContainerBtn').disabled = true;

    modal.classList.add('active');
    this.bindTaskToView(taskId, {
      progressEl: 'progressBarFill',
      progressTextEl: 'progressText',
      statusEl: null,
      stageEl: null,
      messageEl: null,
      completedCallback: () => {
        modal.classList.remove('active');
        if (typeof loadContainers === 'function') loadContainers();
        if (typeof loadApps === 'function') loadApps();
        if (typeof renderHome === 'function') renderHome();
        if (typeof renderContainerDetail === 'function' && currentContainerId) renderContainerDetail(currentContainerId);
      },
      failedCallback: (errorMessage) => {
        showToast(errorMessage || '创建工作区失败', 'error');
      }
    });
  }

  openAddAppView(taskId) {
    const task = taskStore.getState(taskId);
    if (!task) return;

    const modal = document.getElementById('addAppModal');
    if (!modal) return;

    const containerSelect = document.getElementById('containerId');
    containerSelect.innerHTML = '';
    containers.forEach(container => {
      const option = document.createElement('option');
      option.value = container.id;
      option.textContent = container.name;
      if (String(container.id) === String(task.container_id)) {
        option.selected = true;
      }
      containerSelect.appendChild(option);
    });

    document.getElementById('appPath').value = task.payload?.appPath || '';
    document.getElementById('appType').value = task.payload?.appType?.toString() || '1';
    document.getElementById('addDesktopShortcut').checked = task.payload?.createShortcut || false;
    
    document.getElementById('addAppProgress').style.display = 'block';
    
    document.getElementById('appPath').disabled = true;
    document.getElementById('appType').disabled = true;
    document.getElementById('containerId').disabled = true;
    document.getElementById('addDesktopShortcut').disabled = true;
    document.querySelector('#addAppModal .input-with-button .btn-secondary').disabled = true;
    document.getElementById('addAppBtn').disabled = true;

    modal.classList.add('active');
    this.bindTaskToView(taskId, {
      progressEl: 'addAppProgressFill',
      progressTextEl: 'addAppProgressText',
      statusEl: null,
      stageEl: null,
      messageEl: null,
      completedCallback: () => {
        modal.classList.remove('active');
        if (typeof loadApps === 'function') loadApps();
        if (typeof loadContainers === 'function') loadContainers();
        if (typeof renderContainerDetail === 'function' && currentContainerId) renderContainerDetail(currentContainerId);
      },
      failedCallback: (errorMessage) => {
        showToast(errorMessage || '添加应用失败', 'error');
        setTimeout(() => {
          try {
            document.getElementById('appPath').disabled = false;
            document.getElementById('appType').disabled = false;
            document.getElementById('containerId').disabled = false;
            document.getElementById('addDesktopShortcut').disabled = false;
            const browseBtn = document.querySelector('#addAppModal .input-with-button .btn-secondary');
            if (browseBtn) browseBtn.disabled = false;
            const addBtn = document.getElementById('addAppBtn');
            if (addBtn) addBtn.disabled = false;
          } catch (e) {}
          modal.classList.remove('active');
          if (typeof loadApps === 'function') loadApps();
          if (typeof loadContainers === 'function') loadContainers();
          if (typeof renderContainerDetail === 'function' && currentContainerId) renderContainerDetail(currentContainerId);
        }, 500);
      }
    });
  }

  openImportContainerView(taskId) {
    const task = taskStore.getState(taskId);
    if (!task) return;

    const modal = document.getElementById('importContainerModal');
    if (!modal) return;

    document.getElementById('importPath').value = task.payload?.path || '';
    document.getElementById('importContainerName').value = task.payload?.name || '';
    
    document.getElementById('importProgressContainer').style.display = 'block';
    
    modal.classList.add('active');
    this.bindTaskToView(taskId, {
      progressEl: 'importProgressBarFill',
      progressTextEl: 'importProgressText',
      statusEl: null,
      stageEl: null,
      messageEl: null,
      completedCallback: () => {
        modal.classList.remove('active');
        if (typeof loadContainers === 'function') loadContainers();
        if (typeof loadApps === 'function') loadApps();
        if (typeof renderContainerDetail === 'function' && currentContainerId) renderContainerDetail(currentContainerId);
      },
      failedCallback: (errorMessage) => {
        showToast(errorMessage || '导入工作区失败', 'error');
      }
    });
  }

  openExportContainerView(taskId) {
    const task = taskStore.getState(taskId);
    if (!task) return;

    const modal = document.getElementById('exportContainerModal');
    if (!modal) return;

    document.getElementById('exportPath').value = task.payload?.exportPath || '';
    
    document.getElementById('exportProgressContainer').style.display = 'block';
    
    modal.classList.add('active');
    this.bindTaskToView(taskId, {
      progressEl: 'exportProgressBarFill',
      progressTextEl: 'exportProgressText',
      statusEl: null,
      stageEl: null,
      messageEl: null,
      completedCallback: () => {
        modal.classList.remove('active');
        showToast('导出工作区成功', 'success');
        if (typeof loadContainers === 'function') loadContainers();
        if (typeof loadApps === 'function') loadApps();
        if (typeof renderContainerDetail === 'function' && currentContainerId) renderContainerDetail(currentContainerId);
      },
      failedCallback: (errorMessage) => {
        showToast(errorMessage || '导出工作区失败', 'error');
      }
    });
  }

  bindTaskToView(taskId, options) {
    const { progressEl, progressTextEl, statusEl, stageEl, messageEl, completedCallback, failedCallback } = options;
    
    let unsubscribe = taskStore.subscribeTask(taskId, (event, data) => {
      if (event === 'update') {
        const task = taskStore.getState(taskId);
        if (!task) return;

        if (progressEl) {
          const el = document.getElementById(progressEl);
          if (el) el.style.width = `${task.progress || 0}%`;
        }
        if (progressTextEl) {
          const el = document.getElementById(progressTextEl);
          if (el) el.textContent = `${task.progress || 0}%`;
        }
        if (stageEl && task.stage) {
          const el = document.getElementById(stageEl);
          if (el) el.textContent = task.stage;
        }
        if (messageEl && (task.message || task.message_key)) {
          const el = document.getElementById(messageEl);
          if (el) el.textContent = task.message || task.message_key;
        }

        if (task.status === 'completed') {
          if (completedCallback) completedCallback();
          unsubscribe();
        } else if (task.status === 'failed') {
          if (failedCallback) failedCallback(task.error_message);
          unsubscribe();
        }
      }
    });

    const currentTask = taskStore.getState(taskId);
    if (currentTask && currentTask.status === 'completed') {
      if (completedCallback) completedCallback();
      unsubscribe();
    } else if (currentTask && currentTask.status === 'failed') {
      if (failedCallback) failedCallback(currentTask.error_message);
      unsubscribe();
    }

    return unsubscribe;
  }

  isContainerLocked(containerId) {
    return taskStore.isContainerLocked(containerId);
  }

  getContainerLock(containerId) {
    return taskStore.getContainerLock(containerId);
  }

  getLockedContainerIds() {
    return taskStore.getLockedContainerIds();
  }
}

export const taskManager = new TaskManager();