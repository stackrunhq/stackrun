const logger = require('../../../sdk/logger');

class NormalHandler {
  async execute(request, context) {
    logger.info('[NormalHandler] Executing normal startup');
    const { windowManager } = context;
    windowManager.showMainWindow();
  }
}

module.exports = { NormalHandler };
