const { BrowserWindow, session } = require('electron');
const path = require('path');
const i18n = require('../i18n');

class WindowManager {
  constructor() {
    this.windows = {
      main: null,
      splash: null,
      wizard: null
    };
    this.isMainWindowMaximized = false;
  }

  createMainWindow() {
    if (this.windows.main && !this.windows.main.isDestroyed()) {
      return this.windows.main;
    }

    this.windows.main = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        devTools: false,
        enableRemoteModule: false,
        disableBlinkFeatures: 'Auxclick',
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        experimentalCanvasFeatures: false,
        enableWebSQL: false,
        allowEval: false,
        allowFileAccess: false,
        allowPopups: false
      },
      title: i18n.t('common.appTitle'),
      frame: false,
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      icon: path.join(__dirname, '../../../assets/images/logo.png'),
      roundedCorners: true
    });

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self'",
            "media-src 'self'",
            "object-src 'none'",
            "frame-src 'none'",
            "worker-src 'none'",
            "form-action 'none'"
          ].join('; ')
        }
      });
    });

    this.windows.main.loadFile(path.join(__dirname, '../../renderer/index.html'));

    if (process.platform === 'linux') {
      const title = i18n.t('common.appTitle');
      if (title && title !== 'common.appTitle') {
        this.windows.main.setTitle(title);
        try {
          this.windows.main.webContents.executeJavaScript(`document.title = "${title.replace(/"/g, '\\"')}";`);
        } catch (_) {}
      }
    }

    this.windows.main.once('ready-to-show', () => {
      if (process.platform === 'linux') {
        const title = i18n.t('common.appTitle');
        if (title && title !== 'common.appTitle') {
          this.windows.main.setTitle(title);
          try {
            this.windows.main.webContents.executeJavaScript(`document.title = "${title.replace(/"/g, '\\"')}";`);
          } catch (_) {}
          try {
            this.windows.main.webContents.executeJavaScript(`
              const event = new Event('visibilitychange');
              document.dispatchEvent(event);
            `);
          } catch (_) {}
        }
      }
      this.windows.main.show();
    });

    this.windows.main.on('closed', () => {
      this.windows.main = null;
    });

    this.windows.main.on('close', (event) => {
      event.preventDefault();
      this.windows.main.hide();
    });

    this.windows.main.on('maximize', () => this._updateWindowState());
    this.windows.main.on('unmaximize', () => this._updateWindowState());
    this.windows.main.on('resize', () => this._updateWindowState());

    return this.windows.main;
  }

  _updateWindowState() {
    if (!this.windows.main || this.windows.main.isDestroyed()) return;
    
    const newIsMaximized = this.windows.main.isMaximized();
    if (newIsMaximized !== this.isMainWindowMaximized) {
      this.isMainWindowMaximized = newIsMaximized;
      if (this.isMainWindowMaximized) {
        this.windows.main.webContents.send('window-maximized');
      } else {
        this.windows.main.webContents.send('window-unmaximized');
      }
    }
  }

  showMainWindow() {
    if (!this.windows.main || this.windows.main.isDestroyed()) {
      this.createMainWindow();
    } else {
      if (this.windows.main.isMinimized()) {
        this.windows.main.restore();
      }
      this.windows.main.center();
      this.windows.main.focus();
      this.windows.main.show();
      this.windows.main.webContents.send('show-main-layout');
    }
  }

  hideMainWindow() {
    if (this.windows.main && !this.windows.main.isDestroyed()) {
      this.windows.main.hide();
    }
  }

  createSplashWindow(appName = '应用') {
    if (this.windows.splash && !this.windows.splash.isDestroyed()) {
      this.windows.splash.close();
    }

    this.windows.splash = new BrowserWindow({
      width: 480,
      height: 280,
      minWidth: 480,
      minHeight: 280,
      maxWidth: 480,
      maxHeight: 280,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        devTools: false,
        enableRemoteModule: false,
        webSecurity: true
    },
    title: process.platform === 'linux' ? '栈行平台' : i18n.t('common.appTitle'),
    frame: false,
    resizable: false,
    movable: true,
    center: true,
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      roundedCorners: true,
      icon: path.join(__dirname, '../../../assets/images/logo.png')
    });

    this.windows.splash.loadFile(path.join(__dirname, '../../renderer/splash.html'));

    this.windows.splash.once('ready-to-show', () => {
      this.windows.splash.show();
      if (appName) {
        this.windows.splash.webContents.send('splash:setAppName', appName);
      }
    });

    this.windows.splash.on('closed', () => {
      this.windows.splash = null;
    });

    return this.windows.splash;
  }

  async closeSplashWindow() {
    if (this.windows.splash && !this.windows.splash.isDestroyed()) {
      try {
        await this.windows.splash.close();
      } catch (e) {
        console.error('[WindowManager] Error closing splash window:', e);
      }
      this.windows.splash = null;
    }
  }

  updateSplashWindow(message, progress) {
    if (this.windows.splash && !this.windows.splash.isDestroyed()) {
      this.windows.splash.webContents.send('splash:update', { message, progress });
    }
  }

  createWizardWindow(wizardType, filePath) {
    if (this.windows.wizard && !this.windows.wizard.isDestroyed()) {
      this.windows.wizard.close();
    }

    this.windows.wizard = new BrowserWindow({
      width: 480,
      height: 600,
      resizable: false,
      frame: false,
      icon: path.join(__dirname, '../../../assets/images/logo.png'),
      show: false,
      transparent: false,
      backgroundColor: '#1a1a2e',
      title: i18n.t('common.appTitle'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        devTools: false,
        enableRemoteModule: false,
        webSecurity: true
      }
    });

    this.windows.wizard.center();

    this.windows.wizard.webContents.on('did-finish-load', () => {
      this.windows.wizard.webContents.send('init-wizard', {
        wizardType: wizardType,
        filePath: filePath
      });
      this.windows.wizard.show();
      this.windows.wizard.focus();
    });

    this.windows.wizard.loadFile(path.join(__dirname, '../../renderer/wizard.html'));

    this.windows.wizard.webContents.on('devtools-opened', () => {
      this.windows.wizard.webContents.closeDevTools();
    });

    this.windows.wizard.on('closed', () => {
      this.windows.wizard = null;
    });

    return this.windows.wizard;
  }

  closeWizardWindow() {
    if (this.windows.wizard && !this.windows.wizard.isDestroyed()) {
      this.windows.wizard.close();
      this.windows.wizard = null;
    }
  }

  minimizeMainWindow() {
    if (this.windows.main && !this.windows.main.isDestroyed()) {
      this.windows.main.minimize();
    }
  }

  maximizeMainWindow() {
    if (this.windows.main && !this.windows.main.isDestroyed()) {
      if (this.windows.main.isMaximized()) {
        this.windows.main.unmaximize();
      } else {
        this.windows.main.maximize();
      }
    }
  }

  closeMainWindow() {
    if (this.windows.main && !this.windows.main.isDestroyed()) {
      this.windows.main.close();
    }
  }

  destroyAll() {
    ['main', 'wizard', 'splash'].forEach(type => {
      if (this.windows[type] && !this.windows[type].isDestroyed()) {
        this.windows[type].destroy();
        this.windows[type] = null;
      }
    });
  }

  getMainWindow() {
    return this.windows.main;
  }

  getWizardWindow() {
    return this.windows.wizard;
  }

  getSplashWindow() {
    return this.windows.splash;
  }

  sendToMain(channel, ...args) {
    if (!this.windows.main) {
      console.log('[DIAGNOSTIC] sendToMain: main window is null');
      return;
    }
    if (this.windows.main.isDestroyed()) {
      console.log('[DIAGNOSTIC] sendToMain: main window is destroyed');
      return;
    }
    if (!this.windows.main.webContents) {
      console.log('[DIAGNOSTIC] sendToMain: webContents is null');
      return;
    }
    try {
      this.windows.main.webContents.send(channel, ...args);
      console.log('[DIAGNOSTIC] sendToMain: sent channel:', channel);
    } catch (error) {
      console.log('[DIAGNOSTIC] sendToMain: error sending channel:', channel, error.message);
    }
  }

  sendToSplash(channel, ...args) {
    if (this.windows.splash && !this.windows.splash.isDestroyed()) {
      this.windows.splash.webContents.send(channel, ...args);
    }
  }

  sendToWizard(channel, ...args) {
    if (this.windows.wizard && !this.windows.wizard.isDestroyed()) {
      this.windows.wizard.webContents.send(channel, ...args);
    }
  }

  sendToAll(channel, ...args) {
    this.sendToMain(channel, ...args);
    this.sendToSplash(channel, ...args);
    this.sendToWizard(channel, ...args);
  }

  refreshWindowTitles() {
    const title = i18n.t('common.appTitle');
    ['main', 'splash', 'wizard'].forEach(type => {
      if (this.windows[type] && !this.windows[type].isDestroyed()) {
        this.windows[type].setTitle(title);
      }
    });
  }
}

module.exports = { WindowManager };
