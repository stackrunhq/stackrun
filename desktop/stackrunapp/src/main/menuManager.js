const { Menu, app, shell, BrowserWindow, dialog } = require('electron');
const i18n = require('./i18n');

function getActiveWindow() {
  return BrowserWindow.getFocusedWindow() ||
         BrowserWindow.getAllWindows()[0];
}

function notifyRenderer(channel, payload) {
  const win = getActiveWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

function callDServer(dserverClient, method, params) {
  return dserverClient.call(method, params || {});
}

function confirmDangerous(actionLabel) {
  const win = getActiveWindow();
  const result = dialog.showMessageBoxSync(win, {
    type: 'warning',
    buttons: [i18n.t('common.cancel'), i18n.t('common.confirm')],
    defaultId: 0,
    cancelId: 0,
    title: i18n.t('confirm.dangerousTitle'),
    message: i18n.t('confirm.dangerousMessage', { action: actionLabel }),
    detail: i18n.t('confirm.dangerousDetail')
  });
  return result === 1;
}

function pickActiveContainer() {
  return null;
}

function dispatchToRenderer(method, params, label) {
  notifyRenderer('menu:invoke', { method, params, label });
}

function ensureMenuKeys() {
  const missing = {};
  const menuKeys = [
    'file', 'refresh', 'quit', 'basic', 'closeWorkspaceApps',
    'components', 'installComponent', 'viewInstalledComponents',
    'workspaceSettings', 'virtualDesktop', 'displaySystem', 'uiScale',
    'graphicsAcceleration', 'windowMode', 'windowDecoration',
    'system', 'simulateRestart', 'view', 'zoomIn', 'zoomOut',
    'resetZoom', 'fullscreen', 'devTools', 'help', 'toolDiscovery',
    'docs', 'enable', 'disable'
  ];
  menuKeys.forEach(k => {
    const key = `menu.${k}`;
    if (!i18n.t(key) || i18n.t(key) === key) missing[key] = true;
  });
  return missing;
}

function createMenu(dserverClient) {
  const t = (k, fallback) => {
    const v = i18n.t(k);
    return (v && v !== k) ? v : fallback;
  };

  const template = [
    {
      label: t('menu.file', '文件'),
      submenu: [
        {
          label: t('menu.refresh', '刷新'),
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            dispatchToRenderer('container.refresh', {}, t('menu.refresh', '刷新'));
          }
        },
        { type: 'separator' },
        {
          label: t('menu.quit', '退出'),
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => { app.quit(); }
        }
      ]
    },

    {
      label: t('menu.basic', '基础操作'),
      submenu: [
        {
          label: t('menu.closeWorkspaceApps', '关闭工作区应用'),
          click: () => {
            dispatchToRenderer('wine.wineboot_kill', {}, t('menu.closeWorkspaceApps', '关闭工作区应用'));
          }
        },
        { type: 'separator' },
        {
          label: t('contextMenu.openSystemCdrive', '打开系统 C 盘'),
          click: () => {
            dispatchToRenderer('wine.explorer_cdrive', {}, t('contextMenu.openSystemCdrive', '打开 C 盘'));
          }
        },
        {
          label: t('contextMenu.openRegistry', '注册表编辑器'),
          click: () => {
            dispatchToRenderer('wine.regedit', {}, t('contextMenu.openRegistry', '注册表编辑器'));
          }
        },
        {
          label: t('contextMenu.openCommandLine', '命令提示符'),
          click: () => {
            dispatchToRenderer('wine.cmd', {}, t('contextMenu.openCommandLine', '命令提示符'));
          }
        },
        {
          label: t('contextMenu.openInternetOptions', 'Internet 选项'),
          click: () => {
            dispatchToRenderer('wine.internet_options', {}, t('contextMenu.openInternetOptions', 'Internet 选项'));
          }
        },
        {
          label: t('contextMenu.openGameController', '游戏控制器'),
          click: () => {
            dispatchToRenderer('wine.game_controller', {}, t('contextMenu.openGameController', '游戏控制器'));
          }
        },
        {
          label: t('contextMenu.openControlPanel', '控制面板'),
          click: () => {
            dispatchToRenderer('wine.control_panel', {}, t('contextMenu.openControlPanel', '控制面板'));
          }
        },
        {
          label: t('contextMenu.openTaskManager', '任务管理器'),
          click: () => {
            dispatchToRenderer('wine.task_manager', {}, t('contextMenu.openTaskManager', '任务管理器'));
          }
        }
      ]
    },

    {
      label: t('menu.components', '组件'),
      submenu: [
        {
          label: t('menu.installComponent', '安装组件'),
          click: () => {
            notifyRenderer('menu:installComponents', {});
          }
        },
        {
          label: t('menu.viewInstalledComponents', '查看已安装组件'),
          click: () => {
            dispatchToRenderer('container.listInstalledComponents', {}, t('menu.viewInstalledComponents', '查看已安装组件'));
          }
        }
      ]
    },

    {
      label: t('contextMenu.workspaceSettings', '工作区设置'),
      submenu: [
        {
          label: t('contextMenu.virtualDesktop', '虚拟桌面'),
          submenu: [
            {
              label: t('menu.enable', '启用'),
              type: 'radio',
              click: () => dispatchToRenderer('container.setVirtualDesktop',
                { enabled: 1 }, t('contextMenu.virtualDesktop', '虚拟桌面') + '-' + t('menu.enable', '启用'))
            },
            {
              label: t('menu.disable', '禁用'),
              type: 'radio',
              click: () => dispatchToRenderer('container.setVirtualDesktop',
                { enabled: 0 }, t('contextMenu.virtualDesktop', '虚拟桌面') + '-' + t('menu.disable', '禁用'))
            }
          ]
        },
        {
          label: t('contextMenu.displaySystem', '显示系统'),
          submenu: [
            { label: 'X11',    type: 'radio',
              click: () => dispatchToRenderer('container.setDisplaySystem',
                { value: 'x11' }, t('contextMenu.displaySystem', '显示系统') + '-X11') },
            { label: 'Wayland', type: 'radio',
              click: () => dispatchToRenderer('container.setDisplaySystem',
                { value: 'wayland' }, t('contextMenu.displaySystem', '显示系统') + '-Wayland') }
          ]
        },
        {
          label: t('contextMenu.uiScale', '界面缩放 (DPI)'),
          submenu: [
            { label: '96 DPI (100%)',  click: () => dispatchToRenderer('container.setUiScale', { dpi: 96  }, 'DPI-96') },
            { label: '120 DPI (125%)', click: () => dispatchToRenderer('container.setUiScale', { dpi: 120 }, 'DPI-120') },
            { label: '144 DPI (150%)', click: () => dispatchToRenderer('container.setUiScale', { dpi: 144 }, 'DPI-144') },
            { label: '192 DPI (200%)', click: () => dispatchToRenderer('container.setUiScale', { dpi: 192 }, 'DPI-192') }
          ]
        },
        {
          label: t('contextMenu.graphicsAcceleration', '图形加速'),
          submenu: [
            { label: 'gl (OpenGL)',   click: () => dispatchToRenderer('container.setGraphicsBackend', { value: 'gl' }, t('contextMenu.graphicsAcceleration', '图形') + '-gl') },
            { label: 'vulkan',         click: () => dispatchToRenderer('container.setGraphicsBackend', { value: 'vulkan' }, t('contextMenu.graphicsAcceleration', '图形') + '-vulkan') },
            { label: 'dxvk (D3D9/10/11 over Vulkan)', click: () => dispatchToRenderer('container.setGraphicsBackend', { value: 'dxvk' }, t('contextMenu.graphicsAcceleration', '图形') + '-dxvk') },
            { label: 'd3d11',          click: () => dispatchToRenderer('container.setGraphicsBackend', { value: 'd3d11' }, t('contextMenu.graphicsAcceleration', '图形') + '-d3d11') },
            { label: 'd3d9',           click: () => dispatchToRenderer('container.setGraphicsBackend', { value: 'd3d9' }, t('contextMenu.graphicsAcceleration', '图形') + '-d3d9') },
            { label: t('contextMenu.graphicsSoftwareRender', 'gdi (软件渲染)'), click: () => dispatchToRenderer('container.setGraphicsBackend', { value: 'gdi' }, t('contextMenu.graphicsAcceleration', '图形') + '-gdi') }
          ]
        },
        {
          label: t('contextMenu.windowMode', '窗口模式'),
          submenu: [
            { label: t('menu.fullscreen', '全屏 (fullscreen)'),  type: 'radio',
              click: () => dispatchToRenderer('container.setWindowMode', { value: 'fullscreen' }, t('contextMenu.windowMode', '窗口') + '-' + t('menu.fullscreen', '全屏')) },
            { label: t('menu.windowed', '窗口 (windowed)'),    type: 'radio',
              click: () => dispatchToRenderer('container.setWindowMode', { value: 'windowed' }, t('contextMenu.windowMode', '窗口') + '-' + t('menu.windowed', '窗口')) },
            { label: t('menu.borderless', '无边框 (borderless)'), type: 'radio',
              click: () => dispatchToRenderer('container.setWindowMode', { value: 'borderless' }, t('contextMenu.windowMode', '窗口') + '-' + t('menu.borderless', '无边框')) }
          ]
        },
        {
          label: t('contextMenu.windowDecoration', '窗口装饰'),
          submenu: [
            { label: t('menu.enable', '启用'), type: 'radio',
              click: () => dispatchToRenderer('container.setWindowDecoration', { enabled: 1 }, t('contextMenu.windowDecoration', '装饰') + '-' + t('menu.enable', '启用')) },
            { label: t('menu.disable', '禁用'), type: 'radio',
              click: () => dispatchToRenderer('container.setWindowDecoration', { enabled: 0 }, t('contextMenu.windowDecoration', '装饰') + '-' + t('menu.disable', '禁用')) }
          ]
        }
      ]
    },

    {
      label: t('menu.system', '系统'),
      submenu: [
        {
          label: t('contextMenu.simulateRestart', '模拟重启'),
          click: () => {
            if (confirmDangerous(t('contextMenu.simulateRestart', '模拟重启'))) {
              dispatchToRenderer('wine.simulateRestart', { already_confirmed: true }, t('contextMenu.simulateRestart', '模拟重启'));
            }
          }
        }
      ]
    },

    {
      label: t('menu.view', '视图'),
      submenu: [
        { label: t('menu.zoomIn', '放大'),     accelerator: 'CmdOrCtrl+Plus',  role: 'zoomIn' },
        { label: t('menu.zoomOut', '缩小'),     accelerator: 'CmdOrCtrl+-',     role: 'zoomOut' },
        { label: t('menu.resetZoom', '重置缩放'), accelerator: 'CmdOrCtrl+0',     role: 'resetZoom' },
        { type: 'separator' },
        { label: t('menu.fullscreen', '全屏'),     accelerator: 'F11',             role: 'togglefullscreen' },
        { type: 'separator' },
        { label: t('menu.devTools', '开发者工具'), accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' }
      ]
    },

    {
      label: t('common.help', '帮助'),
      submenu: [
        {
          label: t('menu.toolDiscovery', '工具列表 (Tool Discovery)'),
          click: () => {
            notifyRenderer('menu:listTools', {});
          }
        },
        {
          label: t('common.about', '关于'),
          click: () => {
            const win = getActiveWindow();
            if (win) {
              win.webContents.send('menu-action', { action: 'about' });
            }
          }
        },
        {
          label: t('menu.docs', '文档'),
          click: () => {
            shell.openExternal('https://github.com/stackrun');
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { label: t('menu.aboutApp', '关于 栈行平台'), role: 'about' },
        { type: 'separator' },
        { label: t('menu.services', '服务'), role: 'services' },
        { type: 'separator' },
        { label: t('menu.hideApp', '隐藏 栈行平台'), role: 'hide' },
        { label: t('menu.hideOthers', '隐藏其他'), role: 'hideOthers' },
        { label: t('menu.unhide', '显示全部'), role: 'unhide' },
        { type: 'separator' },
        { label: t('menu.quitApp', '退出 栈行平台'), role: 'quit' }
      ]
    });
  }

  try {
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  } catch (e) {
    console.error('[MenuManager] Failed to build menu:', e.message);
  }

  return template;
}

module.exports = { createMenu };
