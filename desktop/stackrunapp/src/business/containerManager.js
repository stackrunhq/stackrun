const logger = require('../sdk/logger');

class ContainerManager {
  constructor() {
    this.logger = logger;
    logger.info('ContainerManager initialized');
  }

  async getContainers() {
    try {
      this.logger.debug('Getting containers from dserver');
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'container.list',
        params: {}
      });
      if (result && result.containers) {
        return result.containers.map(c => this._mapContainer(c));
      }
      return [];
    } catch (error) {
      this.logger.error('Error getting containers:', error);
      return [];
    }
  }

  async getContainerById(id_cont) {
    try {
      this.logger.debug(`Getting container by ID: ${id_cont}`);
      const containers = await this.getContainers();
      return containers.find(c => c.id_cont === id_cont);
    } catch (error) {
      this.logger.error('Error getting container by ID:', error);
      return null;
    }
  }

  async getContainerByName(alias_name) {
    try {
      this.logger.debug(`Getting container by name: ${alias_name}`);
      const containers = await this.getContainers();
      return containers.find(c => c.alias_name === alias_name);
    } catch (error) {
      this.logger.error('Error getting container by name:', error);
      return null;
    }
  }

  async createContainer(containerData, progressCallback) {
    try {
      this.logger.debug('Creating container:', containerData);

      if (!containerData.alias_name && !containerData.name) {
        throw new Error('容器数据缺少名称字段');
      }

      const params = {
        name: containerData.alias_name || containerData.name,
        description: containerData.notes || containerData.description || '',
        osType: containerData.os_type || 4
      };

      if (progressCallback) progressCallback(10, '正在创建容器...');

      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'container.create',
        params: params
      });

      if (result && result.guid) {
        if (progressCallback) progressCallback(100, '容器创建完成');
        this.logger.info(`Container created successfully: ${params.name}`);
        return this._mapContainer(result);
      } else {
        throw new Error(result.message || '创建容器失败');
      }
    } catch (error) {
      this.logger.error('Error creating container:', error);
      if (progressCallback) progressCallback(-1, `创建容器失败: ${error.message}`);
      throw error;
    }
  }

  async updateContainer(id_cont, containerData) {
    try {
      this.logger.debug(`Updating container: ${id_cont}`);
      const params = {
        containerId: id_cont,
        name: containerData.alias_name || containerData.name,
        description: containerData.notes || containerData.description
      };
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'container.update',
        params: params
      });
      return result.success !== false;
    } catch (error) {
      this.logger.error('Error updating container:', error);
      throw error;
    }
  }

  async deleteContainer(id_cont) {
    try {
      this.logger.debug(`Deleting container: ${id_cont}`);
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'container.delete',
        params: { containerId: id_cont }
      });
      return result.success !== false;
    } catch (error) {
      this.logger.error('Error deleting container:', error);
      throw error;
    }
  }

  async deleteContainerToTrash(id_cont) {
    return await this.deleteContainer(id_cont);
  }

  async restoreContainer(id_cont) {
    this.logger.warn('restoreContainer not supported by dserver');
    return false;
  }

  async getTrashContainers() {
    return [];
  }

  getContainerStatusEnum() {
    return {
      NORMAL: 'running',
      CREATED: 'created',
      STOPPED: 'stopped',
      DELETED: 'deleted'
    };
  }

  getContainerStatusName(status) {
    const statusMap = {
      'running': '运行中',
      'created': '已创建',
      'started': '已启动',
      'stopped': '已停止',
      'deleted': '已删除'
    };
    return statusMap[status] || '未知';
  }

  async getContainerStatus(id_cont) {
    try {
      const container = await this.getContainerById(id_cont);
      return container ? container.status : null;
    } catch (error) {
      this.logger.error('Error getting container status:', error);
      return null;
    }
  }

  async updateContainerStatus(id_cont, status) {
    if (status === 'running' || status === 'started') {
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'container.start',
        params: { guid: id_cont }
      });
      return result.success !== false;
    } else if (status === 'stopped') {
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'container.stop',
        params: { guid: id_cont }
      });
      return result.success !== false;
    }
    return false;
  }

  _mapContainer(container) {
    return {
      id_cont: container.id_cont || container.id,
      guid: container.guid,
      alias_name: container.name || container.alias_name,
      name: container.name || container.alias_name,
      description: container.description || container.notes || '',
      notes: container.description || container.notes || '',
      os_type: container.os_type || container.osType || 4,
      status: container.status || 'stopped',
      wine_prefix_full_path: container.prefix_path || '',
      date_created: container.created_at || container.date_created || new Date().toISOString(),
      date_modified: container.modified_at || container.date_modified || new Date().toISOString(),
      icon_path: container.icon_path || '',
      bigicon_path: container.bigicon_path || '',
      version: container.version || '1.0.0'
    };
  }
}

module.exports = new ContainerManager();