const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
process.env.NODE_ENV = 'production';

if (process.platform === 'linux' && !process.env.DISPLAY) {
  process.env.DISPLAY = ':0';
  console.log('[DIAGNOSTIC] DISPLAY not set, defaulting to:', process.env.DISPLAY);
}

app.disableHardwareAcceleration();

if (process.platform === 'linux') {
  try {
    const appIcon = path.join(__dirname, '../../assets/images/logo.png');
    if (fs.existsSync(appIcon)) {
      app.commandLine.appendSwitch('app-icon', appIcon);
    }
    app.commandLine.appendSwitch('class', 'stackrun');
  } catch (e) {
    console.error('[Main] Failed to set app icon:', e.message);
  }
}

const logDir = path.join(app.getPath('userData'), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, `app-${Date.now()}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

const originalStdout = process.stdout.write;
const originalStderr = process.stderr.write;

process.stdout.write = function(chunk, encoding, callback) {
  logStream.write(chunk, encoding);
  return originalStdout.call(this, chunk, encoding, callback);
};

process.stderr.write = function(chunk, encoding, callback) {
  logStream.write(chunk, encoding);
  return originalStderr.call(this, chunk, encoding, callback);
};

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-dev-shm-usage');
}

if (process.platform === 'linux') {
  app.setName('stackrun');
}

app.on('browser-window-created', (event, win) => {
  win.webContents.on('devtools-opened', () => {
    win.webContents.closeDevTools();
  });
  
  win.webContents.on('before-input-event', (event, input) => {
    if ((input.key === 'F12') ||
        (input.key === 'i' && input.control && input.shift) ||
        (input.key === 'I' && input.control && input.shift) ||
        (input.key === 'j' && input.control && input.shift) ||
        (input.key === 'J' && input.control && input.shift) ||
        (input.key === 'k' && input.control && input.shift) ||
        (input.key === 'K' && input.control && input.shift)) {
      event.preventDefault();
    }
  });
});

const { StartupRequest } = require('./startup/startupManager');

console.log('[DIAGNOSTIC] process.argv:', process.argv);
const startupRequest = StartupRequest.fromCommandLine(process.argv);
const isLauncherMode = startupRequest.type === 'RUN_APP';
const isManagerMode = !isLauncherMode;

console.log('[DIAGNOSTIC] Startup mode:', isLauncherMode ? 'Launcher' : 'Manager');
console.log('[DIAGNOSTIC] Request type:', startupRequest.type);

if (isManagerMode) {
  const gotTheLock = app.requestSingleInstanceLock();
  
  if (!gotTheLock) {
    app.quit();
  } else {
    let globalWindowManager = null;
    let globalStartupManager = null;
    
    app.on('second-instance', async (event, commandLine, workingDirectory) => {
      const request = StartupRequest.fromCommandLine(commandLine);
      console.log('[DIAGNOSTIC] Second instance detected:', request.type);
      
      if (globalWindowManager) {
        globalWindowManager.showMainWindow();
      }
      
      if (globalStartupManager) {
        await globalStartupManager.handleSecondInstance(request);
      }
    });
    
    startManagerMode(startupRequest, (wm, sm) => {
      globalWindowManager = wm;
      globalStartupManager = sm;
    });
  }
} else {
  startLauncherMode(startupRequest);
}

async function startLauncherMode(request) {
  await app.whenReady();
  
  const { WindowManager } = require('./window/windowManager');
  const { DServerClient } = require('../ipc/dserverClient');
  const { EventClient } = require('../ipc/eventClient');
  const { BootstrapManager } = require('./bootstrap/bootstrapManager');
  const logger = require('../sdk/logger');
  const i18n = require('./i18n');
  
  i18n.init(app.getPath('userData'));

  try {
    const lang = i18n.getLanguage();
    const titleKey = i18n.t('common.appTitle');
    const displayName = (lang === 'en-US') ? (titleKey === 'common.appTitle' ? 'StackRun Platform' : titleKey) : (titleKey === 'common.appTitle' ? '栈行平台' : titleKey);
    if (process.platform !== 'linux') {
      app.setName(displayName);
    }
    if (process.platform === 'win32') {
      try { app.setAppUserModelId(displayName); } catch (_) {}
    }
  } catch (_) {}
  
  const windowManager = new WindowManager();
  let dserverClient = null;
  let eventClient = null;
  let bootstrapManager = null;
  const clientId = `launcher_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  async function cleanupAndQuit() {
    logger.info('[Launcher] Cleaning up and exiting...');
    
    if (dserverClient) {
      try { await dserverClient.cleanup(); } catch(e) {}
    }
    
    if (eventClient) {
      try { eventClient.disconnect(); } catch(e) {}
    }
    
    windowManager.destroyAll();
    
    setTimeout(() => {
      app.quit();
      setTimeout(() => { process.exit(0); }, 1000);
    }, 500);
  }
  
  try {
    console.log('[DIAGNOSTIC] Launcher mode: Creating splash window');
    windowManager.createSplashWindow(i18n.t('main.startApp') || '启动应用...');
    
    console.log('[DIAGNOSTIC] Launcher mode: Connecting to dserver');
    const socketPaths = [
      '/run/stackrun/stackrun.sock'
    ];
    
    let connected = false;
    for (const socketPath of socketPaths) {
      try {
        dserverClient = new DServerClient(socketPath);
        await dserverClient.init();
        const status = await dserverClient.checkServerStatus();
        
        if (status.online) {
          await dserverClient.handshake();
          console.log('[DIAGNOSTIC] Launcher mode: Connected to dserver');
          connected = true;
          break;
        }
      } catch (error) {
        console.log('[DIAGNOSTIC] Launcher mode: Failed to connect at', socketPath, error.message);
      }
    }
    
    if (!connected) {
      throw new Error(i18n.t('main.cannotConnectBackend') || '无法连接到后端服务');
    }
    
    console.log('[DIAGNOSTIC] Launcher mode: Connecting to event server');
    eventClient = new EventClient();
    await eventClient.connect();
    console.log('[DIAGNOSTIC] Launcher mode: Connected to event server');
    
    try {
      const dbusSessionBus = process.env.DBUS_SESSION_BUS_ADDRESS || '';
      await dserverClient.call('client.hello', { 
        clientId: clientId,
        type: 'splash',
        pid: process.pid,
        dbusSessionBus: dbusSessionBus
      });
      console.log('[DIAGNOSTIC] Launcher mode: Registered client as', clientId, 'dbus:', dbusSessionBus ? 'yes' : 'no');
    } catch (err) {
      console.warn('[DIAGNOSTIC] Launcher mode: client.hello failed (non-fatal):', err.message);
    }
    
    console.log('[DIAGNOSTIC] Launcher mode: Checking bootstrap status');
    bootstrapManager = new BootstrapManager(dserverClient, eventClient);
    
    const bootstrapResult = await bootstrapManager.ensureReady((progress, message) => {
      console.log(`[DIAGNOSTIC] Bootstrap progress: ${progress}% - ${message}`);
      windowManager.updateSplashWindow(message, progress);
    });
    
    if (!bootstrapResult.success) {
      throw new Error(`Bootstrap failed: ${bootstrapResult.error}`);
    }
    
    console.log('[DIAGNOSTIC] Launcher mode: Bootstrap ready, starting app');
    
    console.log('[DIAGNOSTIC] Launcher mode: Calling app.run with appId:', request.appUuid);
    const result = await dserverClient.call('app.run', { appId: request.appUuid });
    console.log('[DIAGNOSTIC] Launcher mode: app.run result:', JSON.stringify(result));
    
    const taskId = result && result.taskId;
    
    if (result && result.success !== false && taskId) {
      console.log('[DIAGNOSTIC] Launcher mode: Waiting for task completion, taskId:', taskId);
      
      const maxWaitMs = 15000;
      const pollInterval = 300;
      let waitedMs = 0;
      let taskResolved = false;
      let taskSuccess = false;
      let taskError = null;
      
      const onTaskCompleted = (data) => {
        if (data && data.task_id === taskId) {
          console.log('[DIAGNOSTIC] Launcher mode: Received task.completed event');
          taskResolved = true;
          taskSuccess = true;
        }
      };
      
      const onTaskFailed = (data) => {
        if (data && data.task_id === taskId) {
          console.log('[DIAGNOSTIC] Launcher mode: Received task.failed event:', data.error_message);
          taskResolved = true;
          taskSuccess = false;
          taskError = data.error_message || data.message || 'Task failed';
        }
      };
      
      eventClient.on('event:task.completed', onTaskCompleted);
      eventClient.on('event:task.failed', onTaskFailed);
      eventClient.on('task.completed', onTaskCompleted);
      eventClient.on('task.failed', onTaskFailed);
      
      while (waitedMs < maxWaitMs && !taskResolved) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        waitedMs += pollInterval;
        
        try {
          const statusResult = await dserverClient.call('task.status', { taskId });
          const task = statusResult && (statusResult.status !== undefined ? statusResult : null);
          
          if (task) {
            console.log('[DIAGNOSTIC] Launcher mode: Task status:', task.status, 'progress:', task.progress);
            
            if (task.status === 'completed') {
              taskResolved = true;
              taskSuccess = true;
              break;
            } else if (task.status === 'failed' || task.status === 'cancelled') {
              taskResolved = true;
              taskSuccess = false;
              taskError = task.error_message || task.message || 'Task failed';
              break;
            }
          }
        } catch (err) {
          console.log('[DIAGNOSTIC] Launcher mode: Failed to poll task status:', err.message);
        }
      }
      
      eventClient.removeListener('event:task.completed', onTaskCompleted);
      eventClient.removeListener('event:task.failed', onTaskFailed);
      eventClient.removeListener('task.completed', onTaskCompleted);
      eventClient.removeListener('task.failed', onTaskFailed);
      
      if (taskSuccess) {
        console.log('[DIAGNOSTIC] Launcher mode: App started successfully');
      } else if (taskResolved) {
        console.log('[DIAGNOSTIC] Launcher mode: App failed:', taskError);
      } else {
        console.log('[DIAGNOSTIC] Launcher mode: App start did not complete within timeout');
      }
    } else {
      console.log('[DIAGNOSTIC] Launcher mode: App start failed or no taskId');
    }
    
  } catch (error) {
    console.error('[DIAGNOSTIC] Launcher mode error:', error);
    logger.error('[Launcher] Error:', error);
    dialog.showErrorBox(i18n.t('main.startupFailed') || '启动失败', error.message || (i18n.t('main.cannotStartApp') || '无法启动应用'));
  } finally {
    await cleanupAndQuit();
  }
}

