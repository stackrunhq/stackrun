const logger = require('../../../sdk/logger');

class ImportHandler {
  async execute(request, context) {
    logger.info('[ImportHandler] Executing import:', request.filePath);
    
    const { windowManager } = context;
    
    const mainWindow = windowManager.getMainWindow();
    const hasMainWindow = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
    
    if (!hasMainWindow) {
      windowManager.createSplashWindow('导入工作区');
      
      setTimeout(() => {
        windowManager.closeSplashWindow();
        windowManager.createWizardWindow('import', request.filePath);
      }, 1000);
    } else {
      if (!windowManager.getWizardWindow()) {
        windowManager.createWizardWindow('import', request.filePath);
      } else {
        windowManager.sendToWizard('start-import', request.filePath);
      }
    }
  }
}

module.exports = { ImportHandler };
