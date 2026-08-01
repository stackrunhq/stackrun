const { Tray, Menu, app } = require('electron');
const path = require('path');
const logger = require('../../sdk/logger');
const i18n = require('../i18n');

class TrayManager {
  constructor() {
    this.tray = null;
    this._windowManager = null;
    this._forceQuitCallback = null;
    this._iconPath = null;
  }

  setDependencies(windowManager, forceQuitCallback) {
    this._windowManager = windowManager;
    this._forceQuitCallback = forceQuitCallback;
  }

  _buildTemplate() {
    return [
      {
        label: i18n.t('tray.showWindow') || '显示窗口',
        click: () => {
          this._windowManager.showMainWindow();
        }
      },
      {
        label: i18n.t('tray.quit') || i18n.t('menu.quit') || '退出',
        click: () => {
          logger.info('[TrayManager] Tray quit clicked');
          if (this._forceQuitCallback) {
            this._forceQuitCallback();
          }
        }
      }
    ];
  }

  refresh() {
    if (!this.tray) return;
    try {
      const tpl = this._buildTemplate();
      const contextMenu = Menu.buildFromTemplate(tpl);
      const appName = i18n.t('common.appTitle');
      this.tray.setToolTip((appName && appName !== 'common.appTitle') ? appName : '栈行平台');
      this.tray.setContextMenu(contextMenu);
    } catch (e) {
      logger.error('[TrayManager] Refresh failed:', e.message);
    }
  }

  create() {
    if (this.tray) {
      return;
    }

    const fs = require('fs');
    const possiblePaths = [
      path.join(__dirname, '../../../assets/images/logo.png'),
      path.join(process.resourcesPath, 'assets/images/logo.png'),
      path.join(app.getAppPath(), 'assets/images/logo.png'),
      '/opt/stackrun/app/assets/images/logo.png'
    ];
    
    let iconPath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        iconPath = p;
        break;
      }
    }
    
    if (!iconPath) {
      logger.error('[TrayManager] Icon file not found in any of the following paths:', possiblePaths);
      return;
    }
    
    logger.info('[TrayManager] Creating tray with icon path:', iconPath);
    
    try {
      this.tray = new Tray(iconPath);
      
      const tpl = this._buildTemplate();
      const contextMenu = Menu.buildFromTemplate(tpl);
      
      const appName = i18n.t('common.appTitle');
      this.tray.setToolTip((appName && appName !== 'common.appTitle') ? appName : '栈行平台');
      this.tray.setContextMenu(contextMenu);
      
      this.tray.on('click', () => {
        const mainWindow = this._windowManager.getMainWindow();
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            this._windowManager.hideMainWindow();
          } else {
            this._windowManager.showMainWindow();
          }
        }
      });
      
      this.tray.on('double-click', () => {
        const mainWindow = this._windowManager.getMainWindow();
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.focus();
          } else {
            this._windowManager.showMainWindow();
          }
        }
      });
      
      logger.info('[TrayManager] Tray created successfully');
    } catch (e) {
      logger.error('[TrayManager] Failed to create tray:', e.message);
      logger.error('[TrayManager] Error stack:', e.stack);
    }
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }

  setToolTip(text) {
    if (this.tray) {
      this.tray.setToolTip(text);
    }
  }

  updateMenu(items) {
    if (this.tray) {
      const contextMenu = Menu.buildFromTemplate(items);
      this.tray.setContextMenu(contextMenu);
    }
  }
}

module.exports = { TrayManager };
