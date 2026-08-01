const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stackrun', {
  call: (method, params) => ipcRenderer.invoke('dserver:call', { method, params }),
  connect: () => ipcRenderer.invoke('dserver:connect'),
  isConnected: () => ipcRenderer.invoke('dserver:isConnected'),
  getToken: () => ipcRenderer.invoke('dserver:getToken'),
  validateToken: () => ipcRenderer.invoke('dserver:validateToken'),
  checkStatus: () => ipcRenderer.invoke('dserver:checkStatus'),
  hello: () => ipcRenderer.invoke('dserver:hello'),
  prepareEnvironment: () => ipcRenderer.invoke('dserver:prepareEnvironment'),
  cancelTask: (taskId) => ipcRenderer.invoke('dserver:cancelTask', { taskId }),
  getActiveTasks: () => ipcRenderer.invoke('dserver:getActiveTasks'),
  getTaskStatus: (taskId) => ipcRenderer.invoke('dserver:getTaskStatus', { taskId }),
  onProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('dserver:progress', listener);
    return () => ipcRenderer.removeListener('dserver:progress', listener);
  },
  onLog: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('dserver:log', listener);
    return () => ipcRenderer.removeListener('dserver:log', listener);
  },
  onDisconnected: (callback) => {
    const listener = (event) => callback();
    ipcRenderer.on('dserver:disconnected', listener);
    return () => ipcRenderer.removeListener('dserver:disconnected', listener);
  },
  onServerOnline: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('dserver:online', listener);
    return () => ipcRenderer.removeListener('dserver:online', listener);
  },
  onServerOffline: (callback) => {
    const listener = (event) => callback();
    ipcRenderer.on('dserver:offline', listener);
    return () => ipcRenderer.removeListener('dserver:offline', listener);
  },
  getStartupMode: () => ipcRenderer.invoke('app:getStartupMode'),
  closeSplash: () => ipcRenderer.invoke('app:closeSplash'),
  createSplash: (appName) => ipcRenderer.invoke('app:createSplash', { appName }),
  setStartupMode: (mode, params) => ipcRenderer.invoke('app:setStartupMode', { mode, params }),
  receive: (channel, callback) => {
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});

contextBridge.exposeInMainWorld('stackrunMenu', {
  // 通用菜单触发 - 渲染进程根据 method/params 调后端
  onInvoke: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('menu:invoke', listener);
    return () => ipcRenderer.removeListener('menu:invoke', listener);
  },
  // 列出已注册工具
  onListTools: (callback) => {
    const listener = (event) => callback();
    ipcRenderer.on('menu:listTools', listener);
    return () => ipcRenderer.removeListener('menu:listTools', listener);
  },
  // 安装组件
  onInstallComponents: (callback) => {
    const listener = (event) => callback();
    ipcRenderer.on('menu:installComponents', listener);
    return () => ipcRenderer.removeListener('menu:installComponents', listener);
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  receive: (channel, callback) => {
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  setMainLanguage: (lang) => ipcRenderer.invoke('set-language', lang),
  onWindowMaximized: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('window-maximized', listener);
    return () => ipcRenderer.removeListener('window-maximized', listener);
  },
  onWindowUnmaximized: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('window-unmaximized', listener);
    return () => ipcRenderer.removeListener('window-unmaximized', listener);
  },
  // 文件选择框方法
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
  // 保存文件对话框
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
  // 标题栏更多菜单
  showMoreMenu: (params) => ipcRenderer.invoke('show-more-menu', params),
  // 容器右键菜单
  showContainerContextMenu: (params) => ipcRenderer.invoke('show-container-context-menu', params),
  // 容器更多菜单
  showContainerMoreMenu: (params) => ipcRenderer.invoke('show-container-more-menu', params),
  // 应用右键菜单
  showAppContextMenu: (params) => ipcRenderer.invoke('show-app-context-menu', params),
  // 文件读写
  readFile: (options) => ipcRenderer.invoke('read-file', options),
  writeFile: (options) => ipcRenderer.invoke('write-file', options),
  // 打开文件（用于打开用户协议等HTML文件）
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  // 获取资源目录路径
  getAssetsPath: () => ipcRenderer.invoke('get-assets-path'),
  // 检查文件是否存在
  fileExists: (path) => ipcRenderer.invoke('file-exists', path),
  // 设置窗口标题
  setTitle: (title) => ipcRenderer.invoke('set-window-title', title)
});