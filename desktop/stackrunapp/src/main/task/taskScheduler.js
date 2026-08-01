const logger = require('../../sdk/logger');

const QUEUE_CONFIG = {
  WORKSPACE: { maxConcurrent: 1, name: 'workspace' },
  INSTALL: { maxConcurrent: 1, name: 'install' },
  EXPORT: { maxConcurrent: 2, name: 'export' },
  DOWNLOAD: { maxConcurrent: 4, name: 'download' },
  BACKGROUND: { maxConcurrent: 10, name: 'background' },
  DEFAULT: { maxConcurrent: 1, name: 'default' }
};

const TASK_TYPE_TO_QUEUE = {
  'container.create': 'WORKSPACE',
  'container.delete': 'WORKSPACE',
  'container.import': 'WORKSPACE',
  'container.export': 'EXPORT',
  'container.app.add': 'INSTALL',
  'wine.install_components': 'INSTALL',
  'container.font.import': 'INSTALL'
};

class TaskScheduler {
  constructor() {
    this.queues = {};
    this.tasks = {};
    this._initQueues();
  }

  _initQueues() {
    Object.keys(QUEUE_CONFIG).forEach(key => {
      this.queues[key] = {
        config: QUEUE_CONFIG[key],
        tasks: [],
        running: 0
      };
    });
  }

  _getQueueName(taskType) {
    return TASK_TYPE_TO_QUEUE[taskType] || 'DEFAULT';
  }

  enqueue(taskData) {
    const queueName = this._getQueueName(taskData.type || taskData.method);
    const queue = this.queues[queueName];
    
    const task = {
      id: taskData.taskId || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: taskData.type,
      method: taskData.method,
      params: taskData.params,
      execute: taskData.execute,
      cancel: taskData.cancel,
      status: 'WAITING',
      progress: 0,
      message: '等待执行...',
      createdAt: Date.now(),
      queueName
    };

    this.tasks[task.id] = task;
    queue.tasks.push(task);
    
    logger.info(`[TaskScheduler] Enqueued task: ${task.id} -> ${queueName}`);
    
    this._processQueue(queueName);
    
    return task.id;
  }

  async _processQueue(queueName) {
    const queue = this.queues[queueName];
    
    while (queue.running < queue.config.maxConcurrent && queue.tasks.length > 0) {
      const task = queue.tasks.shift();
      queue.running++;
      task.status = 'RUNNING';
      task.progress = 0;
      task.message = '开始执行...';
      
      logger.info(`[TaskScheduler] Starting task: ${task.id} (${queueName})`);
      
      try {
        if (task.execute) {
          await task.execute();
        }
        task.status = 'SUCCESS';
        task.progress = 100;
        task.message = '任务完成';
        logger.info(`[TaskScheduler] Task completed: ${task.id}`);
      } catch (error) {
        task.status = 'FAILED';
        task.progress = -1;
        task.message = `任务失败: ${error.message}`;
        logger.error(`[TaskScheduler] Task failed: ${task.id}`, error);
      } finally {
        queue.running--;
        this._processQueue(queueName);
      }
    }
  }

  cancelTask(taskId) {
    const task = this.tasks[taskId];
    if (!task) {
      return { success: false, message: '任务不存在' };
    }

    if (task.status === 'WAITING') {
      const queue = this.queues[task.queueName];
      const index = queue.tasks.findIndex(t => t.id === taskId);
      if (index !== -1) {
        queue.tasks.splice(index, 1);
      }
      task.status = 'CANCELLED';
      task.message = '任务已取消';
      logger.info(`[TaskScheduler] Task cancelled (waiting): ${taskId}`);
      return { success: true };
    }

    if (task.status === 'RUNNING' && task.cancel) {
      try {
        task.cancel();
        task.status = 'CANCELLED';
        task.message = '任务取消中';
        logger.info(`[TaskScheduler] Task cancel requested: ${taskId}`);
        return { success: true };
      } catch (error) {
        return { success: false, message: error.message };
      }
    }

    return { success: false, message: '任务无法取消' };
  }

  getTaskStatus(taskId) {
    return this.tasks[taskId] || null;
  }

  getActiveTasks() {
    return Object.values(this.tasks).filter(t => 
      t.status === 'RUNNING' || t.status === 'WAITING'
    );
  }

  isBusy(queueName = null) {
    if (queueName) {
      const queue = this.queues[queueName];
      return queue && (queue.running > 0 || queue.tasks.length > 0);
    }
    
    return Object.values(this.queues).some(q => q.running > 0 || q.tasks.length > 0);
  }

  getQueueSize(queueName = null) {
    if (queueName) {
      const queue = this.queues[queueName];
      return queue ? queue.tasks.length + queue.running : 0;
    }
    
    return Object.values(this.queues).reduce((sum, q) => sum + q.tasks.length + q.running, 0);
  }

  getQueueInfo() {
    const info = {};
    Object.keys(this.queues).forEach(key => {
      const queue = this.queues[key];
      info[key] = {
        name: queue.config.name,
        maxConcurrent: queue.config.maxConcurrent,
        running: queue.running,
        pending: queue.tasks.length,
        total: queue.running + queue.tasks.length
      };
    });
    return info;
  }

  clearCompleted() {
    const completedStatuses = ['SUCCESS', 'FAILED', 'CANCELLED'];
    Object.keys(this.tasks).forEach(taskId => {
      if (completedStatuses.includes(this.tasks[taskId].status)) {
        delete this.tasks[taskId];
      }
    });
  }
}

module.exports = { TaskScheduler, QUEUE_CONFIG, TASK_TYPE_TO_QUEUE };
