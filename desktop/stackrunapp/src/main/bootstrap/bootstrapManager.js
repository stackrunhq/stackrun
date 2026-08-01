const logger = require('../../sdk/logger');

class BootstrapManager {
  constructor(dserverClient, eventClient) {
    this.dserverClient = dserverClient;
    this.eventClient = eventClient;
  }

  async check() {
    try {
      const result = await this.dserverClient.call('bootstrap.check', {});
      logger.info('[BootstrapManager] Check result:', result);
      return result;
    } catch (error) {
      logger.error('[BootstrapManager] Check failed:', error.message);
      return { state: 'UNINITIALIZED', message: 'Failed to check bootstrap status' };
    }
  }

  async ensure() {
    try {
      const result = await this.dserverClient.call('bootstrap.ensure', {});
      logger.info('[BootstrapManager] Ensure result:', result);
      return result;
    } catch (error) {
      logger.error('[BootstrapManager] Ensure failed:', error.message);
      return { state: 'FAILED', message: 'Failed to ensure bootstrap' };
    }
  }

  async waitForBootstrap(taskId, progressCallback) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.eventClient.unsubscribe('task.progress', handleProgress);
        this.eventClient.unsubscribe('task.completed', handleCompleted);
        this.eventClient.unsubscribe('task.failed', handleFailed);
        reject(new Error('Bootstrap timeout'));
      }, 300000);

      const handleProgress = (event) => {
        if (event.task_id === taskId || event.taskId === taskId) {
          if (progressCallback) {
            progressCallback(event.progress || 0, event.message || '');
          }
        }
      };

      const handleCompleted = (event) => {
        if (event.task_id === taskId || event.taskId === taskId) {
          clearTimeout(timeout);
          this.eventClient.unsubscribe('task.progress', handleProgress);
          this.eventClient.unsubscribe('task.completed', handleCompleted);
          this.eventClient.unsubscribe('task.failed', handleFailed);
          resolve(event);
        }
      };

      const handleFailed = (event) => {
        if (event.task_id === taskId || event.taskId === taskId) {
          clearTimeout(timeout);
          this.eventClient.unsubscribe('task.progress', handleProgress);
          this.eventClient.unsubscribe('task.completed', handleCompleted);
          this.eventClient.unsubscribe('task.failed', handleFailed);
          reject(new Error(event.message || 'Bootstrap failed'));
        }
      };

      this.eventClient.subscribe('task.progress', handleProgress);
      this.eventClient.subscribe('task.completed', handleCompleted);
      this.eventClient.subscribe('task.failed', handleFailed);
    });
  }

  async ensureReady(progressCallback) {
    const status = await this.check();

    if (status.state === 'READY') {
      logger.info('[BootstrapManager] System is already ready');
      return { success: true, status };
    }

    if (status.state === 'INITIALIZING' && status.taskId) {
      logger.info('[BootstrapManager] Bootstrap in progress, waiting for task:', status.taskId);
      if (progressCallback) {
        progressCallback(status.progress || 0, status.message || 'Initializing...');
      }
      try {
        await this.waitForBootstrap(status.taskId, progressCallback);
        return { success: true, status: { state: 'READY' } };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    logger.info('[BootstrapManager] Starting bootstrap');
    const ensureResult = await this.ensure();

    if (ensureResult.state === 'READY') {
      logger.info('[BootstrapManager] Bootstrap completed immediately');
      return { success: true, status: ensureResult };
    }

    if (ensureResult.state === 'INITIALIZING' && ensureResult.taskId) {
      logger.info('[BootstrapManager] Bootstrap started, task:', ensureResult.taskId);
      if (progressCallback) {
        progressCallback(ensureResult.progress || 0, ensureResult.message || 'Starting...');
      }
      try {
        await this.waitForBootstrap(ensureResult.taskId, progressCallback);
        return { success: true, status: { state: 'READY' } };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    return { success: false, error: ensureResult.message || 'Bootstrap failed' };
  }
}

module.exports = { BootstrapManager };