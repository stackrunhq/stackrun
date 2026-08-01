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

class TaskStore {
  constructor() {
    this.state = new Map();
    this.listeners = new Map();
    this.locks = new Map();
    this.states = TASK_STATES;
  }

  getState(taskId) {
    return this.state.get(String(taskId));
  }

  getAllState() {
    return Object.fromEntries(this.state);
  }

  setState(taskId, taskData) {
    const id = String(taskId);
    const oldData = this.state.get(id);
    const merged = { ...oldData, ...taskData };
    if (merged.task_id == null) merged.task_id = id;
    this.state.set(id, merged);
    this.notifyListeners(id, 'update', merged);
  }

  removeState(taskId) {
    const id = String(taskId);
    this.state.delete(id);
    this.notifyListeners(id, 'remove', null);
  }

  clearState() {
    this.state.clear();
    this.notifyListeners('*', 'clear', null);
  }

  subscribe(callback) {
    if (!this.listeners.has('*')) {
      this.listeners.set('*', []);
    }
    this.listeners.get('*').push(callback);
    return () => {
      const callbacks = this.listeners.get('*');
      const index = callbacks.indexOf(callback);
      if (index > -1) callbacks.splice(index, 1);
    };
  }

  subscribeTask(taskId, callback) {
    const id = String(taskId);
    if (!this.listeners.has(id)) {
      this.listeners.set(id, []);
    }
    this.listeners.get(id).push(callback);
    return () => {
      const callbacks = this.listeners.get(id);
      const index = callbacks.indexOf(callback);
      if (index > -1) callbacks.splice(index, 1);
    };
  }

  notifyListeners(taskId, event, data) {
    const id = String(taskId);
    const globalCallbacks = this.listeners.get('*') || [];
    globalCallbacks.forEach(cb => cb(id, event, data));

    const taskCallbacks = this.listeners.get(id) || [];
    taskCallbacks.forEach(cb => cb(event, data));
  }

  restore(taskList) {
    this.clearState();
    if (Array.isArray(taskList)) {
      taskList.forEach(task => {
        if (task.task_id) {
          const id = String(task.task_id);
          const uiMode = this.getUIModeFromType(task.type);
          let payloadData = task.payload || {};
          if (typeof payloadData === 'string') {
            try {
              payloadData = JSON.parse(payloadData);
            } catch (e) {
              payloadData = {};
            }
          }
          this.state.set(id, {
            ...task,
            task_id: id,
            type: task.type || 'unknown',
            domain: task.domain || 'system',
            status: task.status || 'unknown',
            priority: task.priority || 'normal',
            uiMode: uiMode,
            container_id: task.container_id ? String(task.container_id) : '',
            app_id: task.app_id ? String(task.app_id) : '',
            progress: task.progress || 0,
            stage: task.stage || '',
            message: task.message || '',
            message_key: task.message_key || '',
            error_message: task.error_message || '',
            result: task.result || null,
            retry_count: task.retry_count || 0,
            max_retries: task.max_retries || 3,
            created_at: task.created_at || Date.now(),
            started_at: task.started_at || 0,
            completed_at: task.completed_at || 0,
            restored: true,
            payload: payloadData,
            payload_version: task.payload_version || (task.payload && task.payload.version) || 1,
            recovery_mode: task.recovery_mode || 'ui'
          });
        }
      });
    }
    this.updateLocksFromTasks();
  }

  getUIModeFromType(taskType) {
    if (!taskType) return 'background';
    const type = taskType.toLowerCase();
    if (type === 'container_create' || type === 'container.ensuredefault') {
      return 'modal';
    }
    if (type.includes('wine') || type.includes('stream') || type.includes('exec')) {
      return 'stream';
    }
    if (type.includes('install') || type.includes('app')) {
      return 'background';
    }
    return 'background';
  }

  isRunningStatus(status) {
    const runningStatuses = ['queued', 'initializing', 'running', 'retrying', 'cancelling', 'recovering', 'ui_active'];
    return runningStatuses.includes(status);
  }

  getTasksByUIMode(uiMode) {
    const tasks = [];
    this.state.forEach((task, taskId) => {
      if (task.uiMode === uiMode) {
        tasks.push(task);
      }
    });
    return tasks;
  }

  getRunningTasks() {
    const tasks = [];
    this.state.forEach((task) => {
      if (this.isRunningStatus(task.status)) {
        tasks.push(task);
      }
    });
    return tasks;
  }

  getModalTasks() {
    return this.getTasksByUIMode('modal').filter(t => this.isRunningStatus(t.status));
  }

  getStreamTasks() {
    return this.getTasksByUIMode('stream').filter(t => this.isRunningStatus(t.status));
  }

