const logger = require('../../../sdk/logger');

class OpenFileHandler {
  async execute(request, context) {
    logger.info('[OpenFileHandler] Executing open file:', request.filePath);
    
    const { dserverClient, windowManager, startupManager } = context;
    const filePath = request.filePath;
    
    if (!filePath) {
      logger.error('[OpenFileHandler] No file path provided');
      return;
    }
    
    if (filePath.endsWith('.exe') || filePath.endsWith('.msi')) {
      await this.handleAppFile(filePath, dserverClient, windowManager, startupManager);
    } else if (filePath.endsWith('.srtar')) {
      await this.handleWorkspaceFile(filePath, dserverClient, windowManager);
    } else {
      logger.warn('[OpenFileHandler] Unknown file type:', filePath);
    }
  }

  async handleAppFile(filePath, dserverClient, windowManager, startupManager) {
    const installedInfo = await startupManager.checkAppInstalled(filePath);
    
    if (installedInfo) {
      logger.info('[OpenFileHandler] App already installed, launching:', installedInfo.app.name);
      windowManager.createSplashWindow(installedInfo.app.name);
      
      try {
        await dserverClient.call('app.run', { appId: installedInfo.app.id });
        logger.info('[OpenFileHandler] App launched successfully');
      } catch (error) {
        logger.error('[OpenFileHandler] Failed to launch app:', error);
      }
      
      setTimeout(async () => {
        await windowManager.closeSplashWindow();
      }, 500);
      return;
    }
    
    const mainWindow = windowManager.getMainWindow();
    const hasMainWindow = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
    
    if (!hasMainWindow) {
      windowManager.createSplashWindow('安装应用');
      
      setTimeout(() => {
        windowManager.closeSplashWindow();
        windowManager.createWizardWindow('install', filePath);
      }, 1000);
    } else {
      if (!windowManager.getWizardWindow()) {
        windowManager.createWizardWindow('install', filePath);
      } else {
        windowManager.sendToWizard('start-install', filePath);
      }
    }
  }

  async handleWorkspaceFile(filePath, dserverClient, windowManager) {
    logger.info('[OpenFileHandler] Handling workspace file:', filePath);
    
    const mainWindow = windowManager.getMainWindow();
    const hasMainWindow = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
    
    if (!hasMainWindow) {
      windowManager.createSplashWindow('导入工作区');
      
      setTimeout(() => {
        windowManager.closeSplashWindow();
        windowManager.createWizardWindow('import', filePath);
      }, 1000);
    } else {
      if (!windowManager.getWizardWindow()) {
        windowManager.createWizardWindow('import', filePath);
      } else {
        windowManager.sendToWizard('start-import', filePath);
      }
    }
  }
}

module.exports = { OpenFileHandler };
