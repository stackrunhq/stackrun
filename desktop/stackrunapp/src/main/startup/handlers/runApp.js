const logger = require('../../../sdk/logger');

class RunAppHandler {
  constructor() {}

  async execute(request, context) {
    console.log('[DIAGNOSTIC] RunAppHandler.execute called');
    console.log('[DIAGNOSTIC] RunAppHandler request:', JSON.stringify(request.toJSON()));
    console.log('[DIAGNOSTIC] RunAppHandler context has dserverClient:', !!context.dserverClient);
    console.log('[DIAGNOSTIC] RunAppHandler context has windowManager:', !!context.windowManager);
    
    logger.info('[RunAppHandler] Executing run app:', request.appUuid);
    
    const { dserverClient, windowManager } = context;
    
    const appName = request.appUuid ? '应用' : '未知应用';
    
    console.log('[DIAGNOSTIC] Creating splash window for app:', appName);
    windowManager.createSplashWindow(appName);

    try {
      console.log('[DIAGNOSTIC] Connected to dserver, calling app.run with appId:', request.appUuid);
      const result = await dserverClient.call('app.run', { appId: request.appUuid });
      console.log('[DIAGNOSTIC] app.run result:', JSON.stringify(result));
      
      const taskId = result && result.taskId;
      
      if (result && result.success !== false && taskId) {
        logger.info('[RunAppHandler] App start task created:', taskId);
        
        const maxWaitMs = 15000;
        const pollInterval = 300;
        let waitedMs = 0;
        let taskResolved = false;
        
        while (waitedMs < maxWaitMs) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          waitedMs += pollInterval;
          
          try {
            const statusResult = await dserverClient.call('task.status', { taskId });
            const task = statusResult && (statusResult.status !== undefined ? statusResult : null);
            
            if (task) {
              console.log('[DIAGNOSTIC] RunAppHandler: Task status:', task.status);
              
              if (task.status === 'completed') {
                console.log('[DIAGNOSTIC] RunAppHandler: Task completed');
                taskResolved = true;
                break;
              } else if (task.status === 'failed' || task.status === 'cancelled') {
                console.log('[DIAGNOSTIC] RunAppHandler: Task failed/cancelled');
                taskResolved = true;
                break;
              }
            }
          } catch (err) {
            console.log('[DIAGNOSTIC] RunAppHandler: Failed to poll task status:', err.message);
          }
        }
        
        logger.info('[RunAppHandler] App launch finished (resolved:', taskResolved, ')');
      } else {
        logger.warn('[RunAppHandler] App start failed or no taskId');
      }

    } catch (error) {
      logger.error('[RunAppHandler] Error running app:', error);
    } finally {
      setTimeout(async () => {
        await windowManager.closeSplashWindow();
      }, 500);
    }
  }
}

module.exports = { RunAppHandler };