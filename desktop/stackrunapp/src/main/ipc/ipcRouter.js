const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const logger = require('../../sdk/logger');
const i18n = require('../i18n');

class IpcRouter {
  constructor() {
    this._dserverClient = null;
    this._windowManager = null;
    this._taskScheduler = null;
    this._startupManager = null;
    this._handlers = {};
  }

  setDependencies(dserverClient, windowManager, taskScheduler, startupManager) {
    this._dserverClient = dserverClient;
    this._windowManager = windowManager;
    this._taskScheduler = taskScheduler;
    this._startupManager = startupManager;
  }

  registerHandlers() {
    this._registerWindowHandlers();
    this._registerLanguageHandlers();
    this._registerAppHandlers();
    this._registerDServerHandlers();
    this._registerTaskHandlers();
    this._registerFileHandlers();
    this._registerContainerHandlers();
    this._registerMenuHandlers();
  }

  _registerWindowHandlers() {
    ipcMain.handle('minimize-window', () => {
      this._windowManager.minimizeMainWindow();
      return { success: true };
    });

    ipcMain.handle('maximize-window', () => {
      this._windowManager.maximizeMainWindow();
      return { success: true };
    });

    ipcMain.handle('close-window', () => {
      this._windowManager.closeMainWindow();
      return { success: true };
    });

    ipcMain.handle('set-window-title', (_event, title) => {
      try {
        const mainWindow = this._windowManager.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setTitle(title);
        }
        return { success: true };
      } catch (e) {
        logger.error('[IpcRouter] Failed to set window title:', e);
        return { success: false, error: e.message };
      }
    });

