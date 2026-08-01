const logger = require('../sdk/logger');

class AppManager {
  constructor() {
    this.logger = logger;
    logger.info('AppManager initialized');
  }

  async getAppsByContainer(id_cont) {
    try {
      this.logger.debug(`Getting apps for container: ${id_cont}`);
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.list',
        params: { containerId: id_cont }
      });
      if (result && result.apps) {
        return result.apps.map(app => this._mapApp(app));
      }
      return [];
    } catch (error) {
      this.logger.error('Error getting apps:', error);
      return [];
    }
  }

  async getAppById(id_app) {
    try {
      this.logger.debug(`Getting app by ID: ${id_app}`);
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.get',
        params: { appId: id_app }
      });
      if (result && result.app) {
        return this._mapApp(result.app);
      }
      return null;
    } catch (error) {
      this.logger.error('Error getting app by ID:', error);
      return null;
    }
  }

  async getAppByName(containerId, appName) {
    try {
      const apps = await this.getAppsByContainer(containerId);
      return apps.find(app => app.alias_name === appName);
    } catch (error) {
      this.logger.error('Error getting app by name:', error);
      return null;
    }
  }

  async installApp(appData, desktopShortcut = true) {
    try {
      this.logger.info(`Installing app: ${appData.alias_name}`);
      
      if (!appData.id_cont || (!appData.alias_name && !appData.name)) {
        throw new Error('应用数据缺少必填字段');
      }

      const params = {
        containerId: appData.id_cont,
        filePath: appData.exe_path || appData.path,
        aliasName: appData.alias_name || appData.name,
        desktopShortcut: desktopShortcut,
        startmenuShortcut: appData.startmenu_shortcut || false,
        launchArguments: appData.launch_arguments || appData.args || '',
        workDir: appData.work_dir || ''
      };

      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.install',
        params: params
      });

      if (result && result.appId) {
        this.logger.info(`App installed: ${params.aliasName}`);
        return result.appId;
      } else {
        throw new Error(result.message || '安装应用失败');
      }
    } catch (error) {
      this.logger.error('Error installing app:', error);
      throw error;
    }
  }

  async startApp(appId, containerId) {
    try {
      this.logger.debug(`Starting app: ${appId} in container: ${containerId}`);
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

  async uninstallApp(id_app, uninstall_cmd = null, progressCallback = null) {
    try {
      this.logger.debug(`Uninstalling app: ${id_app}`);
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.uninstall',
        params: { appId: id_app }
      });
      return result.success !== false;
    } catch (error) {
      this.logger.error('Error uninstalling app:', error);
      throw error;
    }
  }

  async updateApp(id_app, appData) {
    try {
      this.logger.debug(`Updating app: ${id_app}`);
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.update',
        params: {
          appId: id_app,
          aliasName: appData.alias_name,
          launchArguments: appData.launch_arguments || appData.args,
          workDir: appData.work_dir
        }
      });
      return result.success !== false;
    } catch (error) {
      this.logger.error('Error updating app:', error);
      throw error;
    }
  }

  async removeApp(id_app) {
    try {
      this.logger.debug(`Removing app: ${id_app}`);
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.delete',
        params: { appId: id_app }
      });
      return result.success !== false;
    } catch (error) {
      this.logger.error('Error removing app:', error);
      throw error;
    }
  }

  async createDesktopShortcut(app, containerId) {
    try {
      this.logger.debug(`Creating desktop shortcut for: ${app.alias_name}`);
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.createDesktopShortcut',
        params: { appId: app.app_uuid, containerId }
      });
      return result.success !== false;
    } catch (error) {
      this.logger.error('Error creating desktop shortcut:', error);
      throw error;
    }
  }

  async createStartMenuShortcut(app, containerId) {
    try {
      this.logger.debug(`Creating start menu shortcut for: ${app.alias_name}`);
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.createStartMenuShortcut',
        params: { appId: app.app_uuid, containerId }
      });
      return result.success !== false;
    } catch (error) {
      this.logger.error('Error creating start menu shortcut:', error);
      throw error;
    }
  }

  async deleteDesktopShortcut(app) {
    try {
      this.logger.debug(`Deleting desktop shortcut for: ${app.alias_name}`);
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.deleteDesktopShortcut',
        params: { appId: app.app_uuid }
      });
      return result.success !== false;
    } catch (error) {
      this.logger.error('Error deleting desktop shortcut:', error);
      throw error;
    }
  }

  async deleteStartMenuShortcut(app) {
    try {
      this.logger.debug(`Deleting start menu shortcut for: ${app.alias_name}`);
      const result = await window.ipcRenderer.invoke('dserver-call', {
        method: 'app.deleteStartMenuShortcut',
        params: { appId: app.app_uuid }
      });
      return result.success !== false;
    } catch (error) {
      this.logger.error('Error deleting start menu shortcut:', error);
      throw error;
    }
  }

  getAppTypeEnum() {
    return {
      STANDARD_APP: 1,
      GREEN_MULTI_FILE: 2,
      GREEN_SINGLE_FILE: 3,
      STANDARD_APP_LNK: 4,
      UI_ADDED: 7
    };
  }

  _mapApp(app) {
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

module.exports = new AppManager();