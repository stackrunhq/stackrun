const logger = require('../../../sdk/logger');

class InstallHandler {
  async execute(request, context) {
    logger.info('[InstallHandler] Executing install:', request.filePath);
    
    const { dserverClient, windowManager, startupManager } = context;
    
    const installedInfo = await startupManager.checkAppInstalled(request.filePath);
    if (installedInfo) {
      logger.info('[InstallHandler] App already installed, launching:', installedInfo.app.name);
      windowManager.createSplashWindow(installedInfo.app.name);
      
      try {
        await dserverClient.call('app.run', { appId: installedInfo.app.id });
        logger.info('[InstallHandler] App launched successfully');
      } catch (error) {
        logger.error('[InstallHandler] Failed to launch app:', error);
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
        windowManager.createWizardWindow('install', request.filePath);
      }, 1000);
    } else {
      if (!windowManager.getWizardWindow()) {
        windowManager.createWizardWindow('install', request.filePath);
      } else {
        windowManager.sendToWizard('start-install', request.filePath);
      }
    }
  }
}

module.exports = { InstallHandler };