    ipcMain.on('wizard-close', () => {
      this._windowManager.closeWizardWindow();
    });
  }

  _registerLanguageHandlers() {
    ipcMain.handle('set-language', (_event, lang) => {
      try {
        if (lang !== 'zh-CN' && lang !== 'en-US') {
          logger.warn('[IpcRouter] Invalid language received:', lang);
          return { success: false, message: 'invalid language', currentLang: i18n.getLanguage() };
        }
        i18n.setLanguage(lang);
        const current = i18n.getLanguage();
        logger.info('[IpcRouter] Main process language updated to:', current);
        return { success: true, currentLang: current };
      } catch (e) {
        logger.error('[IpcRouter] set-language failed:', e);
        return { success: false, message: e.message, currentLang: i18n.getLanguage() };
      }
    });

    ipcMain.handle('get-language', () => {
      return { success: true, currentLang: i18n.getLanguage() };
    });
  }

  _registerAppHandlers() {
    ipcMain.handle('app:getStartupMode', () => {
      const request = this._startupManager.getCurrentRequest();
      return { 
        mode: request?.type || 'NORMAL', 
        params: request ? request.toJSON() : {} 
      };
    });

    ipcMain.handle('app:closeSplash', async () => {
      await this._windowManager.closeSplashWindow();
      return { success: true };
    });

    ipcMain.handle('app:createSplash', (event, { appName }) => {
      this._windowManager.createSplashWindow(appName);
      return { success: true };
    });

    ipcMain.handle('app:setStartupMode', (event, { mode, params }) => {
      if (this._startupManager) {
        this._startupManager.currentRequest = { type: mode, ...params };
      }
      return { success: true };
    });

    ipcMain.handle('app:getGlobalState', () => {
      return {
        startMode: global.startMode,
        wizardType: global.wizardType,
        wizardFilePath: global.wizardFilePath
      };
    });

    ipcMain.handle('app:setGlobalState', (event, { key, value }) => {
      global[key] = value;
      return { success: true };
    });
  }

  _registerDServerHandlers() {
    ipcMain.handle('dserver:call', async (event, { method, params }) => {
      logger.info(`[IpcRouter] DServer call received: ${method}`);
      if (!this._dserverClient) {
        logger.warn(`[IpcRouter] DServer not connected yet for: ${method}`);
        return { success: false, message: 'DServer not connected yet' };
      }
      try {
        const result = await this._dserverClient.call(method, params);
        logger.info(`[IpcRouter] DServer call result: ${method} -> success`);
        return { success: true, data: result };
      } catch (error) {
        logger.error(`[IpcRouter] DServer call failed: ${method}`, error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('dserver:connect', async () => {
      if (!this._dserverClient) {
        return { success: false, error: 'DServer not initialized yet' };
      }
      try {
        await this._dserverClient.connect();
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('dserver:isConnected', () => {
      if (!this._dserverClient) {
        return false;
      }
      return this._dserverClient.isConnected();
    });

    ipcMain.handle('dserver:getToken', () => {
      if (!this._dserverClient) {
        return null;
      }
      return this._dserverClient.getToken();
    });

    ipcMain.handle('dserver:validateToken', async () => {
      const { TokenManager } = require('../../ipc/TokenManager');
      return await TokenManager.validateToken();
    });

    ipcMain.handle('dserver:checkStatus', async () => {
      if (!this._dserverClient) {
        return { success: false, message: 'DServer not connected yet' };
      }
      try {
        return await this._dserverClient.checkServerStatus();
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('dserver:hello', async () => {
      if (!this._dserverClient) {
        return { success: false, message: 'DServer not connected yet' };
      }
      try {
        const result = await this._dserverClient.hello();
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('dserver:prepareEnvironment', async () => {
      if (!this._dserverClient) {
        return { success: false, message: 'DServer not connected yet' };
      }
      try {
        const result = await this._dserverClient.prepareEnvironment();
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('dserver:cancelTask', async (event, { taskId }) => {
      if (!this._dserverClient) {
        return { success: false, error: 'DServer not connected yet' };
      }
      try {
        const result = await this._dserverClient.cancelTask(taskId);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('dserver:getActiveTasks', async () => {
      if (!this._dserverClient) {
        return { success: false, error: 'DServer not connected yet' };
      }
      try {
        const result = await this._dserverClient.getActiveTasks();
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('dserver:getTaskStatus', async (event, { taskId }) => {
      if (!this._dserverClient) {
        return { success: false, error: 'DServer not connected yet' };
      }
      try {
        const result = await this._dserverClient.getTaskStatus(taskId);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  }

  _registerTaskHandlers() {
    ipcMain.handle('task:enqueue', async (event, taskData) => {
      const task = {
        type: taskData.type,
        method: taskData.method,
        params: taskData.params,
        taskId: taskData.taskId,
        execute: async () => {
          try {
            if (this._windowManager.getMainWindow()) {
              this._windowManager.sendToMain('task:progress', { 
                taskId: taskData.taskId, 
                progress: 0, 
                message: '开始执行任务...' 
              });
            }
            
            const result = await this._dserverClient.call(taskData.method, taskData.params);
            
            if (this._windowManager.getMainWindow()) {
              this._windowManager.sendToMain('task:progress', { 
                taskId: taskData.taskId, 
                progress: 100, 
                message: '任务完成' 
              });
            }
            
            return result;
          } catch (error) {
            if (this._windowManager.getMainWindow()) {
              this._windowManager.sendToMain('task:progress', { 
                taskId: taskData.taskId, 
                progress: -1, 
                message: `任务失败: ${error.message}` 
              });
            }
            throw error;
          }
        }
      };
      
      const taskId = this._taskScheduler.enqueue(task);
      return { success: true, taskId, queueSize: this._taskScheduler.getQueueSize() };
    });

    ipcMain.handle('task:cancel', () => {
      this._taskScheduler.cancelCurrentTask();
      return { success: true };
    });

    ipcMain.handle('task:isBusy', () => {
      return this._taskScheduler.isBusy();
    });

    ipcMain.handle('task:getQueueSize', () => {
      return this._taskScheduler.getQueueSize();
    });
  }

  _registerFileHandlers() {
    ipcMain.handle('open-file-dialog', async (event, options) => {
      const win = this._windowManager.getMainWindow();
      if (!win) return { canceled: true, filePaths: [], success: false };

      try {
        if (win.isMinimized()) win.restore();

        let filters = options?.filters || [];
        filters = filters.filter(f => f && f.name && f.name.trim() && f.extensions && Array.isArray(f.extensions));
        if (filters.length === 0) {
          filters = [{ name: i18n.t('common.allFiles') || '所有文件', extensions: ['*'] }];
        }

        const dialogOptions = {
          title: options?.title || i18n.t('common.selectFile'),
          properties: options?.properties || ['openFile'],
          filters: filters
        };

        const result = await dialog.showOpenDialog(win, dialogOptions);
        setTimeout(() => { if (!win.isDestroyed()) win.focus(); }, 50);

        return {
          canceled: result.canceled,
          filePaths: result.filePaths || [],
          success: true
        };

      } catch (err) {
        return { canceled: true, filePaths: [], success: false, error: err.message };
      }
    });

    ipcMain.handle('save-file-dialog', async (event, options) => {
      const win = this._windowManager.getMainWindow();
      if (!win) return { canceled: true, filePath: '', success: false };

      try {
        if (win.isMinimized()) win.restore();

        const dialogOptions = {
          title: options?.title || i18n.t('common.saveFile'),
          defaultPath: options?.defaultPath || undefined,
          filters: options?.filters || [],
          showsTagField: false
        };

        const result = await dialog.showSaveDialog(win, dialogOptions);
        setTimeout(() => { if (!win.isDestroyed()) win.focus(); }, 50);

        return {
          canceled: result.canceled,
          filePath: result.filePath || '',
          success: true
        };

      } catch (err) {
        return { canceled: true, filePath: '', success: false, error: err.message };
      }
    });

    ipcMain.handle('read-file', async (event, { filePath }) => {
      try {
        let absolutePath = filePath;
        if (!path.isAbsolute(filePath)) {
          const rendererDir = path.join(__dirname, '../../renderer');
          absolutePath = path.join(rendererDir, filePath);
        }
        
        if (!fs.existsSync(absolutePath)) {
          logger.error('[IpcRouter] File not found:', absolutePath);
          return null;
        }
        const content = fs.readFileSync(absolutePath, 'utf8');
        return content;
      } catch (err) {
        logger.error('[IpcRouter] Failed to read file:', err);
        return null;
      }
    });

    ipcMain.handle('write-file', async (event, { filePath, content }) => {
      try {
        fs.writeFileSync(filePath, content, { encoding: 'utf8' });
        return { success: true };
      } catch (err) {
        logger.error('[IpcRouter] Failed to write file:', err);
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('open-path', async (event, filePath) => {
      try {
        const { shell } = require('electron');
        
        let absolutePath = filePath;
        if (!path.isAbsolute(filePath)) {
          const rendererDir = path.join(__dirname, '../../renderer');
          absolutePath = path.join(rendererDir, filePath);
        }
        
        logger.info('[IpcRouter] Opening file:', absolutePath);
        if (!fs.existsSync(absolutePath)) {
          logger.error('[IpcRouter] File not found:', absolutePath);
          return { success: false, error: '文件不存在' };
        }
        const result = await shell.openPath(absolutePath);
        return { success: result === '' ? true : false, error: result || '' };
      } catch (err) {
        logger.error('[IpcRouter] Failed to open file:', err);
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('get-assets-path', async (event) => {
      const resourcesPath = process.resourcesPath;
      const packagedAssetsPath = path.join(resourcesPath, 'assets');
      if (fs.existsSync(packagedAssetsPath)) {
        return packagedAssetsPath;
      }
      const devAssetsPath = path.join(__dirname, '../../../assets');
      if (fs.existsSync(devAssetsPath)) {
        return devAssetsPath;
      }
      const appAssetsPath = path.join(app.getAppPath(), 'assets');
      if (fs.existsSync(appAssetsPath)) {
        return appAssetsPath;
      }
      return packagedAssetsPath;
    });

    ipcMain.handle('file-exists', async (event, filePath) => {
      try {
        return fs.existsSync(filePath);
      } catch (err) {
        return false;
      }
    });

    ipcMain.handle('check-disk-space', async () => {
      try {
        const os = require('os');
        
        const freeSpace = await new Promise((resolve) => {
          if (process.platform === 'win32') {
            resolve(os.freemem());
          } else {
            fs.statfs('/', (err, stats) => {
              if (err) {
                resolve(os.freemem());
              } else {
                resolve(stats.bavail * stats.bsize);
              }
            });
          }
        });
        
        const freeSpaceGB = freeSpace / (1024 * 1024 * 1024);
        
        return {
          success: true,
          freeSpaceGB: freeSpaceGB
        };
      } catch (error) {
        logger.error('[IpcRouter] Error checking disk space:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });
  }

  _registerContainerHandlers() {
    ipcMain.handle('get-containers', async () => {
      try {
        logger.info('[IpcRouter] get-containers called');
        const result = await this._dserverClient.call('container.list', {});
        let containers = [];
        if (typeof result === 'string') {
          containers = JSON.parse(result);
        } else if (result && result.containers) {
          containers = result.containers;
        } else if (Array.isArray(result)) {
          containers = result;
        }
        return { success: true, result: containers };
      } catch (error) {
        logger.error('[IpcRouter] Failed to get containers:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('container.create', async (event, { name, description, type, os_type, is_default }) => {
      try {
        const result = await this._dserverClient.call('container.create', {
          name,
          description,
          type: type || 4,
          os_type: os_type || 4,
          is_default: is_default || 0
        });
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to create container:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('import-container', async (event, { path, name }) => {
      try {
        const result = await this._dserverClient.call('container.import', { filePath: path, name });
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to import container:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('export-container', async (event, { containerId, path }) => {
      try {
        const result = await this._dserverClient.call('container.export', { containerId, filePath: path });
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to export container:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('delete-container', async (event, { id, deleteType }) => {
      try {
        const result = await this._dserverClient.call('container.delete', { containerId: id, deleteType });
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to delete container:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('restore-container', async (event, { containerId }) => {
      try {
        const result = await this._dserverClient.call('container.restore', { containerId });
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to restore container:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('purge-container', async (event, { containerId }) => {
      try {
        const result = await this._dserverClient.call('container.delete', { containerId, permanent: 1 });
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to purge container:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('get-trash-containers', async () => {
      try {
        const result = await this._dserverClient.call('container.list', { includeTrash: 1 });
        return { success: true, result: result || [] };
      } catch (error) {
        logger.error('[IpcRouter] Failed to get trash containers:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('ensure-default-container', async (event, params) => {
      logger.info('[IpcRouter] Ensuring default workspace...');
      try {
        const listResult = await this._dserverClient.call('container.list', {});
        let containers = [];
        if (listResult) {
          if (Array.isArray(listResult)) {
            containers = listResult;
          } else if (listResult.result && Array.isArray(listResult.result)) {
            containers = listResult.result;
          } else if (listResult.data && Array.isArray(listResult.data)) {
            containers = listResult.data;
          } else if (listResult.containers && Array.isArray(listResult.containers)) {
            containers = listResult.containers;
          }
        }
        const defaultContainer = containers.find(c => c.is_default === 1);
        if (defaultContainer) {
          logger.info('[IpcRouter] Default workspace already exists:', defaultContainer.guid);
          return { success: true, result: defaultContainer, alreadyExists: true };
        }

        const handshakeResult = await this._dserverClient.handshake();
        if (handshakeResult && handshakeResult.server_state === 'initializing' && handshakeResult.init_task_id) {
          const initTaskId = Array.isArray(handshakeResult.init_task_id) 
            ? handshakeResult.init_task_id[0] 
            : handshakeResult.init_task_id;
          logger.info('[IpcRouter] Server is initializing, waiting for init task:', initTaskId);
          
          return new Promise((resolve) => {
            const cleanup = () => {
              this._eventClient.unsubscribe('task.completed', taskCompletedHandler);
              this._eventClient.unsubscribe('task.failed', taskFailedHandler);
            };
            
            const taskCompletedHandler = (data) => {
              if (data && data.task_id === initTaskId) {
                cleanup();
                logger.info('[IpcRouter] Init task completed:', data);
                resolve({ success: true, result: data.result, initTaskCompleted: true });
              }
            };
            
            const taskFailedHandler = (data) => {
              if (data && data.task_id === initTaskId) {
                cleanup();
                logger.error('[IpcRouter] Init task failed:', data);
                resolve({ success: false, error: data.error_message || 'Initialization failed' });
              }
            };
            
            this._eventClient.subscribe('task.completed', taskCompletedHandler);
            this._eventClient.subscribe('task.failed', taskFailedHandler);
          });
        }

        const name = params && params.name ? params.name : '默认工作区';
        const result = await this._dserverClient.call('container.create', {
          name: name,
          description: '系统提供默认工作区',
          type: 4,
          os_type: 4,
          is_default: 1
        });
        logger.info('[IpcRouter] Default workspace created:', result);
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to ensure default workspace:', error);
        return { success: false, error: error.message || String(error) };
      }
    });

    ipcMain.handle('show-container-context-menu', async (event, { x, y, containerId, containerPath }) => {
      const { Menu, BrowserWindow } = require('electron');
      const win = BrowserWindow.fromWebContents(event.sender);
      
      let containerConfig = {};
      try {
        const configResult = await this._dserverClient.call('container.get_config', { container_id: containerId });
        if (configResult && typeof configResult === 'object') {
          containerConfig = configResult;
        }
      } catch (error) {
        console.error('[IpcRouter] Failed to get container config:', error);
      }
      
      const currentVirtualDesktop = containerConfig.virtual_desktop || '0x0';
      const currentDisplaySystem = containerConfig.display_system || 'auto';
      const currentUiScale = containerConfig.ui_scale || 100;
      const currentGraphicsBackend = containerConfig.graphics_backend || 'auto';
      const currentWindowMode = containerConfig.window_mode || 'managed';
      const currentWindowDecoration = containerConfig.window_decoration || 'native';
      
      const toolsSubmenu = [
        {
          label: i18n.t('contextMenu.openSystemCdrive'),
          click: () => {
            win.webContents.executeJavaScript(`openSystemCdrive('${containerId}')`);
          }
        },
        { type: 'separator' },
        {
          label: i18n.t('contextMenu.openRegistry'),
          click: () => {
            win.webContents.executeJavaScript(`openRegistry('${containerId}')`);
          }
        },
        {
          label: i18n.t('contextMenu.openCommandLine'),
          click: () => {
            win.webContents.executeJavaScript(`openCommandLine('${containerId}')`);
          }
        },
        {
          label: i18n.t('contextMenu.openInternetOptions'),
          click: () => {
            win.webContents.executeJavaScript(`openInternetOptions('${containerId}')`);
          }
        },
        {
          label: i18n.t('contextMenu.openGameController'),
          click: () => {
            win.webContents.executeJavaScript(`openGameController('${containerId}')`);
          }
        },
        { type: 'separator' },
        {
          label: i18n.t('contextMenu.openControlPanel'),
          click: () => {
            win.webContents.executeJavaScript(`openControlPanel('${containerId}')`);
          }
        },
        {
          label: i18n.t('contextMenu.openTaskManager'),
          click: () => {
            win.webContents.executeJavaScript(`openTaskManager('${containerId}')`);
          }
        },
        { type: 'separator' },
        {
          label: i18n.t('contextMenu.installComponent'),
          click: () => {
            win.webContents.executeJavaScript(`showInstallComponentModal('${containerId}')`);
          }
        },
        {
          label: i18n.t('contextMenu.simulateRestart'),
          click: () => {
            win.webContents.executeJavaScript(`simulateRestart('${containerId}')`);
          }
        }
      ];
      
      const virtualDesktopSubmenu = [
        { label: i18n.t('contextMenu.off'), type: 'checkbox', checked: currentVirtualDesktop === '0x0', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '0x0')`) },
        { label: '640 x 480', type: 'checkbox', checked: currentVirtualDesktop === '640x480', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '640x480')`) },
        { label: '800 x 600', type: 'checkbox', checked: currentVirtualDesktop === '800x600', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '800x600')`) },
        { label: '1024 x 768', type: 'checkbox', checked: currentVirtualDesktop === '1024x768', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '1024x768')`) },
        { label: '1280 x 1024', type: 'checkbox', checked: currentVirtualDesktop === '1280x1024', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '1280x1024')`) },
        { label: '1440 x 900', type: 'checkbox', checked: currentVirtualDesktop === '1440x900', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '1440x900')`) },
        { label: '1600 x 900', type: 'checkbox', checked: currentVirtualDesktop === '1600x900', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '1600x900')`) },
        { label: '1600 x 1200', type: 'checkbox', checked: currentVirtualDesktop === '1600x1200', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '1600x1200')`) },
        { label: '1920 x 1080', type: 'checkbox', checked: currentVirtualDesktop === '1920x1080', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '1920x1080')`) }
      ];
      
      const displaySystemSubmenu = [
        { label: i18n.t('contextMenu.auto'), type: 'checkbox', checked: currentDisplaySystem === 'auto', click: () => win.webContents.executeJavaScript(`setDisplaySystem('${containerId}', 'auto')`) },
        { label: 'Wayland', type: 'checkbox', checked: currentDisplaySystem === 'wayland', click: () => win.webContents.executeJavaScript(`setDisplaySystem('${containerId}', 'wayland')`) },
        { label: 'X11', type: 'checkbox', checked: currentDisplaySystem === 'x11', click: () => win.webContents.executeJavaScript(`setDisplaySystem('${containerId}', 'x11')`) }
      ];
      
      const uiScaleSubmenu = [
        { label: '100%', type: 'checkbox', checked: currentUiScale === 100, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '100')`) },
        { label: '125%', type: 'checkbox', checked: currentUiScale === 125, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '125')`) },
        { label: '150%', type: 'checkbox', checked: currentUiScale === 150, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '150')`) },
        { label: '175%', type: 'checkbox', checked: currentUiScale === 175, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '175')`) },
        { label: '200%', type: 'checkbox', checked: currentUiScale === 200, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '200')`) },
        { label: '225%', type: 'checkbox', checked: currentUiScale === 225, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '225')`) },
        { label: '250%', type: 'checkbox', checked: currentUiScale === 250, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '250')`) },
        { label: '300%', type: 'checkbox', checked: currentUiScale === 300, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '300')`) }
      ];
      
      const graphicsAccelSubmenu = [
        { label: i18n.t('contextMenu.auto'), type: 'checkbox', checked: currentGraphicsBackend === 'auto', click: () => win.webContents.executeJavaScript(`setGraphicsBackend('${containerId}', 'auto')`) },
        { label: 'Vulkan (DXVK)', type: 'checkbox', checked: currentGraphicsBackend === 'dxvk', click: () => win.webContents.executeJavaScript(`setGraphicsBackend('${containerId}', 'dxvk')`) },
        { label: 'OpenGL', type: 'checkbox', checked: currentGraphicsBackend === 'opengl', click: () => win.webContents.executeJavaScript(`setGraphicsBackend('${containerId}', 'opengl')`) },
        { label: i18n.t('contextMenu.graphicsSoftwareRender'), type: 'checkbox', checked: currentGraphicsBackend === 'llvmpipe', click: () => win.webContents.executeJavaScript(`setGraphicsBackend('${containerId}', 'llvmpipe')`) }
      ];
      
      const windowModeSubmenu = [
        { label: i18n.t('contextMenu.systemManaged'), type: 'checkbox', checked: currentWindowMode === 'managed', click: () => win.webContents.executeJavaScript(`setWindowMode('${containerId}', 'managed')`) },
        { label: i18n.t('contextMenu.appManaged'), type: 'checkbox', checked: currentWindowMode === 'unmanaged', click: () => win.webContents.executeJavaScript(`setWindowMode('${containerId}', 'unmanaged')`) }
      ];
      
      const windowDecorationSubmenu = [
        { label: i18n.t('contextMenu.systemStyle'), type: 'checkbox', checked: currentWindowDecoration === 'native', click: () => win.webContents.executeJavaScript(`setWindowDecoration('${containerId}', 'native')`) },
        { label: i18n.t('contextMenu.appStyle'), type: 'checkbox', checked: currentWindowDecoration === 'custom', click: () => win.webContents.executeJavaScript(`setWindowDecoration('${containerId}', 'custom')`) }
      ];
      
      const containerSettingsSubmenu = [
        { label: i18n.t('contextMenu.virtualDesktop'), submenu: virtualDesktopSubmenu },
        { label: i18n.t('contextMenu.displaySystem'), submenu: displaySystemSubmenu },
        { label: i18n.t('contextMenu.uiScale'), submenu: uiScaleSubmenu },
        { label: i18n.t('contextMenu.graphicsAcceleration'), submenu: graphicsAccelSubmenu },
        { label: i18n.t('contextMenu.windowMode'), submenu: windowModeSubmenu },
        { label: i18n.t('contextMenu.windowDecoration'), submenu: windowDecorationSubmenu }
      ];
      
      const sortByDateCheckedRaw = await win.webContents.executeJavaScript('localStorage.getItem("appSortBy") || "date"');
      const sortByDateChecked = typeof sortByDateCheckedRaw === 'string' ? sortByDateCheckedRaw : 'date';
      const sortSubmenu = [
        { 
          label: i18n.t('contextMenu.sortByInstallTime'), 
          type: 'checkbox', 
          checked: sortByDateChecked === 'date',
          click: () => {
            win.webContents.executeJavaScript(`setAppSortBy('date')`);
          }
        },
        { 
          label: i18n.t('contextMenu.sortByName'), 
          type: 'checkbox', 
          checked: sortByDateChecked === 'name',
          click: () => {
            win.webContents.executeJavaScript(`setAppSortBy('name')`);
          }
        }
      ];
      
      const containerMenu = Menu.buildFromTemplate([
        {
          label: i18n.t('contextMenu.addShortcut'),
          click: () => {
            win.webContents.executeJavaScript(`showAddShortcutModal('${containerId}')`);
          }
        },
        {
          label: i18n.t('contextMenu.closeAllApps'),
          click: () => {
            win.webContents.executeJavaScript(`closeAllAppsInContainer('${containerId}')`);
          }
        },
        { type: 'separator' },
        {
          label: i18n.t('contextMenu.tools'),
          submenu: toolsSubmenu
        },
        {
          label: i18n.t('contextMenu.workspaceSettings'),
          submenu: containerSettingsSubmenu
        },
        { type: 'separator' },
        {
          label: i18n.t('contextMenu.iconSortBy'),
          submenu: sortSubmenu
        },
        { type: 'separator' },
        {
          label: i18n.t('contextMenu.refresh'),
          click: () => {
            win.webContents.executeJavaScript(`refreshContainerApps('${containerId}')`);
          }
        }
      ]);
      containerMenu.popup({ window: win, x, y });
      return { success: true };
    });
    
    ipcMain.handle('show-container-more-menu', async (event, { x, y, containerId, containerPath }) => {
      const { Menu, BrowserWindow } = require('electron');
      const win = BrowserWindow.fromWebContents(event.sender);
      
      let containerConfig = {};
      try {
        const configResult = await this._dserverClient.call('container.get_config', { container_id: containerId });
        if (configResult && typeof configResult === 'object') {
          containerConfig = configResult;
        }
      } catch (error) {
        console.error('[IpcRouter] Failed to get container config:', error);
      }
      
      const currentVirtualDesktop = containerConfig.virtual_desktop || '0x0';
      const currentDisplaySystem = containerConfig.display_system || 'auto';
      const currentUiScale = containerConfig.ui_scale || 100;
      const currentGraphicsBackend = containerConfig.graphics_backend || 'auto';
      const currentWindowMode = containerConfig.window_mode || 'managed';
      const currentWindowDecoration = containerConfig.window_decoration || 'native';
      
      const toolsSubmenu = [
        {
          label: i18n.t('contextMenu.openSystemCdrive'),
          click: () => {
            win.webContents.executeJavaScript(`openSystemCdrive('${containerId}')`);
          }
        },
        { type: 'separator' },
        {
          label: i18n.t('contextMenu.openRegistry'),
          click: () => {
            win.webContents.executeJavaScript(`openRegistry('${containerId}')`);
          }
        },
        {
          label: i18n.t('contextMenu.openCommandLine'),
          click: () => {
            win.webContents.executeJavaScript(`openCommandLine('${containerId}')`);
          }
        },
        {
          label: i18n.t('contextMenu.openInternetOptions'),
          click: () => {
            win.webContents.executeJavaScript(`openInternetOptions('${containerId}')`);
          }
        },
        {
          label: i18n.t('contextMenu.openGameController'),
          click: () => {
            win.webContents.executeJavaScript(`openGameController('${containerId}')`);
          }
        },
        { type: 'separator' },
        {
          label: i18n.t('contextMenu.openControlPanel'),
          click: () => {
            win.webContents.executeJavaScript(`openControlPanel('${containerId}')`);
          }
        },
        {
          label: i18n.t('contextMenu.openTaskManager'),
          click: () => {
            win.webContents.executeJavaScript(`openTaskManager('${containerId}')`);
          }
        },
        { type: 'separator' },
        {
          label: i18n.t('contextMenu.installComponent'),
          click: () => {
            win.webContents.executeJavaScript(`showInstallComponentModal('${containerId}')`);
          }
        },
        {
          label: i18n.t('contextMenu.simulateRestart'),
          click: () => {
            win.webContents.executeJavaScript(`simulateRestart('${containerId}')`);
          }
        }
      ];
      
      const virtualDesktopSubmenu = [
        { label: i18n.t('contextMenu.off'), type: 'checkbox', checked: currentVirtualDesktop === '0x0', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '0x0')`) },
        { label: '640 x 480', type: 'checkbox', checked: currentVirtualDesktop === '640x480', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '640x480')`) },
        { label: '800 x 600', type: 'checkbox', checked: currentVirtualDesktop === '800x600', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '800x600')`) },
        { label: '1024 x 768', type: 'checkbox', checked: currentVirtualDesktop === '1024x768', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '1024x768')`) },
        { label: '1280 x 1024', type: 'checkbox', checked: currentVirtualDesktop === '1280x1024', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '1280x1024')`) },
        { label: '1440 x 900', type: 'checkbox', checked: currentVirtualDesktop === '1440x900', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '1440x900')`) },
        { label: '1600 x 900', type: 'checkbox', checked: currentVirtualDesktop === '1600x900', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '1600x900')`) },
        { label: '1600 x 1200', type: 'checkbox', checked: currentVirtualDesktop === '1600x1200', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '1600x1200')`) },
        { label: '1920 x 1080', type: 'checkbox', checked: currentVirtualDesktop === '1920x1080', click: () => win.webContents.executeJavaScript(`setVirtualDesktop('${containerId}', '1920x1080')`) }
      ];
      
      const displaySystemSubmenu = [
        { label: i18n.t('contextMenu.auto'), type: 'checkbox', checked: currentDisplaySystem === 'auto', click: () => win.webContents.executeJavaScript(`setDisplaySystem('${containerId}', 'auto')`) },
        { label: 'Wayland', type: 'checkbox', checked: currentDisplaySystem === 'wayland', click: () => win.webContents.executeJavaScript(`setDisplaySystem('${containerId}', 'wayland')`) },
        { label: 'X11', type: 'checkbox', checked: currentDisplaySystem === 'x11', click: () => win.webContents.executeJavaScript(`setDisplaySystem('${containerId}', 'x11')`) }
      ];
      
      const uiScaleSubmenu = [
        { label: '100%', type: 'checkbox', checked: currentUiScale === 100, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '100')`) },
        { label: '125%', type: 'checkbox', checked: currentUiScale === 125, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '125')`) },
        { label: '150%', type: 'checkbox', checked: currentUiScale === 150, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '150')`) },
        { label: '175%', type: 'checkbox', checked: currentUiScale === 175, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '175')`) },
        { label: '200%', type: 'checkbox', checked: currentUiScale === 200, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '200')`) },
        { label: '225%', type: 'checkbox', checked: currentUiScale === 225, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '225')`) },
        { label: '250%', type: 'checkbox', checked: currentUiScale === 250, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '250')`) },
        { label: '300%', type: 'checkbox', checked: currentUiScale === 300, click: () => win.webContents.executeJavaScript(`setUiScale('${containerId}', '300')`) }
      ];
      
      const graphicsAccelSubmenu = [
        { label: i18n.t('contextMenu.auto'), type: 'checkbox', checked: currentGraphicsBackend === 'auto', click: () => win.webContents.executeJavaScript(`setGraphicsBackend('${containerId}', 'auto')`) },
        { label: 'Vulkan (DXVK)', type: 'checkbox', checked: currentGraphicsBackend === 'dxvk', click: () => win.webContents.executeJavaScript(`setGraphicsBackend('${containerId}', 'dxvk')`) },
        { label: 'OpenGL', type: 'checkbox', checked: currentGraphicsBackend === 'opengl', click: () => win.webContents.executeJavaScript(`setGraphicsBackend('${containerId}', 'opengl')`) },
        { label: i18n.t('contextMenu.graphicsSoftwareRender'), type: 'checkbox', checked: currentGraphicsBackend === 'llvmpipe', click: () => win.webContents.executeJavaScript(`setGraphicsBackend('${containerId}', 'llvmpipe')`) }
      ];
      
      const windowModeSubmenu = [
        { label: i18n.t('contextMenu.systemManaged'), type: 'checkbox', checked: currentWindowMode === 'managed', click: () => win.webContents.executeJavaScript(`setWindowMode('${containerId}', 'managed')`) },
        { label: i18n.t('contextMenu.appManaged'), type: 'checkbox', checked: currentWindowMode === 'unmanaged', click: () => win.webContents.executeJavaScript(`setWindowMode('${containerId}', 'unmanaged')`) }
      ];
      
      const windowDecorationSubmenu = [
        { label: i18n.t('contextMenu.systemStyle'), type: 'checkbox', checked: currentWindowDecoration === 'native', click: () => win.webContents.executeJavaScript(`setWindowDecoration('${containerId}', 'native')`) },
        { label: i18n.t('contextMenu.appStyle'), type: 'checkbox', checked: currentWindowDecoration === 'custom', click: () => win.webContents.executeJavaScript(`setWindowDecoration('${containerId}', 'custom')`) }
      ];
      
      const containerSettingsSubmenu = [
        { label: i18n.t('contextMenu.virtualDesktop'), submenu: virtualDesktopSubmenu },
        { label: i18n.t('contextMenu.displaySystem'), submenu: displaySystemSubmenu },
        { label: i18n.t('contextMenu.uiScale'), submenu: uiScaleSubmenu },
        { label: i18n.t('contextMenu.graphicsAcceleration'), submenu: graphicsAccelSubmenu },
        { label: i18n.t('contextMenu.windowMode'), submenu: windowModeSubmenu },
        { label: i18n.t('contextMenu.windowDecoration'), submenu: windowDecorationSubmenu }
      ];
      
      const sortByDateCheckedRaw = await win.webContents.executeJavaScript('localStorage.getItem("appSortBy") || "date"');
      const sortByDateChecked = typeof sortByDateCheckedRaw === 'string' ? sortByDateCheckedRaw : 'date';
      const sortSubmenu = [
        { 
          label: i18n.t('contextMenu.sortByInstallTime'), 
          type: 'checkbox', 
          checked: sortByDateChecked === 'date',
          click: () => {
            win.webContents.executeJavaScript(`setAppSortBy('date')`);
          }
        },
        { 
          label: i18n.t('contextMenu.sortByName'), 
          type: 'checkbox', 
          checked: sortByDateChecked === 'name',
          click: () => {
            win.webContents.executeJavaScript(`setAppSortBy('name')`);
          }
        }
      ];
      
      const containerMenu = Menu.buildFromTemplate([
        {
          label: i18n.t('contextMenu.addShortcut'),
          click: () => {
            win.webContents.executeJavaScript(`showAddShortcutModal('${containerId}')`);
          }
        },
        {
          label: i18n.t('contextMenu.closeAllApps'),
          click: () => {
            win.webContents.executeJavaScript(`closeAllAppsInContainer('${containerId}')`);
          }
        },
        { type: 'separator' },
        {
          label: i18n.t('contextMenu.tools'),
          submenu: toolsSubmenu
        },
        {
          label: i18n.t('contextMenu.workspaceSettings'),
          submenu: containerSettingsSubmenu
        },
        { type: 'separator' },
        {
          label: i18n.t('contextMenu.iconSortBy'),
          submenu: sortSubmenu
        },
        { type: 'separator' },
        {
          label: i18n.t('contextMenu.refresh'),
          click: () => {
            win.webContents.executeJavaScript(`refreshContainerApps('${containerId}')`);
          }
        }
      ]);
      containerMenu.popup({ window: win, x, y });
      return { success: true };
    });
  }

  _registerAppHandlers() {
    ipcMain.handle('get-apps', async (event, containerId) => {
      try {
        logger.info(`[IpcRouter] get-apps called for containerId: ${containerId}`);
        const result = await this._dserverClient.call('app.list', { containerId });
        let apps = [];
        if (result && result.apps) {
          apps = result.apps;
        } else if (Array.isArray(result)) {
          apps = result;
        }
        return { success: true, result: apps };
      } catch (error) {
        logger.error('[IpcRouter] Failed to get apps:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('add-app', async (event, { path, type, containerId, createShortcut }) => {
      try {
        const result = await this._dserverClient.call('container.app.add', {
          containerId,
          filePath: path,
          appType: type,
          createShortcut
        });
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to add app:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('launch-app', async (event, containerId, appId) => {
      try {
        const result = await this._dserverClient.call('app.run', { containerId, appId });
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to launch app:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('uninstall-app', async (event, containerId, appId) => {
      try {
        const result = await this._dserverClient.call('container.app.remove', { containerId, appId });
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to uninstall app:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('update-app', async (event, { containerId, appId, name, args, env, kernelArgs }) => {
      try {
        const result = await this._dserverClient.call('container.app.update', {
          containerId,
          appId,
          name,
          args,
          env,
          kernelArgs
        });
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to update app:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('add-shortcut', async (event, { containerId, name, path, args, env, kernelArgs }) => {
      try {
        const result = await this._dserverClient.call('container.shortcut.add', {
          containerId,
          name,
          filePath: path,
          args,
          env,
          kernelArgs
        });
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to add shortcut:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('app-check-installed', async (event, { containerId, filePath }) => {
      try {
        const result = await this._dserverClient.call('app.checkInstalled', { containerId, exePath: filePath });
        return { success: true, result: result || false };
      } catch (error) {
        logger.error('[IpcRouter] Failed to check app installed:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('close-all-apps', async (event, containerId) => {
      try {
        const result = await this._dserverClient.call('container.apps.close', { containerId });
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to close all apps:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('show-app-context-menu', async (event, { x, y, appId, containerId }) => {
      const { Menu, BrowserWindow } = require('electron');
      const win = BrowserWindow.fromWebContents(event.sender);
      const safeAppId = appId !== undefined && appId !== null ? appId : '';
      const safeContainerId = containerId !== undefined && containerId !== null ? containerId : '';
      const appMenu = Menu.buildFromTemplate([
        {
          label: i18n.t('contextMenu.appSettings'),
          click: () => {
            win.webContents.executeJavaScript(`openAppSettingsFromContextMenu(${JSON.stringify(safeAppId)}, ${JSON.stringify(safeContainerId)})`);
          }
        },
        {
          label: i18n.t('contextMenu.openAppPath'),
          click: () => {
            win.webContents.executeJavaScript(`openAppPathFromContextMenu(${JSON.stringify(safeAppId)}, ${JSON.stringify(safeContainerId)})`);
          }
        },
        {
          label: i18n.t('contextMenu.createDesktopShortcut'),
          click: () => {
            win.webContents.executeJavaScript(`createAppDesktopShortcutFromContextMenu(${JSON.stringify(safeAppId)}, ${JSON.stringify(safeContainerId)})`);
          }
        },
        { type: 'separator' },
        {
          label: i18n.t('common.delete'),
          click: () => {
            win.webContents.executeJavaScript(`deleteAppFromContextMenu(${JSON.stringify(safeAppId)}, ${JSON.stringify(safeContainerId)})`);
          }
        }
      ]);
      appMenu.popup({ window: win, x, y });
      return { success: true };
    });

    ipcMain.handle('install-component', async (event, { containerId, name, force, confirmToken }) => {
      try {
        const result = await this._dserverClient.call('wine.install_components', {
          container_id: containerId,
          components: name,
          force,
          confirm_token: confirmToken
        });
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to install component:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('cancel-install', async (event, { containerId, confirmToken }) => {
      try {
        const result = await this._dserverClient.call('wine.cancel_install', {
          container_id: containerId,
          confirm_token: confirmToken
        });
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to cancel install:', error);
        return { success: false, message: error.message };
      }
    });

    ipcMain.handle('import-font', async (event, { containerId, fontPath }) => {
      try {
        const result = await this._dserverClient.call('container.font.import', { containerId, fontPath });
        return { success: true, result };
      } catch (error) {
        logger.error('[IpcRouter] Failed to import font:', error);
        return { success: false, message: error.message };
      }
    });
  }

  _registerMenuHandlers() {
    ipcMain.handle('show-more-menu', async (event, { x, y }) => {
      const { Menu, BrowserWindow } = require('electron');
      const win = BrowserWindow.fromWebContents(event.sender);
      const moreMenu = Menu.buildFromTemplate([
        {
          label: i18n.t('moreMenu.newContainer'),
          click: () => {
            win.webContents.send('menu-action', { action: 'create-container' });
          }
        },
        {
          label: i18n.t('moreMenu.importContainer'),
          click: () => {
            win.webContents.send('menu-action', { action: 'import-container' });
          }
        },
        {
          label: i18n.t('moreMenu.containerTrash'),
          click: () => {
            win.webContents.send('menu-action', { action: 'container-trash' });
          }
        },
        { type: 'separator' },
        {
          label: i18n.t('moreMenu.closeAllApps'),
          click: () => {
            win.webContents.send('menu-action', { action: 'close-all-apps' });
          }
        },
        {
          label: i18n.t('moreMenu.importFonts'),
          click: () => {
            win.webContents.send('menu-action', { action: 'import-font' });
          }
        },
        { type: 'separator' },
        {
          label: i18n.t('common.general'),
          click: () => {
            win.webContents.send('menu-action', { action: 'settings' });
          }
        },
        { type: 'separator' },
        {
          label: i18n.t('common.help'),
          click: () => {
            win.webContents.send('menu-action', { action: 'help' });
          }
        },
        {
          label: i18n.t('common.about'),
          click: () => {
            win.webContents.send('menu-action', { action: 'about' });
          }
        }
      ]);
      moreMenu.popup({ window: win, x, y });
      return { success: true };
    });

    ipcMain.handle('show-about', () => {
      this._windowManager.sendToMain('menu-action', { action: 'about' });
      return { success: true };
    });

    ipcMain.handle('write-log', (event, message) => {
      logger.info(message);
      return { success: true };
    });

    ipcMain.on('renderer-log', (event, message) => {
      logger.info(message);
    });

    ipcMain.on('switch-to-main-layout', () => {
      this._windowManager.showMainWindow();
      this._windowManager.closeWizardWindow();
    });

    ipcMain.on('wizard-complete', () => {
      logger.info('[IpcRouter] Wizard completed');
      this._windowManager.closeWizardWindow();
    });

    ipcMain.on('show-confirm-dialog', async (event, options) => {
      const win = this._windowManager.getMainWindow();
      if (!win) return;

      const result = await dialog.showMessageBox(win, {
        type: 'question',
        title: options.title || i18n.t('common.confirm'),
        message: options.message,
        detail: options.detail,
        buttons: options.buttons || [i18n.t('common.cancel'), i18n.t('common.confirm')],
        defaultId: 0,
        cancelId: 0
      });

      event.reply('confirm-dialog-result', result);
    });
  }

  setEventClient(eventClient) {
    this._eventClient = eventClient;
  }
}

module.exports = { IpcRouter };
