const logger = require('../sdk/logger');

class AppBusiness {
  constructor() {
    this.logger = logger;
    logger.info('AppBusiness initialized');
  }

  async getContainers() {
    try {
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'container.list',
        params: {}
      });
      if (result && result.containers) {
        return result.containers.map(c => this._mapContainerFromServer(c));
      }
      return [];
    } catch (error) {
      this.logger.error('Error getting containers:', error);
      return [];
    }
  }

  async getNormalContainers() {
    const containers = await this.getContainers();
    return containers.filter(c => c.status === 'running' || c.status === 'created');
  }

  async getContainerById(id_cont) {
    const containers = await this.getContainers();
    return containers.find(c => c.id_cont === id_cont);
  }

  async createContainer(containerData, progressCallback, forceMemoryCheck = false) {
    try {
      const params = {
        name: containerData.alias_name || containerData.name,
        description: containerData.notes || containerData.description || '',
        osType: containerData.os_type || 4
      };

      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'container.create',
        params: params
      });

      if (result && result.guid) {
        return this._mapContainerFromServer(result);
      }
      throw new Error('Failed to create container');
    } catch (error) {
      this.logger.error('Error creating container:', error);
      throw error;
    }
  }

  async getApps(id_cont) {
    try {
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.list',
        params: { containerId: id_cont }
      });
      if (result && result.apps) {
        return result.apps.map(app => this._mapAppFromServer(app)).filter(app => {
          if (app.app_type === 7) return true;
          if (app.alias_name === 'Wine Application') return false;
          if (app.exe_path && app.exe_path.includes('winecfg.exe')) return false;
          return true;
        });
      }
      return [];
    } catch (error) {
      this.logger.error('Error getting apps:', error);
      return [];
    }
  }

  async getAppById(id_app) {
    const containers = await this.getContainers();
    for (const container of containers) {
      const apps = await this.getApps(container.id_cont);
      const app = apps.find(a => a.id_app === id_app || a.app_uuid === id_app);
      if (app) return app;
    }
    return null;
  }

  async getAppInfo(id_app) {
    const app = await this.getAppById(id_app);
    if (app) {
      return {
        id_app: app.id_app,
        id_cont: app.id_cont,
        name: app.alias_name,
        alias_name: app.alias_name,
        path: app.exe_path,
        exe_path: app.exe_path,
        args: app.launch_arguments,
        env: app.env_cmd,
        kernel_args: app.ker_cmd,
        icon_path: app.icon_path
      };
    }
    return null;
  }

  async startApp(appId, containerId) {
    try {
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.run',
        params: { appId, containerId }
      });
      return result;
    } catch (error) {
      this.logger.error('Error starting app:', error);
      throw error;
    }
  }

  async addAppToContainer(appData, forceInstall = false) {
    try {
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.install',
        params: {
          containerId: appData.id_cont,
          installerPath: appData.exe_path || appData.path,
          filePath: appData.exe_path || appData.path,
          aliasName: appData.alias_name || appData.name,
          appType: appData.app_type || 3,
          createShortcut: appData.createShortcut !== undefined ? Number(appData.createShortcut) :
                         (appData.desktop_shortcut !== undefined ? Number(appData.desktop_shortcut) : 1),
          desktopShortcut: appData.desktop_shortcut !== undefined ? Boolean(appData.desktop_shortcut) : true,
          startmenuShortcut: appData.startmenu_shortcut !== undefined ? Boolean(appData.startmenu_shortcut) : false,
          forceInstall: !!forceInstall
        }
      });
      return result;
    } catch (error) {
      this.logger.error('Error adding app:', error);
      throw error;
    }
  }

  async removeAppFromContainer(id_app) {
    try {
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.delete',
        params: { appId: id_app }
      });
      return result;
    } catch (error) {
      this.logger.error('Error removing app:', error);
      throw error;
    }
  }

  async uninstallApp(id_app, uninstall_cmd = null, progressCallback = null) {
    try {
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.uninstall',
        params: { appId: id_app }
      });
      return result;
    } catch (error) {
      this.logger.error('Error uninstalling app:', error);
      throw error;
    }
  }

  async updateContainer(id_cont, containerData) {
    try {
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'container.update',
        params: {
          containerId: id_cont,
          name: containerData.alias_name || containerData.name,
          description: containerData.notes || containerData.description
        }
      });
      return result;
    } catch (error) {
      this.logger.error('Error updating container:', error);
      throw error;
    }
  }

  async updateApp(id_app, ...args) {
    try {
      let appData;
      if (args.length === 1 && typeof args[0] === 'object') {
        appData = args[0];
      } else {
        const [name, app_cmd, env_cmd, ker_cmd] = args;
        appData = {
          alias_name: name,
          app_cmd: app_cmd || '',
          env_cmd: env_cmd || '',
          ker_cmd: ker_cmd || ''
        };
      }

      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.update',
        params: {
          appId: id_app,
          ...appData
        }
      });
      return result;
    } catch (error) {
      this.logger.error('Error updating app:', error);
      throw error;
    }
  }

  async deleteContainer(id_cont, deleteType = 'delete') {
    try {
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'container.delete',
        params: { containerId: id_cont }
      });
      return result;
    } catch (error) {
      this.logger.error('Error deleting container:', error);
      throw error;
    }
  }

  async deleteContainerToTrash(id_cont) {
    return await this.deleteContainer(id_cont, 'trash');
  }

  async restoreContainer(id_cont) {
    this.logger.warn('restoreContainer not supported by dserver');
    return null;
  }

  async getTrashContainers() {
    return [];
  }

  async addApp(containerId, appData, progressCallback, forceInstall = false, forceMemoryCheck = false) {
    return await this.addAppToContainer({
      id_cont: containerId,
      ...appData
    }, forceInstall);
  }

  async deleteDesktopShortcut(app) {
    try {
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.deleteDesktopShortcut',
        params: { appId: app.app_uuid }
      });
      return result;
    } catch (error) {
      this.logger.error('Error deleting desktop shortcut:', error);
      throw error;
    }
  }

  async deleteStartMenuShortcut(app) {
    try {
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.deleteStartMenuShortcut',
        params: { appId: app.app_uuid }
      });
      return result;
    } catch (error) {
      this.logger.error('Error deleting start menu shortcut:', error);
      throw error;
    }
  }

  async getUninstallableApps(id_cont) {
    try {
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.uninstallable',
        params: { containerId: id_cont }
      });
      return result.success ? result.data : [];
    } catch (error) {
      this.logger.error('Error getting uninstallable apps:', error);
      return [];
    }
  }

  _mapContainerFromServer(container) {
    return {
      id_cont: container.id_cont || container.id,
      guid: container.guid,
      alias_name: container.name || container.alias_name,
      name: container.name || container.alias_name,
      description: container.description || container.notes || '',
      notes: container.description || container.notes || '',
      os_type: container.os_type || container.osType || 4,
      status: container.status || (container.status === 'started' ? 'running' : 'stopped'),
      wine_prefix_full_path: container.prefix_path || '',
      date_created: container.created_at || container.date_created || new Date().toISOString(),
      date_modified: container.modified_at || container.date_modified || new Date().toISOString(),
      icon_path: container.icon_path || '',
      bigicon_path: container.bigicon_path || '',
      version: container.version || '1.0.0'
    };
  }

  _mapAppFromServer(app) {
    return {
      id_app: app.id || app.id_app,
      app_uuid: app.uuid || app.app_uuid,
      id_cont: app.container_id || app.id_cont,
      alias_name: app.name || app.alias_name,
      exe_path: app.path || app.exe_path,
      app_type: app.type || app.app_type || 1,
      md5sum: app.md5 || app.md5sum || '',
      date_created: app.created_at || app.date_created || new Date().toISOString(),
      date_modified: app.modified_at || app.date_modified || new Date().toISOString(),
      file_size_kb: app.file_size || app.file_size_kb || 0,
      product_version: app.version || app.product_version || '',
      app_cmd: app.app_cmd || '',
      env_cmd: app.env_cmd || '',
      ker_cmd: app.ker_cmd || '',
      icon_path: app.icon_path || '',
      launch_arguments: app.args || app.launch_arguments || '',
      work_dir: app.work_dir || '',
      desktop_shortcut: app.desktop_shortcut || false,
      startmenu_shortcut: app.startmenu_shortcut || false
    };
  }
}

module.exports = new AppBusiness();