function startManagerMode(request, onReadyCallback) {
  const { WindowManager } = require('./window/windowManager');
  const { StartupManager } = require('./startup/startupManager');
  const { NormalHandler } = require('./startup/handlers/normal');
  const { RunAppHandler } = require('./startup/handlers/runApp');
  const { OpenFileHandler } = require('./startup/handlers/openFile');
  const { IpcRouter } = require('./ipc/ipcRouter');
  const { TaskScheduler } = require('./task/taskScheduler');
  const { TrayManager } = require('./tray/trayManager');
  const { DServerClient } = require('../ipc/dserverClient');
  const { EventClient } = require('../ipc/eventClient');
  const logger = require('../sdk/logger');
  const { createMenu } = require('./menuManager');
  const i18n = require('./i18n');
  
  global.startMode = 'normal';
  global.wizardType = null;
  global.wizardFilePath = null;
  
  i18n.init(app.getPath('userData'));

  try {
    const lang = i18n.getLanguage();
    const titleKey = i18n.t('common.appTitle');
    const displayName = (lang === 'en-US') ? (titleKey === 'common.appTitle' ? 'StackRun Platform' : titleKey) : (titleKey === 'common.appTitle' ? '栈行平台' : titleKey);
    if (process.platform !== 'linux') {
      app.setName(displayName);
    }
    if (process.platform === 'win32') {
      try { app.setAppUserModelId(displayName); } catch (_) {}
    }
  } catch (_) {}
  
  const windowManager = new WindowManager();
  const startupManager = new StartupManager();
  
  if (onReadyCallback) {
    onReadyCallback(windowManager, startupManager);
  }
  const taskScheduler = new TaskScheduler();
  const trayManager = new TrayManager();
  const ipcRouter = new IpcRouter();
  
  let dserverClient = null;
  let eventClient = null;
  const managerClientId = `manager_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  startupManager.registerHandler('NORMAL', new NormalHandler());
  startupManager.registerHandler('RUN_APP', new RunAppHandler());
  startupManager.registerHandler('OPEN_FILE', new OpenFileHandler());
  
  function forceQuitApp() {
    logger.info('Force quitting app...');
    process.exitCode = 0;
    
    if (dserverClient) {
      dserverClient.cleanup();
    }
    
    if (eventClient) {
      eventClient.disconnect();
    }
    
    windowManager.destroyAll();
    trayManager.destroy();
    
    app.quit();
    
    setTimeout(() => {
      process.exit(0);
    }, 2000);
  }
  
  trayManager.setDependencies(windowManager, forceQuitApp);
  
  async function initDServerClient() {
    let retryCount = 0;
    const maxRetries = 60;
    const retryInterval = 1000;
    let lastError = null;
    
    logger.info('[Main] Starting DServer connection...');
    
    const DSERVER_SOCKET_PATHS = [
        '/run/stackrun/stackrun.sock'
    ];
    
    while (retryCount < maxRetries) {
      for (const socketPath of DSERVER_SOCKET_PATHS) {
        try {
          if (dserverClient) {
            dserverClient.disconnect();
            dserverClient = null;
          }
          
          dserverClient = new DServerClient(socketPath);
          await dserverClient.init();
          const status = await dserverClient.checkServerStatus();
          
          if (status.online) {
            logger.info(`[Main] DServer found at: ${socketPath}`);
            
            const handshakeResult = await dserverClient.handshake();
              if (handshakeResult) {
                logger.info(`[Main] Handshake successful, server version: ${handshakeResult.version || 'unknown'}`);
                
                if (handshakeResult.server_state === 'initializing' && handshakeResult.init_task_id) {
                  const initTaskId = Array.isArray(handshakeResult.init_task_id) 
                    ? handshakeResult.init_task_id[0] 
                    : handshakeResult.init_task_id;
                  
                  const initData = {
                    init_task_id: initTaskId,
                    task_progress: handshakeResult.task_progress,
                    task_message: handshakeResult.task_message
                  };
                  
                  windowManager.sendToMain('dserver:initializing', initData);
                  windowManager.sendToSplash('dserver:initializing', initData);
                }
              
                dserverClient.onProgress((data) => {
                  windowManager.sendToMain('dserver:progress', data);
                  windowManager.sendToSplash('dserver:progress', data);
                });

                dserverClient.onLog((data) => {
                  windowManager.sendToMain('dserver:log', data);
                  windowManager.sendToSplash('dserver:log', data);
                });

                dserverClient.onTaskOutput((data) => {
                  windowManager.sendToMain('task.output', data);
                  windowManager.sendToSplash('task.output', data);
                });

                dserverClient.onDisconnect(() => {
                  logger.warn('[Main] DServer disconnected');
                  windowManager.sendToMain('dserver:disconnected');
                  windowManager.sendToSplash('dserver:disconnected');
                });

                dserverClient.onServerOnline((status) => {
                  logger.info('[Main] DServer came online:', status);
                  windowManager.sendToMain('dserver:online', status);
                  windowManager.sendToSplash('dserver:online', status);
                });

                dserverClient.onServerOffline(() => {
                  logger.warn('[Main] DServer went offline');
                  windowManager.sendToMain('dserver:offline');
                  windowManager.sendToSplash('dserver:offline');
                });
                
                return;
              }
          }
          
          lastError = new Error(`Server is offline at ${socketPath}`);
        } catch (error) {
          lastError = error;
          logger.debug(`[Main] DServer connection attempt failed at: ${socketPath}, error: ${error.message}`);
        }
      }
      
      retryCount++;
      logger.warn(`[Main] DServer not found, retrying... (${retryCount}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
    
    logger.error('[Main] Failed to connect to DServer after maximum retries:', lastError ? lastError.message : 'unknown');
    dialog.showErrorBox(i18n.t('main.connectFailed') || '连接失败', i18n.t('main.connectFailedDetail') || '无法连接到栈行服务，请确保服务已启动');
    forceQuitApp();
  }
  
  async function initEventClient() {
    eventClient = new EventClient();
    
    let retryCount = 0;
    const maxRetries = 30;
    const retryInterval = 1000;
    
    while (retryCount < maxRetries) {
      try {
        await eventClient.connect();
        logger.info('[Main] Connected to event server successfully');
        
        const { EventManager } = require('./event/eventManager');
        const eventManager = new EventManager();
        eventManager.setDependencies(eventClient, windowManager);
        eventManager.init();
        
        return;
      } catch (error) {
        retryCount++;
        logger.debug(`[Main] Event server not found, retrying... (${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    }
    
    logger.error('[Main] Failed to connect to event server after maximum retries');
  }
  
  app.whenReady().then(async () => {
    const { ipcMain, Menu } = require('electron');
    ipcRouter.registerHandlers();
    
    ipcMain.on('exit-app', () => {
      logger.info('[Main] Received exit-app request from renderer, force quitting...');
      forceQuitApp();
    });
    
    ipcMain.handle('app:setLanguage', async (event, lang) => {
      i18n.setLanguage(lang);
      try {
        const displayName = i18n.t('common.appTitle');
        if (displayName && displayName !== 'common.appTitle') {
          app.setName(displayName);
          if (process.platform === 'win32') {
            try { app.setAppUserModelId(displayName); } catch (_) {}
          }
        }
      } catch (_) {}
      try {
        const menuTpl = createMenu(windowManager, forceQuitApp, dserverClient);
        if (menuTpl) Menu.setApplicationMenu(Menu.buildFromTemplate(menuTpl));
      } catch (_) {}
      try {
        trayManager.refresh();
      } catch (_) {}
      try {
        windowManager.refreshWindowTitles();
      } catch (_) {}
      return { success: true, language: i18n.getLanguage() };
    });
    
    ipcMain.handle('app:getLanguage', () => {
      return i18n.getLanguage();
    });
    
    ipcMain.handle('app:i18nT', (event, key, params) => {
      return i18n.t(key, params || {});
    });
    
    windowManager.createMainWindow();
    
    if (process.platform !== 'darwin') {
      trayManager.create();
    }
    
    let mainWindowReady = false;
    const mainWindow = windowManager.getMainWindow();
    if (mainWindow) {
      mainWindow.once('ready-to-show', () => {
        console.log('[DIAGNOSTIC] Main window ready-to-show event fired');
        mainWindowReady = true;
        mainWindow.show();
      });
    }
    
    const initServices = async () => {
      try {
        console.log('[DIAGNOSTIC] initServices started');
        
        windowManager.sendToMain('startup:status', { message: i18n.t('main.connectingEventServer') || '连接事件服务器...' });
        console.log('[DIAGNOSTIC] Calling initEventClient');
        await initEventClient();
        console.log('[DIAGNOSTIC] initEventClient completed');
        ipcRouter.setEventClient(eventClient);
        console.log('[DIAGNOSTIC] setEventClient completed');
        
        windowManager.sendToMain('startup:status', { message: i18n.t('main.connectingBackend') || '连接后端服务...' });
        console.log('[DIAGNOSTIC] Calling initDServerClient');
        await initDServerClient();
        console.log('[DIAGNOSTIC] initDServerClient completed');
        
        try {
          const dbusSessionBus = process.env.DBUS_SESSION_BUS_ADDRESS || '';
          await dserverClient.call('client.hello', { 
            clientId: managerClientId,
            type: 'manager',
            pid: process.pid,
            dbusSessionBus: dbusSessionBus
          });
          console.log('[DIAGNOSTIC] Manager registered as', managerClientId, 'dbus:', dbusSessionBus ? 'yes' : 'no');
        } catch (err) {
          console.warn('[DIAGNOSTIC] Manager client.hello failed (non-fatal):', err.message);
        }
        
        ipcRouter.setDependencies(dserverClient, windowManager, taskScheduler, startupManager);
        console.log('[DIAGNOSTIC] setDependencies completed');
        startupManager.setDependencies(dserverClient, windowManager, eventClient);
        console.log('[DIAGNOSTIC] startupManager.setDependencies completed');
        
        windowManager.sendToMain('startup:status', { message: i18n.t('main.connectedSuccess') || '服务连接成功' });
        console.log('[DIAGNOSTIC] status message sent');
        
        startupManager.currentRequest = request;
        await startupManager.handleRequest();
        
        console.log('[DIAGNOSTIC] Main window exists:', !!mainWindow);
        console.log('[DIAGNOSTIC] Main window destroyed:', mainWindow ? mainWindow.isDestroyed() : 'N/A');
        console.log('[DIAGNOSTIC] mainWindowReady flag:', mainWindowReady);
        
        if (!mainWindowReady) {
          console.log('[DIAGNOSTIC] Waiting for main window to be ready...');
          await new Promise(resolve => {
            const checkReady = () => {
              if (mainWindowReady) {
                resolve();
              } else {
                setTimeout(checkReady, 50);
              }
            };
            checkReady();
          });
          console.log('[DIAGNOSTIC] Main window is now ready');
        }
        
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log('[DIAGNOSTIC] Sending dserver:connected event to renderer');
          windowManager.sendToMain('dserver:connected');
        } else {
          console.log('[DIAGNOSTIC] Main window is NOT ready!');
        }
        
      } catch (error) {
        logger.error('[Main] Failed to initialize services:', error);
        windowManager.sendToMain('dserver:connection-failed', { message: error.message });
      }
    };
    
    initServices();
    
    app.on('activate', () => {
      if (require('electron').BrowserWindow.getAllWindows().length === 0) {
        windowManager.createMainWindow();
      }
    });
  });
  
  app.on('window-all-closed', async () => {
    if (dserverClient) {
      await dserverClient.cleanup();
    }
    if (eventClient) {
      eventClient.disconnect();
    }
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
  
  app.on('before-quit', async () => {
    if (dserverClient) {
      await dserverClient.cleanup();
    }
    if (eventClient) {
      eventClient.disconnect();
    }
  });

  app.on('open-file', async (event, filePath) => {
    event.preventDefault();
    
    logger.info('[Main] open-file event triggered with path:', filePath);
    console.log('[DIAGNOSTIC] open-file event:', filePath);
    
    const { StartupRequest } = require('./startup/startupManager');
    const request = StartupRequest.fromCommandLine([process.execPath, '--open', filePath]);
    
    console.log('[DIAGNOSTIC] Parsed request from open-file:', request.type, request.filePath);
    
    startupManager.currentRequest = request;
    await startupManager.handleRequest(request);
  });
}