  getTasksByType(type) {
    const tasks = [];
    this.state.forEach((task) => {
      if (task.type === type) {
        tasks.push(task);
      }
    });
    return tasks;
  }

  getTasksByDomain(domain) {
    const tasks = [];
    this.state.forEach((task) => {
      if (task.domain === domain) {
        tasks.push(task);
      }
    });
    return tasks;
  }

  getTasksByContainer(containerId) {
    const tasks = [];
    this.state.forEach((task) => {
      if (task.container_id === containerId) {
        tasks.push(task);
      }
    });
    return tasks;
  }

  getTasksByStatus(status) {
    const tasks = [];
    this.state.forEach((task) => {
      if (task.status === status) {
        tasks.push(task);
      }
    });
    return tasks;
  }

  getActiveTasksByDomain(domain) {
    return this.getTasksByDomain(domain).filter(t => this.isRunningStatus(t.status));
  }

  getActiveTasksByType(type) {
    return this.getTasksByType(type).filter(t => this.isRunningStatus(t.status));
  }

  getActiveTasksByContainer(containerId) {
    return this.getTasksByContainer(containerId).filter(t => this.isRunningStatus(t.status));
  }

  getContainerCreatingTasks() {
    return this.getActiveTasksByType('container_create');
  }

  getAppInstallingTasks() {
    return this.getActiveTasksByType('app_install');
  }

  getWineInstallingTasks() {
    return this.getActiveTasksByType('wine_install');
  }

  getBackgroundTasks() {
    return this.getTasksByUIMode('background').filter(t => this.isRunningStatus(t.status));
  }

  getCompletedTasks() {
    return this.getTasksByStatus('completed');
  }

  getFailedTasks() {
    return this.getTasksByStatus('failed');
  }

  getTaskCountByDomain(domain) {
    return this.getTasksByDomain(domain).length;
  }

  getActiveTaskCountByDomain(domain) {
    return this.getActiveTasksByDomain(domain).length;
  }

  getTaskStatusInfo(status) {
    const statusMap = {
      'init': { label: '初始化', icon: '🔧', color: '#9E9E9E' },
      'queued': { label: '排队中', icon: '⏳', color: '#999' },
      'initializing': { label: '初始化', icon: '🔧', color: '#4CAF50' },
      'running': { label: '运行中', icon: '🚀', color: '#2196F3' },
      'paused': { label: '已暂停', icon: '⏸️', color: '#FF9800' },
      'retrying': { label: '重试中', icon: '🔄', color: '#FFC107' },
      'recovering': { label: '恢复中', icon: '🔄', color: '#9C27B0' },
      'ui_active': { label: 'UI活跃', icon: '🖥️', color: '#00BCD4' },
      'completed': { label: '已完成', icon: '✅', color: '#4CAF50' },
      'failed': { label: '失败', icon: '❌', color: '#F44336' },
      'cancelled': { label: '已取消', icon: '🚫', color: '#999' },
      'cancelling': { label: '取消中', icon: '⏳', color: '#FF9800' },
      'cleaned': { label: '已清理', icon: '🗑️', color: '#607D8B' }
    };
    return statusMap[status] || { label: '未知', icon: '❓', color: '#999' };
  }

  lockContainer(containerId, taskId, type) {
    this.locks.set(containerId, { taskId, type });
    this.notifyListeners('*', 'lock', { containerId, taskId, type });
  }

  unlockContainer(containerId) {
    const lock = this.locks.get(containerId);
    this.locks.delete(containerId);
    if (lock) {
      this.notifyListeners('*', 'unlock', { containerId, taskId: lock.taskId });
    }
  }

  getContainerLock(containerId) {
    return this.locks.get(containerId);
  }

  isContainerLocked(containerId) {
    return this.locks.has(containerId);
  }

  getLockedContainerIds() {
    return Array.from(this.locks.keys());
  }

  updateLocksFromTasks() {
    this.locks.clear();
    this.state.forEach((task, taskId) => {
      if (this.isRunningStatus(task.status) && task.container_id) {
        const lockType = this.getLockTypeFromTaskType(task.type);
        this.locks.set(task.container_id, { taskId, type: lockType });
      }
    });
    this.notifyListeners('*', 'locksUpdated', Array.from(this.locks.entries()));
  }

  getLockTypeFromTaskType(taskType) {
    if (!taskType) return 'task';
    const t = taskType.toLowerCase();
    if (t.includes('container_create') || t.includes('container.ensure')) return 'create';
    if (t.includes('app_install') || t.includes('app.install')) return 'install';
    if (t.includes('import')) return 'import';
    if (t.includes('export')) return 'export';
    if (t.includes('delete') || t.includes('purge')) return 'delete';
    return 'task';
  }
}

export const taskStore = new TaskStore();