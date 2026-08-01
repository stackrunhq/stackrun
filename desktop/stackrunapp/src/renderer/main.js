

import { t, init as i18nInit, setLanguage, getLanguage, refreshUI } from './i18n/i18n.js';
import { taskManager } from './taskManager.js';
import { taskStore } from './taskStore.js';

// 使用 window.stackrun 和 window.electronAPI（通过 preload.js 暴露）

// ============================================================
//  Toast 提示系统
// ============================================================
const toastQueue = [];
const MAX_TOAST_COUNT = 5;
const TOAST_DISPLAY_DURATION = 3000;

function createToastContainer() {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type = 'info') {
  const container = createToastContainer();

  if (toastQueue.length >= MAX_TOAST_COUNT) {
    const oldestToast = toastQueue.shift();
    if (oldestToast && oldestToast.element) {
      oldestToast.element.remove();
    }
  }

  const toast = document.createElement('div');
  toast.className = `toast-message toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    padding: 12px 24px;
    border-radius: 6px;
    color: white;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 200px;
    max-width: 400px;
    text-align: center;
    opacity: 0;
    transform: translateY(-20px);
    transition: all 0.3s ease;
    pointer-events: auto;
  `;

  const backgroundColors = {
    success: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
    error: 'linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%)',
    warning: 'linear-gradient(135deg, #faad14 0%, #d48806 100%)',
    info: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)'
  };
  toast.style.background = backgroundColors[type] || backgroundColors.info;

  container.appendChild(toast);

  toast.offsetHeight;

  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  const toastObj = {
    element: toast,
    timeoutId: null
  };
  toastQueue.push(toastObj);

  toastObj.timeoutId = setTimeout(() => {
    hideToast(toastObj);
  }, TOAST_DISPLAY_DURATION);
}

function hideToast(toastObj) {
  if (!toastObj || !toastObj.element) return;

  const toast = toastObj.element;
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(-20px)';

  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
    const index = toastQueue.indexOf(toastObj);
    if (index > -1) {
      toastQueue.splice(index, 1);
    }
  }, 300);
}

function showLoading(message) {
  hideAppTooltip();
  
  const loadingIndicator = document.getElementById('loadingIndicator');
  const loadingMessage = document.getElementById('loadingMessage');
  if (loadingIndicator && loadingMessage) {
    loadingMessage.textContent = message || '加载中...';
    loadingIndicator.style.display = 'flex';
  }
}

function hideLoading() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  if (loadingIndicator) {
    loadingIndicator.style.display = 'none';
  }
}

function sanitizeInput(str) {
  if (!str) return '';
  let result = str.trim();
  result = result.replace(/[\u3000\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u200B]/g, '');
  result = result.replace(/["”“''`]/g, '');
  return result;
}

function showModalLoading(loadingId) {
  const loadingDiv = document.getElementById(loadingId);
  if (loadingDiv) {
    loadingDiv.style.display = 'flex';
    loadingDiv.style.alignItems = 'center';
  }
}

function hideModalLoading(loadingId) {
  const loadingDiv = document.getElementById(loadingId);
  if (loadingDiv) {
    loadingDiv.style.display = 'none';
  }
}

function isSuccessResult(result) {
  if (!result) return false;
  if (result.success === false) return false;
  if (result.error) return false;
  if (result.status === 'error') return false;
  if (result.status === 'success') return true;
  if (result.success === true) return true;
  if (result.message && !result.success && !result.status) return false;
  return true;
}

async function showDiskSpaceWarning(operation = t('common.operation') || '操作') {
  try {
    const result = await ipcCall('check-disk-space');
    if (result && result.success) {
      const freeSpaceGB = result.freeSpaceGB;
      if (freeSpaceGB < 3) {
        return new Promise((resolve) => {
          const confirmModal = document.createElement('div');
          confirmModal.className = 'disk-warning-modal-overlay';
          const warningTitle = t('diskWarning.title') || '磁盘空间警告';
          const warningSubtitle = t('diskWarning.criticallyLow') || '磁盘空间严重不足';
          const warningFree = t('diskWarning.currentSpace');
          const warningFreeFallback = `当前可用空间 <strong style="color: #dc3545;">${freeSpaceGB.toFixed(1)}GB</strong>，建议至少保留 3GB 可用空间。`;
          const freeHtml = warningFree && warningFree !== 'diskWarning.currentSpace'
            ? warningFree.replace('{space}', `<strong style="color: #dc3545;">${freeSpaceGB.toFixed(1)}GB</strong>`)
            : warningFreeFallback;
          const continueQuestion = (t('diskWarning.continueQuestion') || `继续${operation}可能导致失败或数据损坏，是否继续？`).replace('{operation}', operation);
          const cancelLabel = t('common.cancel') || '取消';
          const confirmLabel = (t('diskWarning.continueOperation') || `继续${operation}`).replace('{operation}', operation);

          confirmModal.innerHTML = `
            <div class="disk-warning-modal">
              <div class="disk-warning-header">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="width: 40px; height: 40px; background: #dc3545; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                  </div>
                  <div>
                    <div style="font-size: 18px; font-weight: 600; color: #1a1a1a;">${warningTitle}</div>
                    <div style="font-size: 14px; color: #666; margin-top: 4px;">${warningSubtitle}</div>
                  </div>
                </div>
                <button class="disk-warning-close" id="diskWarningCloseBtn" style="background: none; border: none; cursor: pointer; padding: 8px;">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div class="disk-warning-body">
                <p style="font-size: 14px; color: #333; line-height: 1.6;">${freeHtml}</p>
                <p style="font-size: 14px; color: #666; margin-top: 8px;">${continueQuestion}</p>
              </div>
              <div class="disk-warning-footer">
                <button class="btn btn-secondary" id="diskWarningCancelBtn" style="padding: 10px 24px;">
                  ${cancelLabel}
                </button>
                <button class="btn btn-danger" id="diskWarningConfirmBtn" style="padding: 10px 24px; background: #dc3545; border-color: #dc3545;">
                  ${confirmLabel}
                </button>
              </div>
            </div>
          `;
          
          confirmModal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
          `;
          
          const modalContent = confirmModal.querySelector('.disk-warning-modal');
          modalContent.style.cssText = `
            background: white;
            border-radius: 12px;
            width: 90%;
            max-width: 480px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
          `;
          
          const header = confirmModal.querySelector('.disk-warning-header');
          header.style.cssText = `
            padding: 20px 24px;
            border-bottom: 1px solid #eee;
            display: flex;
            align-items: center;
            justify-content: space-between;
          `;
          
          const body = confirmModal.querySelector('.disk-warning-body');
          body.style.cssText = `
            padding: 24px;
          `;
          
          const footer = confirmModal.querySelector('.disk-warning-footer');
          footer.style.cssText = `
            padding: 16px 24px;
            border-top: 1px solid #eee;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
          `;
          
          document.body.appendChild(confirmModal);
          
          const cancelBtn = confirmModal.querySelector('#diskWarningCancelBtn');
          const confirmBtn = confirmModal.querySelector('#diskWarningConfirmBtn');
          const closeBtn = confirmModal.querySelector('#diskWarningCloseBtn');
          
          const closeModal = (result) => {
            confirmModal.remove();
            resolve(result);
          };
          
          cancelBtn.addEventListener('click', () => closeModal(false));
          closeBtn.addEventListener('click', () => closeModal(false));
          confirmBtn.addEventListener('click', () => closeModal(true));
          
          confirmModal.addEventListener('click', (e) => {
            if (e.target === confirmModal) {
              closeModal(false);
            }
          });
        });
      }
    }
  } catch (error) {
    console.error('Failed to check disk space:', error);
  }
  return true;
}

function getResultError(result) {
  if (!result) return 'Unknown error';
  return result.error || result.message || 'Unknown error';
}

function dserverCall(method, params) {
  if (!stackrun.call) {
    return Promise.reject(new Error('stackrun.call is not available'));
  }
  const timeoutMs = 120000;
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`调用 ${method} 超时 (${timeoutMs / 1000}s)`)), timeoutMs);
  });
  return Promise.race([
    stackrun.call(method, params).then(result => {
      if (result && result.success && result.data !== undefined) {
        var data = result.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (e) {}
        }
        return data;
      }
      if (result && result.jsonrpc === '2.0' && result.result !== undefined) {
        var data = result.result;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (e) {}
        }
        return data;
      }
      return result;
    }),
    timeoutPromise
  ]);
}

function ipcCall(channel, ...args) {
  if (!electronAPI.invoke) {
    return Promise.reject(new Error('electronAPI.invoke is not available'));
  }
  return electronAPI.invoke(channel, ...args);
}

function ipcSend(channel, ...args) {
  if (!electronAPI.send) return;
  electronAPI.send(channel, ...args);
}

let containers = [];
let allContainers = [];
let apps = [];
let allAppsMap = {};
let currentContainerId = null;
let currentAppId = null;
let searchKeyword = '';
let isSidebarCollapsed = false;
let totalAppCount = 0;
let totalContainerCount = 0;
let trashContainerCount = 0;
let trashAppCount = 0;
let currentView = 'home';
let appSortBy = localStorage.getItem('appSortBy') || 'date';
let isTaskRunning = false;
let renderToken = 0;
let selectContainerTimer = null;
const containerAppsCache = new Map();
const CACHE_TTL_MS = 5000;

const CONTAINER_TYPES = {
  1: 'WIN XP',
  2: 'WIN 7',
  3: 'WIN 8',
  4: 'WIN 10',
  5: 'WIN 11'
};

const SYSTEM_APP_NAMES = ['Wine Application', 'wine application', 'WineApp'];

function isSystemApp(app) {
  if (!app || !app.name) return false;
  const appName = (app.alias_name || app.name || '').toLowerCase();
  return SYSTEM_APP_NAMES.some(name => appName.includes(name.toLowerCase()));
}

function filterValidApps(apps) {
  if (!Array.isArray(apps)) return [];
  return apps.filter(app => app.id > 0 && app.name && !isSystemApp(app));
}

function initWindowDragGestures() {
  const header = document.querySelector('.header');
  if (!header) return;

  const interactiveSelectors = [
    'button', 'input', 'select', 'textarea', 'label', 'a', '[onclick]',
    '.search-container', '.search-clear-btn', '.edition-badge', '.toggle-btn',
    '.task-btn', '.more-btn', '.more-btn-container', '.auth-btn',
    '.window-controls', '.window-btn', '.refresh-btn', '#headerLoadingIndicator'
  ];
  const isInteractive = (el) => {
    if (!el || !(el instanceof Element)) return false;
    for (const sel of interactiveSelectors) {
      if (el.closest(sel)) return true;
    }
    return false;
  };

  header.addEventListener('dblclick', (e) => {
    if (e.button !== 0) return;
    if (isInteractive(e.target)) return;
    if (typeof window.electronAPI?.maximizeWindow === 'function') {
      window.electronAPI.maximizeWindow();
    }
  });
}

function syncMainLanguage(lang) {
  try {
    if (!window.electronAPI?.setMainLanguage) return;
    const p = window.electronAPI.setMainLanguage(lang);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (_) {}
}

async function initAssetPaths() {
  try {
    if (window.electronAPI && window.electronAPI.getAssetsPath) {
      const assetsPath = await window.electronAPI.getAssetsPath();
      if (assetsPath) {
        window.ASSETS_PATH = 'file://' + assetsPath.replace(/\\/g, '/');
        const replacePaths = () => {
          replaceAssetPaths();
        };
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', replacePaths);
        } else {
          setTimeout(replacePaths, 100);
        }
      }
    }
  } catch (e) {
    console.error('[Renderer] Failed to init asset paths:', e);
  }
}

function replaceAssetPaths() {
  if (!window.ASSETS_PATH) return;
  
  const images = document.querySelectorAll('img[src^="../../assets/images/"]');
  images.forEach(img => {
    const relativePath = img.getAttribute('src').replace('../../assets/images/', '');
    img.setAttribute('src', window.ASSETS_PATH + '/images/' + relativePath);
  });
  
  const cssLinks = document.querySelectorAll('link[href^="../../assets/"]');
  cssLinks.forEach(link => {
    const relativePath = link.getAttribute('href').replace('../../assets/', '');
    link.setAttribute('href', window.ASSETS_PATH + '/' + relativePath);
  });
  
  const styleElements = document.querySelectorAll('style');
  styleElements.forEach(style => {
    let content = style.textContent;
    content = content.replace(/url\(['"]?\.\.\/\.\.\/assets\/images\/([^'")]+)['"]?\)/g, 
                             `url('${window.ASSETS_PATH}/images/$1')`);
    style.textContent = content;
  });
}

function getAssetUrl(relativePath) {
  if (!relativePath) return '';
  
  if (window.ASSETS_PATH) {
    if (relativePath.startsWith('../../assets/images/')) {
      const path = relativePath.replace('../../assets/images/', '');
      return window.ASSETS_PATH + '/images/' + path;
    } else if (relativePath.startsWith('./assets/images/')) {
      const path = relativePath.replace('./assets/images/', '');
      return window.ASSETS_PATH + '/images/' + path;
    } else if (relativePath.startsWith('/assets/images/')) {
      const path = relativePath.replace('/assets/images/', '');
      return window.ASSETS_PATH + '/images/' + path;
    } else if (relativePath.startsWith('assets/images/')) {
      const path = relativePath.replace('assets/images/', '');
      return window.ASSETS_PATH + '/images/' + path;
    }
  }
  
  return relativePath;
}

let _eventListenersRegistered = false;

function init() {
  console.log('[DEBUG] init() called at', new Date().toISOString());
  if (electronAPI.send) {
    electronAPI.send('renderer-log', '[DEBUG] init() called at ' + new Date().toISOString());
  }
  
  initAssetPaths();
  
  appSortBy = 'date';
  localStorage.setItem('appSortBy', appSortBy);
  
  i18nInit();
  syncMainLanguage(getLanguage());
  refreshUI();
  initTheme();
  updateEditionBadge();
  updateAuthButton();
  initSidebarIcon();
  initWindowDragGestures();
  
  console.log('[DEBUG] Registering event listeners before loadContainers');
  if (electronAPI.send) {
    electronAPI.send('renderer-log', '[DEBUG] Registering event listeners before loadContainers');
  }

  if (window.electronAPI && window.electronAPI.receive && !_eventListenersRegistered) {
    _eventListenersRegistered = true;
    
    window.electronAPI.receive('event:container.created', (data) => {
      console.log('[Renderer] Received container.created event:', data);
      loadContainers(true);
    });

    window.electronAPI.receive('event:container.moved_to_trash', (data) => {
      console.log('[Renderer] Received container.moved_to_trash event:', data);
      loadContainers(true);
    });

    window.electronAPI.receive('event:container.restored', (data) => {
      console.log('[Renderer] Received container.restored event:', data);
      loadContainers(true);
    });

    window.electronAPI.receive('event:container.purged', (data) => {
      console.log('[Renderer] Received container.purged event:', data);
      loadContainers(true);
    });

    window.electronAPI.receive('event:task.completed', (data) => {
      console.log('[Renderer] Received task.completed event:', data);
      let taskData = data;
      if (Array.isArray(data) && data.length > 0) {
        taskData = data[0];
      }
      
      loadContainers(true).then(() => {
        if (currentView === 'home') {
          renderHome();
        } else if (currentView === 'detail' && currentContainerId) {
          const container = containers.find(c => String(c.id) === String(currentContainerId));
          if (container) {
            renderContainerDetail(currentContainerId);
          } else {
            currentView = 'home';
            currentContainerId = null;
            renderHome();
          }
        } else {
          renderHome();
        }
      });
    });
  }
  
  console.log('[DEBUG] Calling taskManager.recoverTasks()');
  if (electronAPI.send) {
    electronAPI.send('renderer-log', '[DEBUG] Calling taskManager.recoverTasks()');
  }
  taskManager.recoverTasks();
  
  console.log('[DEBUG] Waiting for dserver:connected event before loading containers');
  if (electronAPI.send) {
    electronAPI.send('renderer-log', '[DEBUG] Waiting for dserver:connected event before loading containers');
  }

  // 主动检查连接状态：如果 dserver:connected 事件已经在监听器注册前发送过，
  // 通过 isConnected 检查来补获丢失的事件，直接触发 loadContainers
  if (stackrun.isConnected) {
    stackrun.isConnected().then((connected) => {
      if (connected) {
        console.log('[DEBUG] DServer already connected, loading containers directly');
        if (electronAPI.send) {
          electronAPI.send('renderer-log', '[DEBUG] DServer already connected, loading containers directly');
        }
        hideLoadingOverlay();
        loadContainers();
      }
    }).catch(() => {});
  }

  stackrun.onProgress && stackrun.onProgress((data) => {
    const progressBarFill = document.getElementById('progressBarFill');
    const progressText = document.getElementById('progressText');
    if (progressBarFill && progressText) {
      progressBarFill.style.width = data.progress + '%';
      progressText.textContent = data.progress + '%';
    }
  });

  stackrun.onServerOnline && stackrun.onServerOnline(async () => {
    taskManager.recoverTasks();
    
    try {
      await getAuthStatus();
      updateAuthHeaderImage();
      updateEditionBadge();
    } catch (e) {
      console.error('Failed to update auth status on server online:', e);
    }
    
    dserverCall('task.list').then(result => {
      if (Array.isArray(result)) {
        result.forEach(task => {
          if (task.status === 'running' && 
              (task.type === 'app_uninstall' || task.type === 'app_install') &&
              task.container_id) {
            if (!uninstallingContainers.has(task.container_id)) {
              uninstallingContainers.set(task.container_id, new Set());
            }
            uninstallingContainers.get(task.container_id).add(task.task_id);
          }
        });
      }
    }).catch(err => {
      console.error('Failed to load active tasks:', err);
    });
    
    checkEnvironmentStatus();
    
    loadContainers();
  });
  
  stackrun.onDisconnected && stackrun.onDisconnected(() => {
    showToast(t('message.serverDisconnected'), 'error');
  });
}

let _containersLoaded = false;
let _environmentChecked = false;

async function checkEnvironmentStatus() {
  if (_environmentChecked) return;
  _environmentChecked = true;
  
  try {
    if (stackrun.hello) {
      const helloResult = await stackrun.hello();
      if (helloResult && helloResult.success && helloResult.data) {
        const env = helloResult.data.environment;
        if (env) {
          console.log('[Main] Environment status:', env.status, 'i386:', env.i386);
          
          if (env.status === 3) {
            showToast(t('message.environmentPreparing') || '运行环境正在初始化，请稍候...', 'info');
          } else if (env.status !== 1) {
            showEnvironmentPrepareModal(env);
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to check environment status:', e);
  }
}

function showEnvironmentPrepareModal(env) {
  const modal = document.createElement('div');
  modal.id = 'environment-prepare-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 32px;
    max-width: 400px;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  `;
  
  const icon = document.createElement('div');
  icon.innerHTML = '⚠️';
  icon.style.fontSize = '48px';
  icon.style.marginBottom = '16px';
  
  const title = document.createElement('h2');
  title.textContent = t('message.environmentNotReady') || '运行环境未就绪';
  title.style.fontSize = '18px';
  title.style.marginBottom = '12px';
  title.style.color = '#333';
  
  const desc = document.createElement('p');
  desc.textContent = t('message.environmentNeedPrepare') || '需要安装 Windows 32位应用运行环境。安装过程可能需要几分钟，请保持网络连接。';
  desc.style.fontSize = '14px';
  desc.style.color = '#666';
  desc.style.marginBottom = '24px';
  desc.style.lineHeight = '1.6';
  
  const installBtn = document.createElement('button');
  installBtn.textContent = t('button.install') || '安装';
  installBtn.style.cssText = `
    background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
    color: white;
    border: none;
    padding: 12px 48px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
  `;
  
  installBtn.onmouseover = () => {
    installBtn.style.transform = 'translateY(-2px)';
    installBtn.style.boxShadow = '0 4px 12px rgba(24, 144, 255, 0.4)';
  };
  
  installBtn.onmouseout = () => {
    installBtn.style.transform = 'translateY(0)';
    installBtn.style.boxShadow = 'none';
  };
  
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = t('button.cancel') || '稍后安装';
  cancelBtn.style.cssText = `
    background: transparent;
    color: #999;
    border: 1px solid #e8e8e8;
    padding: 12px 32px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    margin-left: 12px;
    transition: all 0.3s ease;
  `;
  
  cancelBtn.onmouseover = () => {
    cancelBtn.style.color = '#666';
    cancelBtn.style.borderColor = '#d9d9d9';
  };
  
  const btnContainer = document.createElement('div');
  btnContainer.appendChild(installBtn);
  btnContainer.appendChild(cancelBtn);
  
  content.appendChild(icon);
  content.appendChild(title);
  content.appendChild(desc);
  content.appendChild(btnContainer);
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  installBtn.onclick = async () => {
    installBtn.disabled = true;
    installBtn.textContent = t('button.installing') || '安装中...';
    
    try {
      if (stackrun.prepareEnvironment) {
        const result = await stackrun.prepareEnvironment();
        if (result && result.success && result.data) {
          const taskId = result.data.task_id || result.data.taskId;
          console.log('[Main] Environment prepare task created:', taskId);
          
          if (taskId) {
            showToast(t('message.environmentPreparing') || '运行环境正在初始化，请稍候...', 'info');
            
            installBtn.textContent = t('button.installing') || '安装中...';
            
            const checkTask = async () => {
              try {
                const taskRes = await dserverCall('task.get', { task_id: taskId });
                if (taskRes && (taskRes.status === 'completed' || taskRes.result && taskRes.result.status === 'completed')) {
                  showToast(t('message.environmentReady') || '运行环境初始化完成', 'success');
                  modal.remove();
                  loadContainers(true);
                } else if (taskRes && (taskRes.status === 'failed' || taskRes.result && taskRes.result.status === 'failed')) {
                  installBtn.disabled = false;
                  installBtn.textContent = t('button.retry') || '重试';
                  showToast(t('message.environmentPrepareFailed') || '运行环境安装失败，请重试', 'error');
                } else {
                  setTimeout(checkTask, 3000);
                }
              } catch (e) {
                setTimeout(checkTask, 3000);
              }
            };
            
            setTimeout(checkTask, 3000);
          } else {
            installBtn.disabled = false;
            installBtn.textContent = t('button.install') || '安装';
          }
        }
      }
    } catch (e) {
      console.error('Failed to prepare environment:', e);
      installBtn.disabled = false;
      installBtn.textContent = t('button.install') || '安装';
      showToast(t('message.environmentPrepareFailed') || '运行环境安装失败，请重试', 'error');
    }
  };
  
  cancelBtn.onclick = () => {
    modal.remove();
  };
}

let _containersLoading = false;
let _pendingContainerLoad = null;

function loadContainers(force = false) {
  console.log('[DEBUG] loadContainers called, force:', force, '_containersLoaded:', _containersLoaded, '_containersLoading:', _containersLoading);
  if (electronAPI.send) {
    electronAPI.send('renderer-log', '[DEBUG] loadContainers called, force=' + force + ', _containersLoaded=' + _containersLoaded + ', _containersLoading=' + _containersLoading);
  }
  
  if (_containersLoaded && !force) {
    console.log('[DEBUG] loadContainers already called, skipping');
    if (electronAPI.send) {
      electronAPI.send('renderer-log', '[DEBUG] loadContainers already called, skipping');
    }
    return Promise.resolve();
  }
  
  if (_containersLoading) {
    console.log('[DEBUG] loadContainers already in progress, queuing request');
    if (electronAPI.send) {
      electronAPI.send('renderer-log', '[DEBUG] loadContainers already in progress, queuing request');
    }
    
    return new Promise((resolve) => {
      _pendingContainerLoad = () => {
        _pendingContainerLoad = null;
        loadContainers(true).then(resolve).catch(resolve);
      };
    });
  }
  
  if (force) {
    _containersLoaded = false;
  }
  
  _containersLoading = true;
  
  return dserverCall('container.list', { includeTrash: 1 })
    .then(result => {
      console.log('[DEBUG] loadContainers result:', JSON.stringify(result).substring(0, 500));
      if (electronAPI.send) {
        electronAPI.send('renderer-log', '[DEBUG] loadContainers result len=' + (result ? (Array.isArray(result) ? result.length : typeof result) : 'null'));
      }
      
      let containerList = result;
      if (!Array.isArray(result)) {
        if (result && result.data && Array.isArray(result.data)) {
          containerList = result.data;
        } else if (result && result.result && Array.isArray(result.result)) {
          containerList = result.result;
        } else if (result && result.success !== undefined && result.data !== undefined) {
          containerList = Array.isArray(result.data) ? result.data : [];
        }
      }
      
      if (Array.isArray(containerList)) {
        allContainers = containerList;
        containers = containerList.filter(c => c && c.status !== 5);
        trashContainerCount = containerList.filter(c => c && c.status === 5).length;
        totalContainerCount = containerList.length;
        
        console.log('[DEBUG] loadContainers parsed:', containers.length, 'containers, all:', allContainers.length);
        if (electronAPI.send) {
          electronAPI.send('renderer-log', '[DEBUG] loadContainers parsed: ' + containers.length + ' containers, all: ' + allContainers.length);
        }
        
        return loadTotalAppCount().then(() => {
          _containersLoaded = true;
          _containersLoading = false;
          
          renderSidebar();
          
          if (containers.length > 0) {
            if (currentContainerId) {
              const container = containers.find(c => c && String(c.id) === String(currentContainerId));
              if (container) {
                renderContainerDetail(currentContainerId);
              } else {
                currentContainerId = null;
                currentView = 'home';
                renderHome();
              }
            } else if (currentView === 'home') {
              renderHome();
            } else {
              renderHome();
            }
          } else {
            handleEmptyContainerList();
          }
          
          if (_pendingContainerLoad) {
            _pendingContainerLoad();
          }
        });
      } else {
        console.log('[DEBUG] loadContainers result is not an array, triggering ensureDefaultContainer');
        if (electronAPI.send) {
          electronAPI.send('renderer-log', '[DEBUG] loadContainers result is not an array, triggering ensureDefaultContainer');
        }
        _containersLoaded = false;
        _containersLoading = false;
        taskManager.ensureDefaultContainer();
        
        if (_pendingContainerLoad) {
          _pendingContainerLoad();
        }
      }
    })
    .catch((err) => {
      console.error('[DEBUG] loadContainers failed:', err);
      if (electronAPI.send) {
        electronAPI.send('renderer-log', '[DEBUG] loadContainers failed: ' + (err && err.message ? err.message : err));
      }
      _containersLoaded = false;
      _containersLoading = false;
      taskManager.ensureDefaultContainer();
      
      if (_pendingContainerLoad) {
        _pendingContainerLoad();
      }
    });
}

async function handleEmptyContainerList() {
  const initTaskId = window.stackrunInitTaskId;
  if (initTaskId) {
    try {
      const tRes = await dserverCall('task.status', { taskId: initTaskId });
      const task = tRes && tRes.status ? tRes : null;
      
      if (task && (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled')) {
        delete window.stackrunInitTaskId;
        if (task.status === 'completed') {
          _containersLoaded = false;
          setTimeout(() => loadContainers(true), 100);
          return;
        }
        taskManager.ensureDefaultContainer();
      } else if (task && (task.status === 'running' || task.status === 'initializing')) {
        console.log('[Main] Backend is creating default container, waiting for task:', initTaskId);
        taskManager.showDefaultContainerModal();
      } else {
        delete window.stackrunInitTaskId;
        taskManager.ensureDefaultContainer();
      }
    } catch (e) {
      console.log('[Main] Backend is creating default container, waiting for task:', initTaskId);
      taskManager.showDefaultContainerModal();
    }
  } else {
    taskManager.ensureDefaultContainer();
  }
}

async function loadTotalAppCount() {
  totalAppCount = 0;
  trashAppCount = 0;
  for (const container of allContainers) {
    try {
      const result = await dserverCall('app.list', { containerId: container.id });
      if (result && Array.isArray(result)) {
        const validApps = filterValidApps(result);
        if (container.status === 5) {
          trashAppCount += validApps.length;
        } else {
          totalAppCount += validApps.length;
        }
      }
    } catch (err) {
      console.warn('[Main] Failed to load apps for container:', container.id, err.message);
    }
  }
}

/*
 * 前端创建默认工作区（使用国际化名称）
 */


function showDefaultContainerError(errorMsg) {
  const modal = document.getElementById('createDefaultContainerModal');
  const title = document.getElementById('defaultContainerModalTitle');
  const errorEl = document.getElementById('defaultContainerErrorMessage');
  const closeBtn = document.getElementById('defaultContainerCloseBtn');
  const retryBtn = document.getElementById('defaultContainerRetryBtn');
  const progressContainer = document.getElementById('defaultContainerProgressContainer');
  const progressText = document.getElementById('defaultContainerProgressText');
  
  if (title) title.textContent = t('defaultContainer.failedTitle');
  if (progressContainer) progressContainer.style.display = 'none';
  if (progressText) progressText.style.display = 'none';
  if (errorEl) {
    errorEl.textContent = t('defaultContainer.failedMessage', { error: errorMsg });
    errorEl.style.display = 'block';
  }
  if (closeBtn) closeBtn.style.display = 'inline-block';
  if (retryBtn) retryBtn.style.display = 'inline-block';
  if (modal) modal.classList.add('active');
}

function retryCreateDefaultContainer() {
  taskManager.retryCreateDefaultContainer();
}

function closeDefaultContainerModal() {
  taskManager.closeDefaultContainerModal();
}

function loadApps(containerId = currentContainerId) {
  if (!containerId) return;
  const cacheKey = String(containerId);
  containerAppsCache.delete(cacheKey);
  dserverCall('app.list', { containerId }).then(result => {
    if (result && Array.isArray(result)) {
      const mappedApps = result.map(app => {
        const appData = mapAppData(app);
        allAppsMap[app.id] = appData;
        return appData;
      });
      apps = filterValidApps(mappedApps);
      containerAppsCache.set(cacheKey, { apps: [...apps], time: Date.now() });
      if (currentContainerId === containerId) {
        renderAppGrid();
        if (currentView === 'detail') {
          renderAppsList(apps, containerId);
        }
      }
    }
  }).catch(err => {
    console.error('Failed to load apps:', err);
  });
}

function getAppIconUrl(iconPath) {
  if (!iconPath) {
    return getAssetUrl('../../assets/images/empty.png');
  }
  if (iconPath.startsWith('/')) {
    return `file://${iconPath}`;
  }
  return getAssetUrl('../../assets/images/empty.png');
}

function mapAppData(app) {
  const iconSrc = getAppIconUrl(app.icon_path);
  return {
    ...app,
    id: app.id,
    icon: iconSrc,
    name: app.alias_name || app.name,
    version: app.product_version || app.version,
    size: app.file_size_kb || app.size || 0,
    dateModified: app.date_modified || '',
    launchArguments: app.launch_arguments || '',
    env: app.env || '',
    kernelArgs: app.kernel_args || ''
  };
}

function updateSidebarActiveState(containerId) {
  const sidebarList = document.getElementById('sidebarList');
  if (!sidebarList) return;
  const items = sidebarList.querySelectorAll('.sidebar-item');
  items.forEach(item => {
    const itemContainerId = item.getAttribute('data-container-id');
    if (itemContainerId) {
      if (String(itemContainerId) === String(containerId)) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    } else {
      if (!containerId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    }
  });
}

function renderSidebar() {
  const sidebarList = document.getElementById('sidebarList');
  if (!sidebarList) return;
  sidebarList.innerHTML = '';

  // 首页项
  const homeLi = document.createElement('li');
  homeLi.className = `sidebar-item ${!currentContainerId ? 'active' : ''}`;
  homeLi.onclick = () => switchToHome();
  homeLi.innerHTML = `
    <div class="sidebar-item-content">
      <div class="sidebar-item-icon">
        <img src="${getAssetUrl('../../assets/images/home.png')}" alt="${t('sidebar.home')}" width="24" height="24">
      </div>
      <div class="sidebar-item-text">
        <div class="sidebar-item-name" title="${t('sidebar.home')}">${t('sidebar.home')}</div>
        <div class="sidebar-item-desc" title="${t('sidebar.homeDesc')}">${t('sidebar.homeDesc')}</div>
      </div>
    </div>
  `;
  sidebarList.appendChild(homeLi);

  // 按 sort_index 排序容器
  const sortedContainers = [...containers].sort((a, b) => {
    const sortA = a.sort_index !== undefined ? a.sort_index : 0;
    const sortB = b.sort_index !== undefined ? b.sort_index : 0;
    return sortA - sortB;
  });

  sortedContainers.forEach(container => {
    const li = document.createElement('li');
    const containerId = container.id;
    li.className = `sidebar-item ${String(currentContainerId) === String(containerId) ? 'active' : ''}`;
    li.setAttribute('data-container-id', containerId);
    li.onclick = () => selectContainer(containerId);
    
    const osType = container.type || container.os_type || 4;
    const typeName = CONTAINER_TYPES[osType] || 'Unknown';
    const iconPath = getAssetUrl(`../../assets/images/${osType}-1.png`);
    
    li.innerHTML = `
      <div class="sidebar-item-content">
        <div class="sidebar-item-icon">
          <img src="${iconPath}" alt="${container.name || 'Unnamed'}" width="24" height="24">
        </div>
        <div class="sidebar-item-text">
          <div class="sidebar-item-name" title="${container.name || 'Unnamed'}">${container.name || 'Unnamed'}</div>
          ${container.description || container.notes ? `<div class="sidebar-item-desc" title="${container.description || container.notes}">${container.description || container.notes}</div>` : ''}
        </div>
      </div>
    `;
    sidebarList.appendChild(li);
  });

  const footer = document.createElement('div');
  footer.className = 'sidebar-footer';
  footer.innerHTML = `<button class="add-container-btn" onclick="showCreateContainerModal()">${t('sidebar.newContainer')}</button>`;
  sidebarList.appendChild(footer);
}

function switchToHome() {
  currentContainerId = null;
  currentView = 'home';
  renderSidebar();
  const contentHeader = document.getElementById('contentHeader');
  if (contentHeader) {
    contentHeader.style.display = 'flex';
  }
  renderHome();
}

function selectContainer(containerId) {
  currentContainerId = containerId;
  updateSidebarActiveState(containerId);
  hideAppTooltip();

  const cached = containerAppsCache.get(String(containerId));
  if (cached && (Date.now() - cached.time < CACHE_TTL_MS)) {
    renderContainerDetail(containerId);
    return;
  }

  if (selectContainerTimer) {
    clearTimeout(selectContainerTimer);
  }
  selectContainerTimer = setTimeout(() => {
    renderContainerDetail(containerId);
  }, 150);
}

async function renderHome() {
  currentView = 'home';
  hideAppTooltip();
  const contentHeader = document.getElementById('contentHeader');
  const contentBody = document.getElementById('contentBody');
  if (!contentHeader || !contentBody) return;

  contentHeader.style.display = 'flex';

  try {
    await loadTotalAppCount();
  } catch (err) {
    console.warn('[Main] Failed to load total app count:', err.message);
  }

  let filteredContainers = containers;

  const containersTpl = t('home.totalContainers', { totalContainers: `<span id="totalContainers">${totalContainerCount}</span>` });
  const appsTpl = t('home.totalApps', { totalApps: `<span id="totalApps">${totalAppCount + trashAppCount}</span>` });

  contentHeader.innerHTML = `
    <div class="home-header">
      <div class="home-header-left">
        <span class="stat-item">${containersTpl}</span>
        <span class="stat-item" style="margin-left: 16px;">${appsTpl}</span>
      </div>
      <div style="display: flex; gap: 8px; margin-left: auto;">
        <button class="btn btn-primary" onclick="showCreateContainerModal()">${t('home.newContainer')}</button>
        <button class="btn btn-secondary" onclick="showImportContainerModal()">${t('home.importContainer')}</button>
        <button class="btn btn-secondary" onclick="showAddAppModal()">${t('home.addApp')}</button>
      </div>
    </div>
  `;

  try {
    let containersWithApps = await Promise.all(filteredContainers.map(async (container) => {
      const containerId = container.id;
      try {
        const result = await dserverCall('app.list', { containerId });
        let apps = (result && Array.isArray(result))
          ? result.map(app => {
              const iconSrc = getAppIconUrl(app.icon_path);
              const appData = {
                ...app,
                id: app.id,
                icon: iconSrc,
                name: app.alias_name || app.name,
                version: app.product_version || app.version,
                size: app.file_size_kb || app.size || 0,
                dateModified: app.date_modified || '',
                launchArguments: app.launch_arguments || '',
                env: app.env || '',
                kernelArgs: app.kernel_args || ''
              };
              allAppsMap[app.id] = appData;
              return appData;
            })
          : [];
        
        apps = filterValidApps(apps);
        
        apps.sort((a, b) => {
          if (appSortBy === 'name') {
            const nameA = (a.alias_name || a.name || '').toLowerCase();
            const nameB = (b.alias_name || b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
          } else {
            const dateA = a.date_modified ? new Date(a.date_modified).getTime() : 0;
            const dateB = b.date_modified ? new Date(b.date_modified).getTime() : 0;
            return dateB - dateA;
          }
        });
        
        return { container, apps };
      } catch (err) {
        return { container, apps: [] };
      }
    }));

    if (searchKeyword) {
      const filtered = [];
      for (const { container, apps } of containersWithApps) {
        const containerName = (container.name || container.alias_name || '').toLowerCase();
        const isDefaultContainer = containerName.includes('默认工作区');
        const containerMatches = containerName.includes(searchKeyword.toLowerCase());
        
        const filteredApps = apps.filter(app => {
          const appName = ((app.name || app.alias_name || '')).toLowerCase();
          return appName.includes(searchKeyword.toLowerCase());
        });
        
        if (isDefaultContainer) {
          filtered.push({ container, apps: filteredApps });
        } else if (containerMatches || filteredApps.length > 0) {
          filtered.push({ container, apps: containerMatches ? apps : filteredApps });
        }
      }
      containersWithApps = filtered;
    }

    const containerCount = containersWithApps.length;
    const defaultContainer = containersWithApps.find(c => (c.container.name || c.container.alias_name || '').toLowerCase().includes('默认工作区'));
    const otherContainers = containersWithApps.filter(c => !(c.container.name || c.container.alias_name || '').toLowerCase().includes('默认工作区')).sort((a, b) => {
      const dateA = a.container.date_created ? new Date(a.container.date_created).getTime() : 0;
      const dateB = b.container.date_created ? new Date(b.container.date_created).getTime() : 0;
      return dateB - dateA;
    });

    const allContainers = defaultContainer ? [defaultContainer, ...otherContainers] : otherContainers;

    if (containerCount === 0) {
      contentBody.innerHTML = `
        <div class="container-grid" id="containerGrid">
          <div class="empty-containers">
            <img src="${getAssetUrl('../../assets/images/empty.png')}" alt="Empty" width="128" height="128">
            <p>${t('home.noContainers')}</p>
            <p>${t('home.clickNewContainer')}</p>
          </div>
        </div>
      `;
    } else {
      let gridClass = '';
      if (containerCount === 1) {
        gridClass = 'single-container';
      } else if (containerCount === 2) {
        gridClass = 'two-columns';
      }

      let containersHtml = `
        <div class="container-grid ${gridClass}" id="containerGrid">
      `;

      for (const { container, apps } of allContainers) {
        const containerId = container.id;
        const osType = container.type || container.os_type || 4;
        const iconPath = getAssetUrl(`../../assets/images/${osType}-1.png`);
        const containerName = container.name || container.alias_name || 'Unnamed';
        const appCount = apps.length;

        let appsHtml = '';
        if (appCount === 0) {
          appsHtml = `
            <div class="container-card-apps empty-apps" onclick="event.stopPropagation();" ondblclick="event.stopPropagation(); setCurrentContainerAndShowAppModal('${containerId}')">
              <img src="${getAssetUrl('../../assets/images/empty.png')}" alt="${t('home.noApps')}" width="80" height="80">
              <p>${t('home.noApps')}</p>
            </div>
          `;
        } else {
          appsHtml = `
            <div class="container-card-apps scrollable-apps" onclick="event.stopPropagation();">
              <div class="apps-grid">
                ${apps.map(app => {
                  const appVersion = app.version || '';
                  const appSize = app.size ? app.size + ' KB' : '未知';
                  const modifyDate = app.dateModified ? new Date(app.dateModified).toLocaleString() : '未知';
                  const safeAppName = (app.name || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
                  const safeAppVersion = (appVersion || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
                  const safeAppSize = (appSize || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
                  const safeModifyDate = (modifyDate || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
                  const safeExePath = (app.exe_path || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
                  return `
                    <div class="app-item" data-app-id="${app.id}" data-app-guid="${app.guid}" data-app-name="${safeAppName}" data-exe-path="${safeExePath}" onclick="event.stopPropagation(); selectAppItem(this)" oncontextmenu="event.stopPropagation(); showAppContextMenu(event, '${app.id}', '${containerId}')" ondblclick="event.stopPropagation(); launchAppFromHome('${app.guid}', '${containerId}')" onmouseenter="showAppTooltip(event, '${safeAppName}', '${safeAppVersion}', '${safeAppSize}', '${safeModifyDate}')" onmouseleave="hideAppTooltip()">
                      <div class="app-icon-container">
                        <img src="${app.icon || ''}" alt="${safeAppName}" class="app-icon">
                      </div>
                      <span class="app-name">${safeAppName}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        containersHtml += `
          <div class="container-card" data-container-id="${containerId}" data-container-path="${container.wine_prefix_full_path || ''}" ondblclick="event.stopPropagation(); setCurrentContainerAndShowAppModal('${containerId}')" oncontextmenu="event.stopPropagation(); showContainerContextMenu(event, '${containerId}')">
            <div class="container-card-header">
              <div class="container-card-info">
                <div class="container-card-name" title="${containerName}">${containerName} (${appCount})</div>
              </div>
              <div class="container-card-actions">
                <button class="btn btn-sm btn-secondary" onclick="selectContainer('${containerId}')">${t('home.details')}</button>
              </div>
            </div>
            ${appsHtml}
          </div>
        `;
      }

      containersHtml += `</div>`;
      contentBody.innerHTML = containersHtml;
    }
  } catch (error) {
    console.error('Error loading containers for home page:', error);
    console.error('Error stack:', error.stack);
    contentBody.innerHTML = `
      <div class="container-grid" id="containerGrid">
        <p>${t('errors.loadingContainersFailed')}</p>
        <p style="font-size: 12px; color: #999;">${error.message}</p>
      </div>
    `;
  }
}

function renderAppsList(apps, containerId) {
    const appsList = document.querySelector('.apps-list');
    if (!appsList) return;
    
    let currentApps = [...apps];
    
    if (searchKeyword) {
        currentApps = currentApps.filter(app => {
            const appName = app.alias_name || app.name || '';
            return appName.toLowerCase().includes(searchKeyword.toLowerCase());
        });
    }

    currentApps.sort((a, b) => {
        if (appSortBy === 'name') {
            const nameA = (a.alias_name || a.name || '').toLowerCase();
            const nameB = (b.alias_name || b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        } else {
            const dateA = a.date_modified ? new Date(a.date_modified).getTime() : 0;
            const dateB = b.date_modified ? new Date(b.date_modified).getTime() : 0;
            return dateB - dateA;
        }
    });

    if (currentApps.length === 0) {
        appsList.innerHTML = `
        <div class="empty-apps">
            <img src="${getAssetUrl('../../assets/images/empty.png')}" alt="无应用" width="120" height="120">
            <p>该工作区中暂无应用</p>
        </div>
        `;
    } else {
        appsList.innerHTML = `
        <div class="apps-grid">
            ${currentApps.map(app => {
            const iconSrc = getAppIconUrl(app.icon_path);
            const appName = app.alias_name || app.name || '';
            const appVersion = app.product_version || app.version || '';
            const appSize = app.file_size_kb ? app.file_size_kb + ' KB' : '未知';
            const modifyDate = app.date_modified ? new Date(app.date_modified).toLocaleString() : '未知';
            return `
            <div class="app-item" data-app-id="${app.id}" data-app-guid="${app.guid}" data-app-name="${appName}" data-app-size="${appSize}" data-modify-date="${modifyDate}" onclick="event.stopPropagation(); selectAppItem(this)" oncontextmenu="event.stopPropagation(); showAppContextMenu(event, '${app.id}', '${containerId}')" ondblclick="event.stopPropagation(); launchApp('${app.guid}')" onmouseenter="showAppTooltip(event, '${appName}', '${appVersion}', '${appSize}', '${modifyDate}')" onmouseleave="hideAppTooltip()">
                <div class="app-icon-container">
                <img src="${iconSrc}" alt="${appName}" class="app-icon">
                </div>
                <span class="app-name">${appName}</span>
            </div>
            `;
            }).join('')}
        </div>
        `;
    }
}

async function renderContainerDetail(containerId) {
  currentView = 'detail';
  const currentRenderToken = ++renderToken;
  const container = containers.find(c => String(c.id) === String(containerId));
  if (!container) return;

  const contentHeader = document.getElementById('contentHeader');
  const contentBody = document.getElementById('contentBody');
  const osType = container.type || container.os_type || 4;
  const typeName = CONTAINER_TYPES[osType] || 'Unknown';
  const iconPath = getAssetUrl(`../../assets/images/${osType}-1.png`);
  const containerName = container.name || container.alias_name || 'Unnamed';
  const containerNotes = container.description || container.notes || '';
  const editIconUrl = getAssetUrl('../../assets/images/edit.png');

  if (contentHeader) {
    contentHeader.innerHTML = '';
    contentHeader.style.display = 'none';
  }

  contentBody.innerHTML = `
    <div class="container-detail" data-container-id="${containerId}" data-container-path="${container.wine_prefix_full_path || ''}" style="height: 100%; display: flex; flex-direction: column;" oncontextmenu="showContainerContextMenu(event, '${containerId}')">
      <div class="container-info" style="position: relative;">
        <div class="container-icon">
          <img src="${iconPath}" alt="${containerName}">
        </div>
        <div class="container-details">
          <div style="position: absolute; top: 0; right: 0;">
            <button class="btn btn-secondary" onclick="switchToHome()" style="display: flex; align-items: center; gap: 5px;">
              <img src="${getAssetUrl('../../assets/images/home.png')}" alt="${t('containerDetail.backHome')}" width="16" height="16">
              <span>${t('containerDetail.backHome')}</span>
            </button>
          </div>
          <div class="detail-row">
            <label>${t('containerDetail.containerName')}：</label>
            <span title="${containerName}">${containerName}</span>
            ${!(container.is_default === 1 || container.is_default === true) ? `<button data-container-id="${containerId}" data-container-name="${containerName}" class="edit-name-btn edit-btn"><img src="${editIconUrl}" alt="${t('containerDetail.edit')}" width="14" height="14"></button>` : ''}
          </div>
          <div class="detail-row">
            <label>${t('containerDetail.containerType')}：</label>
            <span>${typeName}</span>
          </div>
          <div class="detail-row">
            <label>${t('containerDetail.createTime')}：</label>
            <span>${container.date_created ? formatDateTime(container.date_created) : t('containerDetail.unknown')}</span>
          </div>
          <div class="detail-row">
            <label>${t('containerDetail.containerDescription')}：</label>
            <span class="container-detail-desc" title="${containerNotes || t('containerDetail.noDescription')}">${containerNotes || t('containerDetail.noDescription')}</span>
            <button data-container-id="${containerId}" data-container-notes="${containerNotes || ''}" class="edit-notes-btn edit-btn"><img src="${editIconUrl}" alt="${t('containerDetail.edit')}" width="14" height="14"></button>
          </div>
          <div class="container-actions" style="justify-content: flex-end; margin: 0; padding: 0; background: none; border: none;">
            <button class="btn btn-primary" onclick="showAddAppModal()">${t('containerDetail.addApp')}</button>
            <button class="btn btn-secondary" onclick="showUninstallAppModal('${containerId}')">${t('containerDetail.uninstallApp')}</button>
            <button class="btn btn-danger" onclick="showDeleteContainerModal('${containerId}', '${containerName}')">${t('containerDetail.deleteContainer')}</button>
            <button class="btn btn-secondary" onclick="showExportContainerModal('${containerId}')">${t('containerDetail.exportContainer')}</button>
            <button class="btn btn-secondary" onclick="showContainerMoreMenu(event, '${containerId}')">${t('containerDetail.more')}</button>
          </div>
        </div>
      </div>

      <div class="container-detail-body" ondblclick="setCurrentContainerAndShowAppModal('${containerId}')">
        <div class="apps-list container-apps" data-container-id="${containerId}">
        </div>
      </div>
    </div>
  `;

  const cached = containerAppsCache.get(String(containerId));
  if (cached && (Date.now() - cached.time < CACHE_TTL_MS)) {
    renderAppsList(cached.apps, containerId);
    bindContainerDetailEvents();
    return;
  }

  try {
    const result = await dserverCall('app.list', { containerId });
    
    if (currentRenderToken !== renderToken) {
      return;
    }
    
    const appsList = document.querySelector('.apps-list');
    let currentApps = filterValidApps((result && Array.isArray(result)) 
      ? result.map(app => {
          const appData = mapAppData(app);
          allAppsMap[app.id] = appData;
          return appData;
        })
      : []);
    
    containerAppsCache.set(String(containerId), {
      apps: currentApps,
      time: Date.now()
    });

    renderAppsList(currentApps, containerId);
  } catch (error) {
    console.error('Error loading apps for container:', error);
    const appsList = document.querySelector('.apps-list');
    if (appsList) {
      appsList.innerHTML = `<p>${t('errors.loadingAppsFailed')}</p>`;
    }
  }
  
  bindContainerDetailEvents();
}

function bindContainerDetailEvents() {
  document.querySelectorAll('.edit-name-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const containerId = newBtn.dataset.containerId;
      const containerName = newBtn.dataset.containerName;
      console.log('[DEBUG] Edit name button clicked:', containerId, containerName);
      editContainerName(containerId, containerName);
    });
  });

  document.querySelectorAll('.edit-notes-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const containerId = newBtn.dataset.containerId;
      const containerNotes = newBtn.dataset.containerNotes;
      console.log('[DEBUG] Edit notes button clicked:', containerId, containerNotes);
      editContainerNotes(containerId, containerNotes);
    });
  });
}

function renderAppGrid() {
  const appGridContainer = document.getElementById('appGridContainer');
  if (!appGridContainer) return;

  const filteredApps = searchKeyword 
    ? apps.filter(app => app.name && app.name.toLowerCase().includes(searchKeyword.toLowerCase()))
    : apps;

  appGridContainer.innerHTML = `
    <div class="home-section">
      <div class="section-title">应用列表 <span style="font-weight: normal; color: #999;">(${filteredApps.length}个)</span></div>
      ${filteredApps.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">📱</div>
          <div class="empty-state-title">暂无应用</div>
          <div class="empty-state-desc">点击上方按钮添加应用</div>
        </div>
      ` : `
        <div class="app-grid">
          ${filteredApps.map(app => `
            <div class="app-card" data-app-id="${app.id}" data-app-guid="${app.guid}" onclick="event.stopPropagation(); selectAppCard(this)" oncontextmenu="event.stopPropagation(); showAppContextMenu(event, '${app.id}', '${currentContainerId}')" ondblclick="event.stopPropagation(); launchApp('${app.guid}')">
              <div class="app-card-icon">
                <img src="${app.icon || ''}" alt="${app.name}" width="32" height="32">
              </div>
              <div class="app-card-name">${app.name}</div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

function launchApp(appGuid, containerId) {
  showToast(t('message.appLaunching') || '正在启动应用...', 'info');
  
  dserverCall('app.run', { appId: appGuid }).then(async (result) => {
    const taskId = result && result.taskId;
    
    if (!taskId) {
      console.error('No taskId in app.run response');
      showToast(t('message.appStartFailed') || '应用启动失败', 'error');
      return;
    }
    
    console.log('App launch task created:', taskId);
    
    const maxWaitMs = 15000;
    const pollInterval = 500;
    let waitedMs = 0;
    
    while (waitedMs < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      waitedMs += pollInterval;
      
      try {
        const statusResult = await dserverCall('task.status', { taskId });
        const task = statusResult && (statusResult.status ? statusResult : null);
        
        if (task) {
          if (task.status === 'completed') {
            console.log('App launched successfully');
            showToast(t('message.appStarted') || '应用已启动', 'success');
            return;
          } else if (task.status === 'failed' || task.status === 'cancelled') {
            console.error('App launch failed:', task.error_message || task.message);
            showToast(task.error_message || t('message.appStartFailed') || '应用启动失败', 'error');
            return;
          }
        }
      } catch (err) {
        console.error('Failed to poll task status:', err);
      }
    }
    
    console.log('App launch timeout');
    showToast(t('message.appLaunchTimeout') || '应用启动超时', 'warning');
  }).catch(err => {
    console.error('Failed to launch app:', err);
    showToast(t('message.appStartFailed') || '应用启动失败', 'error');
  });
}

function launchAppFromHome(appGuid, containerId) {
  launchApp(appGuid, containerId);
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtnImg = document.getElementById('toggleBtnImg');
  const toggleBtn = document.getElementById('toggleBtn');
  
  if (sidebar.classList.contains('hidden')) {
    sidebar.classList.remove('hidden');
    toggleBtnImg.src = getAssetUrl('../../assets/images/leftclose.png');
    toggleBtn.title = t('sidebar.hideContainerList') || '隐藏工作区列表';
    toggleBtn.setAttribute('data-i18n-title', 'sidebar.hideContainerList');
  } else {
    sidebar.classList.add('hidden');
    toggleBtnImg.src = getAssetUrl('../../assets/images/leftshow.png');
    toggleBtn.title = t('sidebar.showContainerList') || '显示工作区列表';
    toggleBtn.setAttribute('data-i18n-title', 'sidebar.showContainerList');
  }
}

function initSidebarIcon() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtnImg = document.getElementById('toggleBtnImg');
  const toggleBtn = document.getElementById('toggleBtn');
  
  if (sidebar && sidebar.classList.contains('hidden')) {
    toggleBtnImg.src = getAssetUrl('../../assets/images/leftshow.png');
    toggleBtn.title = t('sidebar.showContainerList') || '显示工作区列表';
    toggleBtn.setAttribute('data-i18n-title', 'sidebar.showContainerList');
  } else if (sidebar) {
    toggleBtnImg.src = getAssetUrl('../../assets/images/leftclose.png');
    toggleBtn.title = t('sidebar.hideContainerList') || '隐藏工作区列表';
    toggleBtn.setAttribute('data-i18n-title', 'sidebar.hideContainerList');
  }
}

function minimizeWindow() {
  if (window.electronAPI && window.electronAPI.minimizeWindow) {
    window.electronAPI.minimizeWindow();
  }
}
window.minimizeWindow = minimizeWindow;

function maximizeWindow() {
  if (window.electronAPI && window.electronAPI.maximizeWindow) {
    window.electronAPI.maximizeWindow();
  }
}
window.maximizeWindow = maximizeWindow;

function closeWindow() {
  if (window.electronAPI && window.electronAPI.closeWindow) {
    window.electronAPI.closeWindow();
  }
}
window.closeWindow = closeWindow;

function handleSearch(keyword) {
  searchKeyword = keyword;
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.style.display = keyword ? 'block' : 'none';

  if (currentView === 'home') {
    renderHome();
  } else if (currentView === 'detail' && currentContainerId) {
    renderContainerDetail(currentContainerId);
  }
}

function clearSearch() {
  const input = document.querySelector('.search-input');
  if (input) input.value = '';
  handleSearch('');
}

async function toggleMoreMenu(event) {
  event.stopPropagation();
  const moreBtn = document.getElementById('moreBtn');
  if (!moreBtn) return;
  const rect = moreBtn.getBoundingClientRect();
  try {
    await ipcCall('show-more-menu', {
      x: Math.round(rect.left),
      y: Math.round(rect.bottom + 4)
    });
  } catch (err) {}
}
window.toggleMoreMenu = toggleMoreMenu;

function refreshData() {
  loadContainers();
  if (currentContainerId) {
    loadApps(currentContainerId);
  }
}
window.refreshData = refreshData;

let isRefreshing = false;

async function refreshContainer() {
  if (isRefreshing) {
    showToast(t('message.refreshing'), 'info');
    return;
  }
  
  isRefreshing = true;
  document.body.style.cursor = 'wait';
  
  try {
    const containerId = currentContainerId;
    if (!containerId) {
      showToast(t('message.selectContainerFirst'), 'error');
      return;
    }
    
    showToast(t('message.refreshingContainer'), 'info');
    
    const result = await dserverCall('container.refresh', { containerId });
    
    if (result && result.success !== false) {
      await loadApps(containerId);
      await loadContainers();
      showToast(t('message.containerRefreshed'), 'success');
    } else {
      showToast(t('message.refreshContainerFailed'), 'error');
    }
  } catch (error) {
    console.error('Error refreshing container:', error);
    showToast(t('message.refreshContainerFailed') + ': ' + error.message, 'error');
  } finally {
    isRefreshing = false;
    document.body.style.cursor = 'default';
  }
}
window.refreshContainer = refreshContainer;

function loadData() {
  loadContainers();
}

function showAbout() {
  ipcCall('show-about');
}

function addModalKeyHandler(modalId, confirmCallback, cancelCallback) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  
  const handler = function(e) {
    if (!modal.classList.contains('active')) {
      document.removeEventListener('keydown', handler);
      return;
    }
    
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      if (cancelCallback) cancelCallback();
    } else if (e.key === 'Enter') {
      const target = e.target;
      if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT' && target.tagName !== 'TEXTAREA') {
        e.stopImmediatePropagation();
        if (confirmCallback) confirmCallback();
      }
    }
  };
  
  document.addEventListener('keydown', handler);
  
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (!mutation.target.classList.contains('active')) {
        document.removeEventListener('keydown', handler);
        observer.disconnect();
      }
    });
  });
  
  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
}

function showCreateContainerModal() {
  document.getElementById('containerName').value = '';
  document.getElementById('containerDescription').value = '';
  document.getElementById('containerType').value = '4';
  document.getElementById('progressContainer').style.display = 'none';
  document.getElementById('logContainer').style.display = 'none';
  
  document.getElementById('containerName').disabled = false;
  document.getElementById('containerType').disabled = false;
  document.getElementById('containerDescription').disabled = false;
  document.getElementById('createContainerBtn').disabled = false;
  
  document.getElementById('createContainerModal').classList.add('active');
  
  addModalKeyHandler('createContainerModal', createContainer, cancelCreateContainer);
}

function cancelCreateContainer() {
  hideModalLoading('createContainerLoading');
  document.getElementById('createContainerModal').classList.remove('active');
  if (isTaskRunning) {
    showToast(t('message.createContainerBackground'), 'info');
    return;
  }
  document.getElementById('containerName').disabled = false;
  document.getElementById('containerType').disabled = false;
  document.getElementById('containerDescription').disabled = false;
  document.getElementById('createContainerBtn').disabled = false;
}

function updateCharCount() {
  const textarea = document.getElementById('containerDescription');
  const charCount = document.getElementById('charCount');
  charCount.textContent = `${textarea.value.length}/255`;
}

function updateContainerNameCharCount() {
  const input = document.getElementById('containerName');
  const charCount = document.getElementById('containerNameCharCount');
  charCount.textContent = `${input.value.length}/30`;
}

async function createContainer() {
  let name = document.getElementById('containerName').value;
  let description = document.getElementById('containerDescription').value;
  
  name = sanitizeInput(name);
  description = sanitizeInput(description);
  
  const type = parseInt(document.getElementById('containerType').value);

  if (!name) {
    showToast(t('validation.enterContainerName'), 'warning');
    return;
  }

  const existingContainer = containers.find(c => c.name === name);
  if (existingContainer) {
    showToast(t('message.containerNameExists'), 'warning');
    return;
  }

  const diskResult = await showDiskSpaceWarning(t('createContainer.title'));
  if (!diskResult) {
    return;
  }

  showModalLoading('createContainerLoading');
  document.getElementById('progressContainer').style.display = 'block';
  const progressFill = document.getElementById('progressBarFill');
  const progressText = document.getElementById('progressText');
  progressFill.style.width = '0%';
  progressText.textContent = '0%';

  document.getElementById('containerName').disabled = true;
  document.getElementById('containerType').disabled = true;
  document.getElementById('containerDescription').disabled = true;
  document.getElementById('createContainerBtn').disabled = true;

  isTaskRunning = true;

  let progressUnsubscribe = null;
  let completedUnsubscribe = null;
  let failedUnsubscribe = null;
  let customContainerTerminalTimer = null;
  let customContainerDone = false;

  const startCustomContainerTerminal = (checkTaskId) => {
    if (customContainerTerminalTimer) { clearTimeout(customContainerTerminalTimer); customContainerTerminalTimer = null; }
    customContainerTerminalTimer = setTimeout(async () => {
      if (customContainerDone) return;
      try {
        const res = await dserverCall('task.status', { taskId: checkTaskId });
        const task = res && res.status ? res : null;
        if (!task) return;
        if (task.status === 'failed' || task.status === 'cancelled') {
          customContainerDone = true;
          failCustomCreation(task.error_message || task.message || 'Unknown error');
        } else if (task.status === 'completed') {
          customContainerDone = true;
          cleanupListeners();
          hideModalLoading('createContainerLoading');
          progressFill.style.width = '100%';
          progressText.textContent = '100%';
          setTimeout(() => {
            cancelCreateContainer();
            loadContainers();
            if (!currentContainerId) { renderHome(); }
          }, 1000);
        }
      } catch (e) {}
    }, 3000);
  };

  const failCustomCreation = (msg) => {
    cleanupListeners();
    hideModalLoading('createContainerLoading');
    document.getElementById('progressContainer').style.display = 'none';
    document.getElementById('containerName').disabled = false;
    document.getElementById('containerType').disabled = false;
    document.getElementById('containerDescription').disabled = false;
    document.getElementById('createContainerBtn').disabled = false;
    showToast(t('container.create.failed') + ': ' + (msg || ''), 'error');
  };

  const cleanupListeners = () => {
    isTaskRunning = false;
    if (customContainerTerminalTimer) { clearTimeout(customContainerTerminalTimer); customContainerTerminalTimer = null; }
    if (progressUnsubscribe) {
      try { progressUnsubscribe(); } catch(e) {}
      progressUnsubscribe = null;
    }
    if (completedUnsubscribe) {
      try { completedUnsubscribe(); } catch(e) {}
      completedUnsubscribe = null;
    }
    if (failedUnsubscribe) {
      try { failedUnsubscribe(); } catch(e) {}
      failedUnsubscribe = null;
    }
  };

  dserverCall('container.create', { name, osType: type, description }).then(result => {
    if (result && result.taskId) {
      const taskId = result.taskId;
      
      taskManager.createTask({
        id: taskId,
        type: 'container_create_custom',
        status: 'running',
        progress: 0,
        payload: { name, osType: type, description },
        recovery_mode: 'ui'
      });
      
      progressUnsubscribe = window.electronAPI.receive('event:task.progress', (data) => {
        let taskData = data;
        if (Array.isArray(data) && data.length > 0) {
          taskData = data[0];
        }
        if (taskData && taskData.task_id === taskId) {
          const progress = taskData.progress || 0;
          const msgText = taskData.message || taskData.error_message || '';
          const looksFailed = taskData.status === 'failed' ||
            (progress === 100 && (msgText.indexOf('创建失败') !== -1 || msgText.indexOf('失败') !== -1));
          progressFill.style.width = progress + '%';
          progressText.textContent = progress + '%';
          if (looksFailed) {
            customContainerDone = true;
            failCustomCreation(taskData.error_message || msgText || '');
            return;
          }
          if (progress === 100) { startCustomContainerTerminal(taskId); }
        }
      });
      
      completedUnsubscribe = window.electronAPI.receive('event:task.completed', (data) => {
        let taskData = data;
        if (Array.isArray(data) && data.length > 0) {
          taskData = data[0];
        }
        if (taskData && taskData.task_id === taskId) {
          customContainerDone = true;
          cleanupListeners();
          hideModalLoading('createContainerLoading');
          progressFill.style.width = '100%';
          progressText.textContent = '100%';
          
          setTimeout(() => {
            cancelCreateContainer();
            loadContainers().then(() => {
              if (currentView === 'home') {
                renderHome();
              } else if (currentView === 'detail' && currentContainerId) {
                const container = containers.find(c => String(c.id) === String(currentContainerId));
                if (container) {
                  renderContainerDetail(currentContainerId);
                } else {
                  renderHome();
                }
              } else {
                renderHome();
              }
            });
          }, 1000);
        }
      });
      
      failedUnsubscribe = window.electronAPI.receive('event:task.failed', (data) => {
        let taskData = data;
        if (Array.isArray(data) && data.length > 0) {
          taskData = data[0];
        }
        if (taskData && taskData.task_id === taskId) {
          customContainerDone = true;
          failCustomCreation(taskData.error_message || taskData.message || '');
        }
      });
    } else {
      hideModalLoading('createContainerLoading');
      document.getElementById('progressContainer').style.display = 'none';
      if (result && result.result) {
        cancelCreateContainer();
        loadContainers().then(() => {
          if (currentView === 'home') {
            renderHome();
          } else if (currentView === 'detail' && currentContainerId) {
            const container = containers.find(c => String(c.id) === String(currentContainerId));
            if (container) {
              renderContainerDetail(currentContainerId);
            } else {
              renderHome();
            }
          } else {
            renderHome();
          }
        });
      } else {
        document.getElementById('containerName').disabled = false;
        document.getElementById('containerType').disabled = false;
        document.getElementById('containerDescription').disabled = false;
        document.getElementById('createContainerBtn').disabled = false;
        showToast(t('container.create.failed'), 'error');
      }
    }
  }).catch(err => {
    console.error('Failed to create container:', err);
    cleanupListeners();
    hideModalLoading('createContainerLoading');
    document.getElementById('progressContainer').style.display = 'none';
    document.getElementById('containerName').disabled = false;
    document.getElementById('containerType').disabled = false;
    document.getElementById('containerDescription').disabled = false;
    document.getElementById('createContainerBtn').disabled = false;
    showToast(t('container.create.failed') + ': ' + (err.message || ''), 'error');
  });
}

function showAddAppModal() {
  document.getElementById('appPath').value = '';
  document.getElementById('appType').value = '1';
  document.getElementById('addAppProgress').style.display = 'none';
  
  const containerSelect = document.getElementById('containerId');
  containerSelect.innerHTML = '';
  containers.forEach(container => {
    const option = document.createElement('option');
    option.value = container.id;
    option.textContent = container.name;
    if (String(container.id) === String(currentContainerId)) {
      option.selected = true;
    }
    containerSelect.appendChild(option);
  });
  
  document.getElementById('addAppBtn').disabled = false;
  document.getElementById('appPath').disabled = false;
  document.getElementById('appType').disabled = false;
  document.getElementById('containerId').disabled = false;
  document.getElementById('addDesktopShortcut').disabled = false;
  document.querySelector('#addAppModal .input-with-button .btn-secondary').disabled = false;
  
  document.getElementById('addAppModal').classList.add('active');
  
  addModalKeyHandler('addAppModal', addApp, cancelAddApp);
}

function cancelAddApp() {
  hideModalLoading('addAppLoading');
  document.getElementById('addAppModal').classList.remove('active');
  if (isTaskRunning) {
    showToast('添加应用在后台执行中...', 'info');
    return;
  }
  document.getElementById('appPath').disabled = false;
  document.getElementById('appType').disabled = false;
  document.getElementById('containerId').disabled = false;
  document.getElementById('addDesktopShortcut').disabled = false;
  document.querySelector('#addAppModal .input-with-button .btn-secondary').disabled = false;
  document.getElementById('addAppBtn').disabled = false;
}

function browseAppPath() {
  ipcCall('open-file-dialog', {
    title: '选择应用程序',
    properties: ['openFile'],
    filters: [
      { name: '可执行文件', extensions: ['exe', 'msi', 'bat', 'cmd'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  }).then(result => {
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      document.getElementById('appPath').value = result.filePaths[0];
    }
  });
}

async function addApp() {
  const appPath = document.getElementById('appPath').value.trim();
  const appType = parseInt(document.getElementById('appType').value);
  const containerId = document.getElementById('containerId').value;
  const createShortcut = document.getElementById('addDesktopShortcut').checked;

  if (!appPath) {
    showToast(t('validation.enterAppPath'), 'warning');
    return;
  }

  if (!containerId) {
    showToast('请选择工作区', 'warning');
    return;
  }

  const appExists = await window.electronAPI.fileExists(appPath);
  if (!appExists) {
    showToast('应用路径不存在', 'error');
    return;
  }

  const diskResult = await showDiskSpaceWarning('添加应用');
  if (!diskResult) {
    return;
  }

  const progressContainer = document.getElementById('addAppProgress');
  const progressFill = document.getElementById('addAppProgressFill');
  const progressText = document.getElementById('addAppProgressText');
  
  showModalLoading('addAppLoading');
  progressContainer.style.display = 'block';
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
  
  document.getElementById('appPath').disabled = true;
  document.getElementById('appType').disabled = true;
  document.getElementById('containerId').disabled = true;
  document.getElementById('addDesktopShortcut').disabled = true;
  document.querySelector('#addAppModal .input-with-button .btn-secondary').disabled = true;
  document.getElementById('addAppBtn').disabled = true;
  
  isTaskRunning = true;
  
  let progressUnsubscribe = null;
  let completedUnsubscribe = null;
  let failedUnsubscribe = null;
  let duplicateHandled = false;

  const resetFormFields = (enable = true) => {
    document.getElementById('appPath').disabled = !enable;
    document.getElementById('appType').disabled = !enable;
    document.getElementById('containerId').disabled = !enable;
    document.getElementById('addDesktopShortcut').disabled = !enable;
    document.querySelector('#addAppModal .input-with-button .btn-secondary').disabled = !enable;
    document.getElementById('addAppBtn').disabled = !enable;
  };

  const parseAppExistsFromTask = (taskData) => {
    if (!taskData) return null;
    let result = null;
    try {
      if (taskData.result && typeof taskData.result === 'string') {
        result = JSON.parse(taskData.result);
      } else if (taskData.result && typeof taskData.result === 'object') {
        result = taskData.result;
      }
    } catch (e) { result = null; }
    if (result && result.appExists) return result;
    if (taskData.appExists) {
      return {
        appExists: true,
        message: taskData.message || '',
        existingApp: taskData.existingApp || (taskData.result && taskData.result.existingApp) || {}
      };
    }
    return null;
  };

  const cleanupListeners = () => {
    isTaskRunning = false;
    if (progressUnsubscribe) {
      try { progressUnsubscribe(); } catch(e) {}
      progressUnsubscribe = null;
    }
    if (completedUnsubscribe) {
      try { completedUnsubscribe(); } catch(e) {}
      completedUnsubscribe = null;
    }
    if (failedUnsubscribe) {
      try { failedUnsubscribe(); } catch(e) {}
      failedUnsubscribe = null;
    }
  };

  const performInstall = (forceInstall = false) => {
    return dserverCall('app.install', { 
      containerId: containerId,
      installerPath: appPath,
      appType: appType,
      createShortcut: createShortcut,
      forceInstall: forceInstall
    });
  };

  performInstall().then(result => {
    const setupTaskListeners = (taskId) => {
      taskManager.createTask({
        id: taskId,
        type: 'app_install',
        status: 'running',
        progress: 0,
        container_id: containerId,
        payload: { appPath, appType, containerId, createShortcut },
        recovery_mode: 'ui'
      });
      
      let terminalCheckTimer = null;
      let terminalCheckDone = false;
      const startTerminalFallback = (checkTaskId) => {
        if (terminalCheckTimer) { clearTimeout(terminalCheckTimer); terminalCheckTimer = null; }
        terminalCheckTimer = setTimeout(async () => {
          if (terminalCheckDone) return;
          try {
            const res = await dserverCall('task.status', { taskId: checkTaskId });
            const task = res && res.success ? res.result : null;
            if (!task) return;
            if (task.status === 'failed' || task.status === 'cancelled') {
              const taskWrap = { task_id: checkTaskId, status: task.status, error_message: task.error_message || task.message, message: task.message, result: task.result };
              const dup = parseAppExistsFromTask(taskWrap);
              if (dup && dup.appExists) {
                showDuplicateConfirmAndRetry(dup);
                return;
              }
              let errorResult = null;
              try {
                if (task.result && typeof task.result === 'string') errorResult = JSON.parse(task.result);
                else if (task.result && typeof task.result === 'object') errorResult = task.result;
              } catch (e) {}
              cleanupListeners();
              hideModalLoading('addAppLoading');
              progressContainer.style.display = 'none';
              resetFormFields(true);
              const errorMsg = (errorResult && errorResult.message) || task.error_message || task.message || t('app.install.failed');
              showToast(t('app.install.failed') + ': ' + errorMsg, 'error');
              setTimeout(() => { cancelAddApp(); }, 500);
              terminalCheckDone = true;
            } else if (task.status === 'completed') {
              cleanupListeners();
              hideModalLoading('addAppLoading');
              progressFill.style.width = '100%';
              progressText.textContent = '100%';
              setTimeout(() => {
                cancelAddApp();
                loadApps();
                if (currentView === 'detail' && currentContainerId === containerId) {
                  renderContainerDetail(currentContainerId);
                } else {
                  loadTotalAppCount().then(renderHome);
                }
                renderSidebar();
                showToast(t('app.install.success'), 'success');
              }, 500);
              terminalCheckDone = true;
            }
          } catch (e) {}
        }, 3000);
      };

      progressUnsubscribe = window.electronAPI.receive('event:task.progress', (data) => {
        let taskData = data;
        if (Array.isArray(data) && data.length > 0) {
          taskData = data[0];
        }
        if (taskData && taskData.task_id === taskId) {
          const progress = taskData.progress || 0;
          progressFill.style.width = progress + '%';
          progressText.textContent = progress + '%';
          
          const msgText = taskData.message || taskData.error_message || '';
          const looksFailed = taskData.status === 'failed' ||
            (taskData.status === 'cancelled');
          
          if (looksFailed) {
            const dup = parseAppExistsFromTask(taskData);
            if (dup && dup.appExists) {
              showDuplicateConfirmAndRetry(dup);
              return;
            }
            const errorMsg = taskData.error_message || taskData.message || t('app.install.failed');
            cleanupListeners();
            hideModalLoading('addAppLoading');
            progressContainer.style.display = 'none';
            resetFormFields(true);
            showToast(t('app.install.failed') + ': ' + errorMsg, 'error');
            setTimeout(() => { cancelAddApp(); }, 500);
            return;
          }
          
          if (progress === 100) {
            startTerminalFallback(taskId);
          }
        }
      });
      
      completedUnsubscribe = window.electronAPI.receive('event:task.completed', (data) => {
        let taskData = data;
        if (Array.isArray(data) && data.length > 0) {
          taskData = data[0];
        }
        if (taskData && taskData.task_id === taskId) {
          terminalCheckDone = true;
          if (terminalCheckTimer) { clearTimeout(terminalCheckTimer); terminalCheckTimer = null; }
          cleanupListeners();
          hideModalLoading('addAppLoading');
          progressFill.style.width = '100%';
          progressText.textContent = '100%';
          
          setTimeout(() => {
            cancelAddApp();
            loadApps();
            if (currentView === 'detail' && currentContainerId === containerId) {
              renderContainerDetail(currentContainerId);
            } else {
              loadTotalAppCount().then(renderHome);
            }
            renderSidebar();
            showToast(t('app.install.success'), 'success');
          }, 500);
        }
      });
      
      failedUnsubscribe = window.electronAPI.receive('event:task.failed', (data) => {
        let taskData = data;
        if (Array.isArray(data) && data.length > 0) {
          taskData = data[0];
        }
        if (taskData && taskData.task_id === taskId) {
          terminalCheckDone = true;
          if (terminalCheckTimer) { clearTimeout(terminalCheckTimer); terminalCheckTimer = null; }
          const dup = parseAppExistsFromTask(taskData);
          if (dup && dup.appExists) {
            showDuplicateConfirmAndRetry(dup);
            return;
          }
          let errorResult = null;
          try {
            if (taskData.result && typeof taskData.result === 'string') {
              errorResult = JSON.parse(taskData.result);
            } else if (taskData.result && typeof taskData.result === 'object') {
              errorResult = taskData.result;
            }
          } catch (e) { errorResult = null; }

          cleanupListeners();
          hideModalLoading('addAppLoading');
          progressContainer.style.display = 'none';
          resetFormFields(true);
          const errorMsg = (errorResult && errorResult.message) || taskData.error_message || taskData.message || t('app.install.failed');
          showToast(t('app.install.failed') + ': ' + errorMsg, 'error');
          setTimeout(() => { cancelAddApp(); }, 500);
        }
      });
    };

    const showDuplicateConfirmAndRetry = (errorResult) => {
      if (duplicateHandled) return;
      duplicateHandled = true;
      cleanupListeners();
      hideModalLoading('addAppLoading');
      progressContainer.style.display = 'none';
      resetFormFields(true);

      const existingApp = (errorResult && errorResult.existingApp) || {};
      showConfirmModal({
        title: '应用已存在',
        message: '该应用已经安装，是否确认重复添加？',
        detail: `已安装的应用: ${existingApp.alias_name || existingApp.name || '未知'}`,
        confirmText: '确认继续添加',
        cancelText: '取消',
        confirmClass: 'btn-primary',
        cancelClass: 'btn-secondary'
      }).then(confirmed => {
        if (confirmed) {
          showModalLoading('addAppLoading');
          progressContainer.style.display = 'block';
          progressFill.style.width = '0%';
          progressText.textContent = '0%';
          resetFormFields(false);
          duplicateHandled = false;
          performInstall(true).then(retryResult => {
            const nextTaskId = retryResult?.taskId || (retryResult?.result && retryResult.result.taskId);
            if (nextTaskId) {
              setupTaskListeners(nextTaskId);
            } else {
              hideModalLoading('addAppLoading');
              progressContainer.style.display = 'none';
              resetFormFields(true);
              showToast(t('app.install.failed'), 'error');
            }
          }).catch(err => {
            hideModalLoading('addAppLoading');
            progressContainer.style.display = 'none';
            resetFormFields(true);
            showToast(t('app.install.failed') + ': ' + (err.message || ''), 'error');
          });
        } else {
          setTimeout(() => { cancelAddApp(); }, 200);
        }
      });
    };

    if (result && result.appExists) {
      showDuplicateConfirmAndRetry({
        appExists: true,
        message: result.message || '',
        existingApp: result.existingApp || {}
      });
      return;
    }

    if (result && result.taskId) {
      setupTaskListeners(result.taskId);
    } else {
      hideModalLoading('addAppLoading');
      progressContainer.style.display = 'none';
      showToast(t('app.install.failed'), 'error');
    }
  }).catch(err => {
    console.error('Failed to add app:', err);
    hideModalLoading('addAppLoading');
    progressContainer.style.display = 'none';
    showToast(t('app.install.failed') + ': ' + (err.message || ''), 'error');
  });
}

async function showUninstallAppModal() {
  const modal = document.getElementById('uninstallAppModal');
  const appList = document.getElementById('uninstallAppList');
  
  modal.classList.add('active');
  
  addModalKeyHandler('uninstallAppModal', confirmUninstallApp, cancelUninstallApp);
  
  // Ensure the DOM state is reset every time we open the modal, so users
  // always get a clean view even if a previous run was cancelled/closed while
  // tasks were still running in the background.
  resetUninstallAppModalUI();
  
  appList.innerHTML = '';
  
  appList.innerHTML = `
    <div class="loading-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 40px; text-align: center;">
      <div class="loading-spinner" style="width: 48px; height: 48px; border: 4px solid #e0e0e0; border-top: 4px solid #1a73e8; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px;"></div>
      <p style="margin: 8px 0; font-size: 16px; color: #666;">${t('uninstallApp.loading')}</p>
      <p style="margin: 8px 0; font-size: 14px; color: #999;">${t('uninstallApp.loadingDesc')}</p>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;
  
  try {
    const response = await dserverCall('app.getUninstallableApps', { containerId: currentContainerId });
    
    let appListData = [];
    if (Array.isArray(response)) {
      appListData = response;
    } else if (response && response.data && Array.isArray(response.data)) {
      appListData = response.data;
    }
    
    appList.innerHTML = '';
    
    if (appListData.length === 0) {
      appList.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 40px; text-align: center; user-select: none;">
          <img src="${getAssetUrl('../../assets/images/empty.png')}" alt="Empty" width="128" height="128" style="margin-bottom: 16px; object-fit: contain; pointer-events: none; user-select: none;">
          <p style="margin: 8px 0; font-size: 16px; color: #666; user-select: none;">该工作区中暂无应用</p>
          <p style="margin: 8px 0; font-size: 14px; color: #999; user-select: none;">无法执行卸载操作</p>
        </div>
      `;
    } else {
      appListData.forEach(app => {
        console.log('[uninstall] app data:', JSON.stringify(app));
        
        const item = document.createElement('div');
        item.className = 'app-item-uninstall';
        
        let sizeText = '未知';
        if (app.estimated_size && parseInt(app.estimated_size) > 0) {
          sizeText = parseInt(app.estimated_size) + ' KB';
        } else if (app.size && app.size !== '0 KB') {
          sizeText = app.size;
        }
        
        const appName = app.name || '未知';
        const appVersion = app.version || '未知';
        const appPublisher = app.publisher || '未知';
        
        let iconHtml = '';
        if (app.icon_path && app.icon_path.startsWith('/')) {
          iconHtml = `<img src="file://${app.icon_path}" alt="" />`;
        }
        
        item.innerHTML = `
          <div class="app-checkbox">
            <input type="checkbox" value="${app.id}" data-uninstall-cmd="${app.uninstall_cmd || ''}" data-app-type="${app.app_type}">
          </div>
          <div class="app-icon-small">
            ${iconHtml}
          </div>
          <div class="app-info">
            <div class="app-info-left">
              <div class="app-name" title="${appName}">${appName}</div>
              <div class="app-publisher" title="${appPublisher}">${appPublisher}</div>
            </div>
            <div class="app-info-right">
              <div class="app-version" title="${appVersion}">${appVersion}</div>
              <div class="app-size" title="${sizeText}">${sizeText}</div>
            </div>
          </div>
        `;
        appList.appendChild(item);
      });
    }
  } catch (err) {
    console.error('Failed to get uninstallable apps:', err);
    appList.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 40px; text-align: center; user-select: none;">
        <img src="${getAssetUrl('../../assets/images/empty.png')}" alt="Error" width="128" height="128" style="margin-bottom: 16px; object-fit: contain;">
        <p style="margin: 8px 0; font-size: 16px; color: #666; user-select: none;">获取应用列表失败</p>
        <p style="margin: 8px 0; font-size: 14px; color: #999; user-select: none;">${err.message || '请稍后重试'}</p>
      </div>
    `;
  }
}

function resetUninstallAppModalUI() {
  const loadingEl = document.getElementById('uninstallAppLoading');
  if (loadingEl) loadingEl.style.display = 'none';
  const checkboxes = document.querySelectorAll('#uninstallAppList input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.disabled = false;
    cb.checked = false;
  });
  const btn = document.querySelector('#uninstallAppModal .btn-danger');
  if (btn) btn.disabled = false;
}

function closeUninstallAppModal() {
  resetUninstallAppModalUI();
  document.getElementById('uninstallAppModal').classList.remove('active');
}

function cancelUninstallApp() {
  const targetContainerId = currentContainerId;
  if (uninstallingContainers.has(targetContainerId)) {
    // Reset modal UI state but keep the background tasks tracking so we
    // still showToast on a later re-open attempt.
    resetUninstallAppModalUI();
    showToast('应用卸载在后台执行中...', 'info');
  }
  document.getElementById('uninstallAppModal').classList.remove('active');
}

const uninstallingContainers = new Map();

function confirmUninstallApp() {
  const targetContainerId = currentContainerId;
  
  if (uninstallingContainers.has(targetContainerId)) {
    showToast('应用卸载中，请稍等...', 'info');
    return;
  }
  
  const checkboxes = document.querySelectorAll('#uninstallAppList input[type="checkbox"]:checked');
  const selectedApps = Array.from(checkboxes).map(cb => ({
    id: cb.value,
    uninstallCmd: cb.dataset.uninstallCmd,
    appType: cb.dataset.appType
  }));
  
  if (selectedApps.length === 0) {
    showToast(t('validation.selectUninstallApp'), 'error');
    return;
  }
  
  // Track all registered task Ids as strings so Set lookups don't fail due
  // to int vs string type mismatches.
  const registeredTaskIds = new Set();
  uninstallingContainers.set(targetContainerId, registeredTaskIds);
  document.getElementById('uninstallAppLoading').style.display = 'block';
  
  document.querySelectorAll('#uninstallAppList input[type="checkbox"]').forEach(cb => {
    cb.disabled = true;
  });
  document.querySelector('#uninstallAppModal .btn-danger').disabled = true;
  
  const completedCount = { value: 0 };
  const failedCount = { value: 0 };
  
  const cleanupListeners = (listeners) => {
    listeners.forEach(listener => {
      if (typeof listener === 'function') {
        try { listener(); } catch(e) { /* ignore */ }
      }
    });
  };
  
  const handleAllCompleted = async () => {
    uninstallingContainers.delete(targetContainerId);
    resetUninstallAppModalUI();
    
    const containerIdString = String(targetContainerId);
    
    try {
      // Always refresh container BEFORE reloading apps, so the server scans
      // LNK files on disk, deletes stale DB records (missing LNKs the
      // uninstaller just removed), then app.list returns clean data.
      if (containerIdString && typeof dserverCall === 'function') {
        try {
          await dserverCall('container.refresh', { containerId: containerIdString });
        } catch (refreshErr) {
          console.warn('[uninstall] container.refresh failed:', refreshErr);
        }
      }
    } catch(e) {
      console.warn('[uninstall] refresh wrapper error:', e);
    }
    
    if (typeof loadContainers === 'function') {
      try { await loadContainers(); } catch(e) { /* ignore */ }
    }
    if (containerIdString && typeof loadApps === 'function') {
      try { await loadApps(containerIdString); } catch(e) { /* ignore */ }
    }
    if (currentView === 'detail' && typeof renderContainerDetail === 'function' && currentContainerId) {
      try { renderContainerDetail(currentContainerId); } catch(e) { /* ignore */ }
    } else if (typeof renderHome === 'function') {
      try {
        if (typeof loadTotalAppCount === 'function') {
          await loadTotalAppCount().catch(() => {});
        }
        renderHome();
      } catch(e) { /* ignore */ }
    } else if (typeof loadTotalAppCount === 'function') {
      try { await loadTotalAppCount(); } catch(e) { /* ignore */ }
    }
    
    if (failedCount.value === 0) {
      showToast(t('app.uninstall.success'), 'success');
      closeUninstallAppModal();
    } else {
      showToast(t('app.uninstall.failed') + `: ${failedCount.value}/${selectedApps.length}`, 'error');
    }
    
    if (typeof updateTaskHeaderButton === 'function') {
      try { updateTaskHeaderButton(); } catch(e) {}
    }
  };
  
  const listeners = [];
  let allDone = false;
  
  const maybeFinish = () => {
    if (allDone) return;
    if (completedCount.value + failedCount.value >= selectedApps.length) {
      allDone = true;
      cleanupListeners(listeners);
      handleAllCompleted();
    }
  };
  
  const completedListener = window.electronAPI.receive('event:task.completed', (data) => {
    let taskData = data;
    if (Array.isArray(data) && data.length > 0) {
      taskData = data[0];
    }
    if (!taskData || !taskData.task_id) return;
    const taskId = String(taskData.task_id);
    const containerId = taskData.container_id != null ? String(taskData.container_id) : null;
    
    if (containerId && targetContainerId && containerId !== String(targetContainerId)) return;
    if (!registeredTaskIds.has(taskId)) return;
    
    registeredTaskIds.delete(taskId);
    try { taskManager && taskManager.completeTask && taskManager.completeTask(taskId, taskData.result); } catch(e) {}
    completedCount.value++;
    maybeFinish();
  });
  
  const failedListener = window.electronAPI.receive('event:task.failed', (data) => {
    let taskData = data;
    if (Array.isArray(data) && data.length > 0) {
      taskData = data[0];
    }
    if (!taskData || !taskData.task_id) return;
    const taskId = String(taskData.task_id);
    const containerId = taskData.container_id != null ? String(taskData.container_id) : null;
    
    if (containerId && targetContainerId && containerId !== String(targetContainerId)) return;
    if (!registeredTaskIds.has(taskId)) return;
    
    registeredTaskIds.delete(taskId);
    try { taskManager && taskManager.failTask && taskManager.failTask(taskId, taskData.error_message || taskData.message); } catch(e) {}
    failedCount.value++;
    maybeFinish();
  });
  
  const progressListener = window.electronAPI.receive('event:task.progress', (data) => {
    let taskData = data;
    if (Array.isArray(data) && data.length > 0) {
      taskData = data[0];
    }
    if (!taskData || !taskData.task_id) return;
    const taskId = String(taskData.task_id);
    const containerId = taskData.container_id != null ? String(taskData.container_id) : null;
    if (containerId && targetContainerId && containerId !== String(targetContainerId)) return;
    if (!registeredTaskIds.has(taskId)) return;
    try {
      taskManager && taskManager.updateTask && taskManager.updateTask(taskId, {
        progress: typeof taskData.progress === 'number' ? taskData.progress : undefined,
        stage: taskData.stage || taskData.task_stage || undefined,
        message_key: taskData.message_key || taskData.task_message_key || undefined,
        message: taskData.message || taskData.task_message || undefined
      });
    } catch(e) {}
  });
  
  listeners.push(completedListener, failedListener, progressListener);
  
  selectedApps.forEach(app => {
    const params = app.id && parseInt(app.id) > 0 
      ? { containerId: targetContainerId, appId: parseInt(app.id) }
      : { containerId: targetContainerId, appId: 0, uninstallCmd: app.uninstallCmd, appType: parseInt(app.appType) };
    
    dserverCall('app.uninstall', params).then(result => {
      if (result && result.taskId) {
        const taskId = String(result.taskId);
        registeredTaskIds.add(taskId);
        
        // Register the uninstall task globally so:
        // 1. `taskStore.getRunningTasks()` returns it
        // 2. `updateTaskHeaderButton()` shows the header task entry icon
        // 3. If the user refreshes, TaskManager can recover the view.
        if (window.taskManager && typeof window.taskManager.createTask === 'function') {
          try {
            window.taskManager.createTask({
              id: taskId,
              type: 'app_uninstall',
              status: 'running',
              progress: 0,
              container_id: String(targetContainerId),
              payload: {
                containerId: String(targetContainerId),
                appId: params.appId,
                appName: app.name || '',
                appCount: selectedApps.length
              }
            });
          } catch (e) {
            console.warn('[uninstall] createTask failed:', e);
          }
        }
        
        // Force header task entry to show immediately. The taskManager
        // event listeners should also fire, but a few explicit calls
        // guarantee the entry is visible even if events arrive out of
        // order or race with the RPC response.
        if (typeof updateTaskHeaderButton === 'function') {
          try { updateTaskHeaderButton(); } catch(e) {}
          setTimeout(() => { try { updateTaskHeaderButton(); } catch(e) {} }, 50);
          setTimeout(() => { try { updateTaskHeaderButton(); } catch(e) {} }, 250);
          setTimeout(() => { try { updateTaskHeaderButton(); } catch(e) {} }, 1000);
        }
      } else {
        failedCount.value++;
        maybeFinish();
      }
    }).catch(err => {
      console.error('Failed to start uninstall task:', err);
      failedCount.value++;
      maybeFinish();
    });
  });
}

function showDeleteContainerModal(containerId, containerName) {
  const targetContainerId = containerId || currentContainerId;
  const container = containers.find(c => String(c.id) === String(targetContainerId));
  const currentContainerName = container?.name || container?.alias_name || containerName || '';

  const isDefaultContainer = container?.is_default === 1 || container?.is_default === true;

  if (isDefaultContainer) {
    showToast(t('container.defaultCannotRecycle'), 'error');
    return;
  }

  if (container) {
    document.getElementById('deleteContainerMessage').textContent =
      `确定要删除工作区 "${currentContainerName}" 吗？`;
  }
  
  document.getElementById('confirmDeleteContainerBtn').disabled = false;
  document.getElementById('deleteContainerModal').classList.add('active');
  
  addModalKeyHandler('deleteContainerModal', confirmDeleteContainer, cancelDeleteContainer);
}

function cancelDeleteContainer() {
  document.getElementById('deleteContainerModal').classList.remove('active');
}

function confirmDeleteContainer() {
  const deleteType = document.getElementById('deleteType').value;
  
  const container = containers.find(c => String(c.id) === String(currentContainerId));
  const isDefaultContainer = container?.is_default === 1 || container?.is_default === true;
  
  if (isDefaultContainer) {
    if (deleteType === 'permanent') {
      showToast(t('container.defaultCannotDelete'), 'error');
    } else {
      showToast(t('container.defaultCannotRecycle'), 'error');
    }
    return;
  }
  
  const isLocked = taskManager.isContainerLocked(currentContainerId);
  if (isLocked) {
    const lock = taskManager.getContainerLock(currentContainerId);
    const lockTypeText = lock?.type === 'install' ? '添加应用' : 
                         lock?.type === 'import' ? '导入工作区' : 
                         lock?.type === 'export' ? '导出工作区' : 
                         lock?.type === 'create' ? '创建工作区' : '执行任务';
    showToast(`该工作区正在${lockTypeText}，无法删除`, 'error');
    return;
  }
  
  const containerName = container?.name || container?.alias_name || '';
  const isPermanent = deleteType === 'delete';
  const deleteTypeText = isPermanent ? '彻底删除' : '删除到回收站';
  const warningText = isPermanent ? '此操作不可恢复！' : '可在回收站中恢复';
  
  showConfirmModal({
    title: '确认删除',
    message: `确定要${deleteTypeText}工作区 "${containerName}" 吗？`,
    detail: warningText,
    icon: 'warning',
    confirmText: deleteTypeText,
    cancelText: '取消',
    confirmType: 'danger'
  }).then(confirmed => {
    if (!confirmed) return;
    
    document.getElementById('confirmDeleteContainerBtn').disabled = true;
    
    dserverCall('container.delete', { 
      containerId: currentContainerId, 
      permanent: isPermanent ? 1 : 0 
    }).then(() => {
      cancelDeleteContainer();
      const deletedContainerName = containerName;
      currentContainerId = null;
      loadContainers().then(() => {
        renderHome();
        showToast(isPermanent ? '工作区已彻底删除' : '工作区已移入回收站', 'success');
      });
    }).catch(err => {
      console.error('Failed to delete container:', err);
      document.getElementById('confirmDeleteContainerBtn').disabled = false;
      showToast('删除工作区失败: ' + (err.message || ''), 'error');
    });
  });
}

function formatDateTime(dateValue) {
  if (!dateValue) return '';
  let timestamp = parseInt(dateValue, 10);
  if (isNaN(timestamp)) {
    timestamp = Date.parse(dateValue);
    if (isNaN(timestamp)) {
      return dateValue;
    }
  }
  if (timestamp < 10000000000) {
    timestamp *= 1000;
  }
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// 通用输入对话框
let inputModalResolve = null;

function showInputModal(options) {
  let modal = document.getElementById('inputModal');
  const isTextarea = options.type === 'textarea';
  const maxLength = options.maxLength || 255;

  if (!modal) {
    const inputModal = document.createElement('div');
    inputModal.id = 'inputModal';
    inputModal.className = 'modal';
    inputModal.style.zIndex = '2000';
    
    const inputHtml = isTextarea ? 
      `<textarea id="inputModalInput" class="form-input" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; resize: none; font-family: inherit; font-size: inherit; overflow-y: auto;" rows="3"></textarea>` :
      `<input type="text" id="inputModalInput" class="form-input" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">`;
    
    inputModal.innerHTML = `
      <div class="modal-content" style="width: 400px;">
        <div class="modal-header">
          <h3 id="inputModalTitle">输入</h3>
          <button class="modal-close-btn" id="inputModalCloseBtn">&times;</button>
        </div>
        <div class="modal-body">
          <div style="position: relative;">
            ${inputHtml}
            <div id="inputModalCharCount" style="position: absolute; bottom: 6px; right: 10px; font-size: 12px; color: #999; pointer-events: none; background: transparent; padding: 0 4px;">0/${maxLength}</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="inputModalCancelBtn">取消</button>
          <button class="btn btn-primary" id="inputModalConfirmBtn">确认</button>
        </div>
      </div>
    `;
    document.body.appendChild(inputModal);
    
    document.getElementById('inputModalConfirmBtn').addEventListener('click', executeInputModal);
    document.getElementById('inputModalCancelBtn').addEventListener('click', cancelInputModal);
    document.getElementById('inputModalCloseBtn').addEventListener('click', cancelInputModal);
    
    addModalKeyHandler('inputModal', executeInputModal, cancelInputModal);
  } else {
    const inputContainer = modal.querySelector('.modal-body > div');
    const currentInput = document.getElementById('inputModalInput');
    if (inputContainer && currentInput) {
      const isCurrentTextarea = currentInput.tagName === 'TEXTAREA';
      if (isTextarea !== isCurrentTextarea) {
        const newInput = isTextarea ? 
          document.createElement('textarea') : 
          document.createElement('input');
        newInput.id = 'inputModalInput';
        newInput.className = 'form-input';
        if (isTextarea) {
          newInput.style.cssText = 'width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; resize: none; font-family: inherit; font-size: inherit; overflow-y: auto;';
          newInput.rows = 3;
        } else {
          newInput.type = 'text';
          newInput.style.cssText = 'width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;';
        }
        inputContainer.replaceChild(newInput, currentInput);
      }
    }
  }

  const currentTitle = document.getElementById('inputModalTitle');
  const currentInput = document.getElementById('inputModalInput');
  const currentCharCount = document.getElementById('inputModalCharCount');
  const currentConfirmBtn = document.getElementById('inputModalConfirmBtn');
  const currentCancelBtn = document.getElementById('inputModalCancelBtn');

  if (currentTitle) currentTitle.textContent = options.title || '输入';
  if (currentInput) {
    currentInput.value = options.defaultValue || '';
    currentInput.maxLength = maxLength;
    currentInput.oninput = () => {
      if (currentCharCount) {
        currentCharCount.textContent = `${currentInput.value.length}/${maxLength}`;
      }
    };
    currentInput.focus();
    currentInput.scrollTop = 0;
  }
  if (currentCharCount) {
    const defaultValueLen = options.defaultValue ? options.defaultValue.length : 0;
    currentCharCount.textContent = `${defaultValueLen}/${maxLength}`;
  }
  if (currentConfirmBtn) currentConfirmBtn.textContent = options.confirmText || '确认';
  if (currentCancelBtn) currentCancelBtn.textContent = options.cancelText || '取消';

  const modalEl = document.getElementById('inputModal');
  if (modalEl) modalEl.classList.add('active');

  return new Promise((resolve) => {
    inputModalResolve = resolve;
  });
}

function cancelInputModal() {
  const modal = document.getElementById('inputModal');
  if (modal) modal.classList.remove('active');
  if (inputModalResolve) {
    inputModalResolve(null);
    inputModalResolve = null;
  }
}

function executeInputModal() {
  const modal = document.getElementById('inputModal');
  const input = document.getElementById('inputModalInput');
  if (modal) modal.classList.remove('active');
  if (inputModalResolve) {
    inputModalResolve(input ? input.value : null);
    inputModalResolve = null;
  }
}

// 通用确认对话框
let confirmModalResolve = null;

function showConfirmModal(options) {
  const modal = document.getElementById('confirmModal');
  const title = document.getElementById('confirmModalTitle');
  const message = document.getElementById('confirmModalMessage');
  const detail = document.getElementById('confirmModalDetail');
  const icon = document.getElementById('confirmModalIcon');
  const confirmBtn = document.getElementById('confirmModalConfirmBtn');
  const cancelBtn = document.getElementById('confirmModalCancelBtn');

  if (title) title.textContent = options.title || '确认';
  if (message) message.textContent = options.message || '确认执行此操作？';
  
  if (detail) {
    if (options.detail !== undefined) {
      detail.textContent = options.detail;
      detail.style.display = 'block';
    } else {
      detail.style.display = 'none';
    }
  }
  
  if (icon) {
    const iconType = options.icon || 'question';
    let iconContent = '?';
    let iconBg = '#1890ff';
    
    switch (iconType) {
      case 'success':
        iconContent = '✓';
        iconBg = '#52c41a';
        break;
      case 'error':
        iconContent = '✗';
        iconBg = '#ff4d4f';
        break;
      case 'warning':
        iconContent = '⚠';
        iconBg = '#faad14';
        break;
      case 'info':
        iconContent = 'ℹ';
        iconBg = '#1890ff';
        break;
      default:
        iconContent = '?';
        iconBg = '#1890ff';
    }
    
    icon.textContent = iconContent;
    icon.style.backgroundColor = iconBg;
  }
  
  if (confirmBtn) {
    confirmBtn.textContent = options.confirmText || '确认';
    confirmBtn.className = 'btn ' + (options.confirmClass || 'btn-primary');
  }
  if (cancelBtn) {
    if (options.showCancel === false) {
      cancelBtn.style.display = 'none';
    } else {
      cancelBtn.style.display = 'inline-block';
      cancelBtn.textContent = options.cancelText || '取消';
    }
  }

  modal.classList.add('active');
  
  addModalKeyHandler('confirmModal', executeConfirmModal, cancelConfirmModal);

  return new Promise((resolve) => {
    confirmModalResolve = resolve;
  });
}

function cancelConfirmModal() {
  const modal = document.getElementById('confirmModal');
  if (modal) modal.classList.remove('active');
  if (confirmModalResolve) {
    confirmModalResolve(false);
    confirmModalResolve = null;
  }
}

function executeConfirmModal() {
  const modal = document.getElementById('confirmModal');
  if (modal) modal.classList.remove('active');
  if (confirmModalResolve) {
    confirmModalResolve(true);
    confirmModalResolve = null;
  }
}

function showContainerTrashModal() {
  closeMoreMenu();
  const trashList = document.getElementById('containerTrashList');
  trashList.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px;">
      <div class="modal-spinner" style="width: 40px; height: 40px; border-width: 4px;"></div>
      <div style="margin-top: 16px; color: #999; font-size: 14px;">加载中...</div>
    </div>
  `;
  document.getElementById('containerTrashModal').classList.add('active');
  
  addModalKeyHandler('containerTrashModal', null, cancelContainerTrash);
  
  dserverCall('container.list', { includeTrash: 1 }).then(result => {
    trashList.innerHTML = '';
    let trashContainers = [];
    if (Array.isArray(result)) {
      trashContainers = result.filter(c => c.status === 5);
    } else if (result && result.result && Array.isArray(result.result)) {
      trashContainers = result.result.filter(c => c.status === 5);
    }
    if (trashContainers.length > 0) {
      trashContainers.forEach(container => {
        const typeName = CONTAINER_TYPES[container.os_type] || 'Unknown';
        const osType = container.os_type || 4;
        const iconPath = getAssetUrl(`../../assets/images/${osType}-1.png`);
        const item = document.createElement('div');
        item.className = 'container-item-trash';
        item.innerHTML = `
          <div class="container-checkbox">
            <input type="checkbox" value="${container.id}" onchange="updateTrashButtons()">
          </div>
          <div class="container-icon-small">
            <img src="${iconPath}" alt="${typeName}" width="32" height="32">
          </div>
          <div class="container-info">
            <div class="container-name">${container.name}</div>
            <div class="container-type">${typeName}</div>
          </div>
        `;
        trashList.appendChild(item);
      });
    } else {
      trashList.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px; user-select: none;">
          <img src="${getAssetUrl('../../assets/images/trash.png')}" alt="暂无工作区" style="width: 80px; height: 80px; opacity: 0.5; object-fit: contain; pointer-events: none; user-select: none;">
          <div style="margin-top: 16px; color: #999; font-size: 14px; user-select: none;">暂无工作区处于回收站中</div>
        </div>
      `;
    }
    updateTrashButtons();
  }).catch(err => {
    console.error('Failed to load trash containers:', err);
    trashList.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">加载失败</div>';
    updateTrashButtons();
  });
}

function updateTrashButtons() {
  const checkboxes = document.querySelectorAll('#containerTrashList input[type="checkbox"]:checked');
  const hasSelection = checkboxes.length > 0;
  
  const restoreBtn = document.getElementById('restoreBtn');
  const deleteBtn = document.getElementById('deleteBtn');
  
  if (restoreBtn) {
    restoreBtn.disabled = !hasSelection;
    restoreBtn.style.opacity = hasSelection ? '1' : '0.5';
    restoreBtn.style.cursor = hasSelection ? 'pointer' : 'not-allowed';
  }
  
  if (deleteBtn) {
    deleteBtn.disabled = !hasSelection;
    deleteBtn.style.opacity = hasSelection ? '1' : '0.5';
    deleteBtn.style.cursor = hasSelection ? 'pointer' : 'not-allowed';
  }
}

function cancelContainerTrash() {
  document.getElementById('containerTrashModal').classList.remove('active');
}

function restoreSelectedContainers() {
  const checkboxes = document.querySelectorAll('#containerTrashList input[type="checkbox"]:checked');
  const selectedGuids = Array.from(checkboxes).map(cb => cb.value);
  
  if (selectedGuids.length === 0) {
    showToast('请选择要恢复的工作区', 'warning');
    return;
  }
  
  showConfirmModal({
    title: '确认恢复',
    message: `确定要恢复选中的 ${selectedGuids.length} 个工作区吗？`,
    icon: 'info',
    confirmText: '恢复',
    cancelText: '取消',
    confirmType: 'primary'
  }).then(confirmed => {
    if (!confirmed) return;
    
    const loadingDiv = document.createElement('div');
    loadingDiv.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px;">
        <div class="modal-spinner" style="width: 40px; height: 40px; border-width: 4px;"></div>
        <div style="margin-top: 16px; color: #999; font-size: 14px;">${t('containerTrash.restoring')}</div>
      </div>
    `;
    
    const trashList = document.getElementById('containerTrashList');
    const originalContent = trashList.innerHTML;
    trashList.innerHTML = '';
    trashList.appendChild(loadingDiv);
    
    Promise.all(selectedGuids.map(id => dserverCall('container.restore', { containerId: id })))
      .then(results => {
        const successCount = results.filter(r => r && !r.error && (r.success || r.status)).length;
        showToast(`成功恢复 ${successCount}/${selectedGuids.length} 个工作区`, 'success');
        showContainerTrashModal();
        loadContainers();
      })
      .catch(err => {
        console.error('Failed to restore containers:', err);
        trashList.innerHTML = originalContent;
        showToast('恢复工作区失败: ' + (err.message || ''), 'error');
      });
  });
}

function deleteSelectedContainers() {
  const checkboxes = document.querySelectorAll('#containerTrashList input[type="checkbox"]:checked');
  const selectedGuids = Array.from(checkboxes).map(cb => cb.value);
  
  if (selectedGuids.length === 0) {
    showToast('请选择要彻底删除的工作区', 'warning');
    return;
  }
  
  showConfirmModal({
    title: '确认彻底删除',
    message: `确定要彻底删除选中的 ${selectedGuids.length} 个工作区吗？`,
    detail: '此操作不可恢复！',
    icon: 'warning',
    confirmText: '彻底删除',
    cancelText: '取消',
    confirmType: 'danger'
  }).then(confirmed => {
    if (!confirmed) return;
    
    const loadingDiv = document.createElement('div');
    loadingDiv.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px;">
        <div class="modal-spinner" style="width: 40px; height: 40px; border-width: 4px;"></div>
        <div style="margin-top: 16px; color: #999; font-size: 14px;">${t('containerTrash.deleting')}</div>
      </div>
    `;
    
    const trashList = document.getElementById('containerTrashList');
    const originalContent = trashList.innerHTML;
    trashList.innerHTML = '';
    trashList.appendChild(loadingDiv);
    
    Promise.all(selectedGuids.map(id => dserverCall('container.delete', { containerId: id, permanent: 1 })))
      .then(results => {
        const successCount = results.filter(r => r && r.success).length;
        showToast(`成功彻底删除 ${successCount}/${selectedGuids.length} 个工作区`, 'success');
        showContainerTrashModal();
        loadContainers();
      })
      .catch(err => {
        console.error('Failed to delete containers:', err);
        trashList.innerHTML = originalContent;
        showToast('彻底删除工作区失败: ' + (err.message || ''), 'error');
      });
  });
}

function showCloseAllAppsModal() {
  closeMoreMenu();
  
  showLoading('正在关闭所有工作区的应用...');
  
  const getContainers = () => {
    if (containers && containers.length > 0) {
      return Promise.resolve();
    }
    return loadContainers();
  };
  
  getContainers().then(() => {
    const allContainers = containers.filter(c => c.status !== 5);
    
    if (allContainers.length === 0) {
      hideLoading();
      showToast('没有工作区', 'info');
      return;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    const closePromises = allContainers.map((container) => {
      return dserverCall('wine.wineboot_kill', { container_id: container.id })
        .then(() => {
          successCount++;
        })
        .catch(err => {
          failCount++;
          console.error(`Failed to close apps in container ${container.id} (${container.name}):`, err);
        });
    });
    
    Promise.all(closePromises).then(() => {
      hideLoading();
      
      if (failCount === 0) {
        showToast('已关闭所有工作区的应用', 'success');
      } else if (successCount === 0) {
        showToast('关闭所有工作区应用失败', 'error');
      } else {
        showToast(`部分关闭成功：成功${successCount}个，失败${failCount}个`, 'warning');
      }
      
      if (currentView === 'detail' && currentContainerId) {
        loadApps(currentContainerId);
      }
    }).catch(err => {
      console.error('Failed to close all apps:', err);
      hideLoading();
      showToast('关闭所有工作区应用失败', 'error');
    });
  }).catch(err => {
    console.error('Failed to get containers:', err);
    hideLoading();
    showToast('获取工作区列表失败', 'error');
  });
}

function cancelImportFont() {
  const modal = document.getElementById('importFontModal');
  if (modal) modal.style.display = 'none';
}

function browseFontPath() {
  ipcCall('open-file-dialog', {
    title: '选择字体文件',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '字体文件', extensions: ['ttf', 'otf', 'woff', 'woff2', 'fon', 'ttc', 'eot'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  }).then(result => {
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      const fontPathInput = document.getElementById('fontPath');
      const fontFilesList = document.getElementById('fontFilesList');
      
      if (fontPathInput) fontPathInput.value = result.filePaths.length > 1 ? `${result.filePaths.length} 个文件` : result.filePaths[0];
      
      if (fontFilesList) {
        fontFilesList.innerHTML = result.filePaths.map(f => `<div style="padding: 4px 8px; background: #f5f5f5; border-radius: 4px; margin-bottom: 4px;">${f}</div>`).join('');
      }
    }
  }).catch(error => {
    console.error('[FONT_IMPORT] File dialog error:', error);
  });
}

async function confirmImportFont() {
  const fontPathInput = document.getElementById('fontPath');
  if (!fontPathInput || !fontPathInput.value) {
    showToast('请选择字体文件', 'error');
    return;
  }
  
  showToast('字体导入功能开发中', 'info');
  cancelImportFont();
}

function showImportFontModal() {
  closeMoreMenu();
  
  ipcCall('open-file-dialog', {
    title: '选择字体文件',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '字体文件', extensions: ['ttf', 'otf', 'woff', 'woff2', 'fon', 'ttc', 'eot'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  }).then(result => {
    console.log('[FONT_IMPORT] File dialog result:', JSON.stringify(result));
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      const files = result.filePaths;
      console.log('[FONT_IMPORT] Selected files:', files);
      
      dserverCall('font.import', { 
        files: files,
        checkOnly: 1
      })
        .then(checkResult => {
          console.log('[FONT_IMPORT] checkOnly response:', JSON.stringify(checkResult));
          console.log('[FONT_IMPORT] checkResult type:', typeof checkResult);
          
          var data = checkResult;
          if (typeof data === 'string') {
            try {
              data = JSON.parse(data);
              console.log('[FONT_IMPORT] Parsed data:', JSON.stringify(data));
            } catch (e) {
              console.error('[FONT_IMPORT] Failed to parse string:', e);
            }
          }
          
          console.log('[FONT_IMPORT] duplicates before parse:', data ? data.duplicates : 'undefined');
          console.log('[FONT_IMPORT] duplicates type:', data ? typeof data.duplicates : 'undefined');
          
          if (data && typeof data.duplicates === 'string') {
            try {
              data.duplicates = JSON.parse(data.duplicates);
              console.log('[FONT_IMPORT] duplicates after parse:', data.duplicates);
            } catch (e) {
              console.error('[FONT_IMPORT] Failed to parse duplicates:', e);
              data.duplicates = [];
            }
          }
          
          if (data && typeof data.invalidFiles === 'string') {
            try {
              data.invalidFiles = JSON.parse(data.invalidFiles);
            } catch (e) {
              data.invalidFiles = [];
            }
          }
          
          if (data && data.duplicates && Array.isArray(data.duplicates) && data.duplicates.length > 0) {
            console.log('[FONT_IMPORT] Showing duplicate dialog for:', data.duplicates);
            showFontDuplicateDialog(data.duplicates, files);
          } else {
            console.log('[FONT_IMPORT] No duplicates found, executing import');
            executeFontImport(files, 1);
          }
        })
        .catch(error => {
          console.error('[FONT_IMPORT] Error during check:', error);
          showToast(`检查字体文件失败：${error.message}`, 'error');
        });
    } else {
      console.log('[FONT_IMPORT] No files selected or dialog canceled');
    }
  }).catch(error => {
    console.error('[FONT_IMPORT] File dialog error:', error);
  });
}

function showFontDuplicateDialog(duplicates, fontFiles) {
  const duplicateActions = {};
  let shouldCancel = false;
  let applyAllAction = null;
  let currentIndex = 0;
  
  const processNext = () => {
    if (currentIndex >= duplicates.length || shouldCancel || applyAllAction !== null) {
      if (!shouldCancel) {
        const overwriteAll = applyAllAction === 'overwrite' ? 1 : 0;
        executeFontImport(fontFiles, overwriteAll);
      }
      return;
    }
    
    const duplicateFile = duplicates[currentIndex];
    const remainingCount = duplicates.length - currentIndex - 1;
    
    const confirmModal = document.createElement('div');
    confirmModal.className = 'modal active';
    confirmModal.innerHTML = `
      <div class="modal-content" style="width: 460px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="display: flex; align-items: center; padding: 12px 16px; background: #f5f5f5; border-bottom: 1px solid #e0e0e0;">
          <button id="cancelFontDupBtn" style="background: #fff; border: 1px solid #ccc; border-radius: 4px; padding: 10px 24px; font-size: 13px; cursor: pointer; margin-right: auto;">取消</button>
          <span style="font-weight: 600; color: #333; font-size: 13px; position: absolute; left: 50%; transform: translateX(-50%);">文件冲突</span>
          <div style="display: flex; gap: 8px; margin-left: auto;">
            <button id="skipFontBtn" style="background: #fff; border: 1px solid #ccc; border-radius: 4px; padding: 10px 24px; font-size: 13px; cursor: pointer;">跳过</button>
            <button id="overwriteFontBtn" style="background: #4CAF50; border: none; border-radius: 4px; padding: 10px 24px; font-size: 13px; color: #fff; font-weight: 600; cursor: pointer;">替换</button>
          </div>
        </div>
        <div style="padding: 20px;">
          <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #1a1a1a;">替换文件 "${duplicateFile}"？</h3>
          <p style="margin: 0 0 16px 0; font-size: 13px; color: #666;">已存在同名文件，替换将覆盖现有内容。</p>
          
          <div style="margin-bottom: 12px;">
            <div style="font-size: 13px; font-weight: 600; color: #333; margin-bottom: 6px;">原文件</div>
            <div style="display: flex; align-items: center; padding: 10px 12px; background: #fafafa; border-radius: 4px;">
              <svg style="width: 28px; height: 28px; margin-right: 10px; opacity: 0.5;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
              </svg>
              <div style="font-size: 13px; color: #333;">${duplicateFile}</div>
            </div>
          </div>
          
          <div style="margin-bottom: 16px;">
            <div style="font-size: 13px; font-weight: 600; color: #333; margin-bottom: 6px;">替换为</div>
            <div style="display: flex; align-items: center; padding: 10px 12px; background: #fafafa; border-radius: 4px; border: 2px solid #4CAF50;">
              <svg style="width: 28px; height: 28px; margin-right: 10px; opacity: 0.5;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
              </svg>
              <div style="font-size: 13px; color: #333;">${duplicateFile}</div>
            </div>
          </div>
          
          ${remainingCount > 0 ? `<div style="margin-bottom: 16px; color: #666; font-size: 13px;">还有 ${remainingCount} 个重复文件...</div>` : ''}
          
          <label style="display: flex; align-items: center;">
            <input type="checkbox" id="overwriteAllFontCheckbox" style="margin-right: 8px; width: 16px; height: 16px;">
            <span style="font-size: 13px; color: #333;">将此操作应用到所有文件</span>
          </label>
        </div>
      </div>
    `;
    document.body.appendChild(confirmModal);
    
    const handleAction = (action) => {
      const applyAll = document.getElementById('overwriteAllFontCheckbox').checked;
      document.body.removeChild(confirmModal);
      
      if (action === 'cancel') {
        shouldCancel = true;
      } else if (applyAll) {
        applyAllAction = action;
      } else {
        duplicateActions[duplicateFile] = action;
        currentIndex++;
      }
      processNext();
    };
    
    document.getElementById('cancelFontDupBtn').onclick = () => handleAction('cancel');
    document.getElementById('skipFontBtn').onclick = () => handleAction('skip');
    document.getElementById('overwriteFontBtn').onclick = () => handleAction('overwrite');
  };
  
  processNext();
}

function executeFontImport(fontFiles, overwriteAll) {
  console.log('[FONT_IMPORT] executeFontImport called with files:', fontFiles, 'overwriteAll:', overwriteAll);
  showLoading();
  
  dserverCall('font.import', { 
    files: fontFiles,
    overwriteAll: overwriteAll,
    checkOnly: 0
  })
    .then(result => {
      hideLoading();
      console.log('[FONT_IMPORT] Import response:', JSON.stringify(result));
      console.log('[FONT_IMPORT] response type:', typeof result);
      
      var data = result;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
          console.log('[FONT_IMPORT] Parsed response:', JSON.stringify(data));
        } catch (e) {
          console.error('[FONT_IMPORT] Failed to parse response:', e);
        }
      }
      
      if (data && typeof data.invalidFiles === 'string') {
        try {
          data.invalidFiles = JSON.parse(data.invalidFiles);
        } catch (e) {
          data.invalidFiles = [];
        }
      }
      
      var isSuccess = false;
      if (data && data.success !== undefined) {
        if (typeof data.success === 'string') {
          isSuccess = data.success === 'true';
        } else {
          isSuccess = !!data.success;
        }
      }
      
      console.log('[FONT_IMPORT] isSuccess:', isSuccess, 'successCount:', data ? data.successCount : 'undefined');
      
      if (isSuccess) {
        let message = `导入成功！\n成功：${data.successCount || 0} 个\n失败：${data.failCount || 0} 个\n跳过：${data.skippedCount || 0} 个`;
        if (data.invalidFiles && Array.isArray(data.invalidFiles) && data.invalidFiles.length > 0) {
          message += `\n\n不支持的格式：\n${data.invalidFiles.join('\n')}`;
        }
        showToast(message, 'success');
      } else {
        showToast(`导入失败：${data.message || '未知错误'}`, 'error');
      }
    })
    .catch(error => {
      hideLoading();
      console.error('[FONT_IMPORT] Import error:', error);
      showToast(`导入失败：${error.message}`, 'error');
    });
}

function showImportContainerModal() {
  document.getElementById('importPath').value = '';
  document.getElementById('importContainerName').value = '';
  document.getElementById('importPassword').value = '';
  document.getElementById('importPassword').type = 'password';
  document.getElementById('importPasswordFormGroup').style.display = 'none';
  document.getElementById('importPasswordToggle').style.display = 'none';
  document.getElementById('importPasswordToggle').innerHTML = `<img src="${getAssetUrl('../../assets/images/cipher.svg')}" alt="显示密码" width="16" height="16">`;
  document.getElementById('importProgressContainer').style.display = 'none';
  document.getElementById('importContainerModal').classList.add('active');
  
  addModalKeyHandler('importContainerModal', confirmImportContainer, cancelImportContainer);
}

function cancelImportContainer() {
  document.getElementById('importContainerModal').classList.remove('active');
  if (isTaskRunning) {
    showToast('导入工作区在后台执行中...', 'info');
  }
}

async function checkImportPasswordProtection(filePath) {
  try {
    const result = await dserverCall('container.checkPassword', { path: filePath });
    if (result && result.hasPassword) {
      document.getElementById('importPasswordFormGroup').style.display = 'block';
    } else {
      document.getElementById('importPasswordFormGroup').style.display = 'none';
      document.getElementById('importPassword').value = '';
      document.getElementById('importPasswordToggle').style.display = 'none';
    }
  } catch (error) {
    console.error('Error checking password protection:', error);
    document.getElementById('importPasswordFormGroup').style.display = 'none';
  }
}

function handleImportPasswordInput() {
  const passwordInput = document.getElementById('importPassword');
  const toggleBtn = document.getElementById('importPasswordToggle');
  
  if (passwordInput.value.length > 0) {
    toggleBtn.style.display = 'flex';
  } else {
    toggleBtn.style.display = 'none';
    passwordInput.type = 'password';
    toggleBtn.innerHTML = `<img src="${getAssetUrl('../../assets/images/cipher.svg')}" alt="显示密码" width="16" height="16">`;
  }
}

function toggleImportPasswordVisibility() {
  const passwordInput = document.getElementById('importPassword');
  const toggleBtn = document.getElementById('importPasswordToggle');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    toggleBtn.innerHTML = `<img src="${getAssetUrl('../../assets/images/plain.svg')}" alt="隐藏密码" width="16" height="16">`;
  } else {
    passwordInput.type = 'password';
    toggleBtn.innerHTML = `<img src="${getAssetUrl('../../assets/images/cipher.svg')}" alt="显示密码" width="16" height="16">`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const importPasswordInput = document.getElementById('importPassword');
  const importPasswordToggle = document.getElementById('importPasswordToggle');
  
  if (importPasswordInput) {
    importPasswordInput.addEventListener('input', handleImportPasswordInput);
  }
  
  if (importPasswordToggle) {
    importPasswordToggle.addEventListener('click', toggleImportPasswordVisibility);
  }
});

function browseImportPath() {
  ipcCall('open-file-dialog', {
    title: '选择工作区文件',
    properties: ['openFile'],
    filters: [
      { name: '工作区文件', extensions: ['srtar'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  }).then(result => {
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      document.getElementById('importPath').value = result.filePaths[0];
      checkImportPasswordProtection(result.filePaths[0]);
    }
  });
}

function confirmImportContainer() {
  const importPath = document.getElementById('importPath').value.trim();
  let containerName = document.getElementById('importContainerName').value.trim();
  
  containerName = sanitizeInput(containerName);
  
  if (!importPath) {
    showToast('请选择工作区文件', 'warning');
    return;
  }
  
  if (containerName) {
    const nameExists = containers.some(c => c.name === containerName || c.alias_name === containerName);
    if (nameExists) {
      showToast('工作区名称已存在，请输入其他名称', 'warning');
      return;
    }
  }
  
  window.electronAPI.fileExists(importPath).then(async fileExists => {
    if (!fileExists) {
      showToast('导入文件路径不存在', 'error');
      return;
    }
    
    const confirmed = await showConfirmModal({
      title: '确认导入工作区',
      message: '导入工作区可能需要较长时间，请确认继续？',
      detail: importPath,
      icon: 'info',
      confirmText: '确认',
      cancelText: '取消',
      confirmClass: 'btn-primary'
    });
    
    if (!confirmed) {
      return;
    }
    
    showModalLoading('importContainerLoading');
    document.getElementById('importProgressContainer').style.display = 'block';
    
    isTaskRunning = true;
    
    const importPassword = document.getElementById('importPassword').value;
    const createDesktop = document.getElementById('importCreateDesktop').checked;
    const importParams = { path: importPath, createDesktop: createDesktop };
    if (containerName) {
      importParams.name = containerName;
    }
    if (importPassword) {
      importParams.password = importPassword;
    }
    
    let progressUnsubscribe = null;
    let completedUnsubscribe = null;
    let failedUnsubscribe = null;
    
    const cleanupListeners = () => {
      isTaskRunning = false;
      if (progressUnsubscribe) {
        progressUnsubscribe();
        progressUnsubscribe = null;
      }
      if (completedUnsubscribe) {
        completedUnsubscribe();
        completedUnsubscribe = null;
      }
      if (failedUnsubscribe) {
        failedUnsubscribe();
        failedUnsubscribe = null;
      }
    };
    
    dserverCall('container.import', importParams)
      .then(result => {
        if (result && result.taskId) {
          const taskId = result.taskId;
          
          taskManager.createTask({
          id: taskId,
          type: 'container_import',
          status: 'running',
          progress: 0,
          payload: { path: importPath, name: containerName, password: importPassword },
          recovery_mode: 'ui'
        });
          
          progressUnsubscribe = window.electronAPI.receive('event:task.progress', (data) => {
            let taskData = data;
            if (Array.isArray(data) && data.length > 0) {
              taskData = data[0];
            }
            if (taskData && taskData.task_id === taskId) {
              const progress = taskData.progress || 0;
              const progressFill = document.getElementById('importProgressBarFill');
              const progressText = document.querySelector('#importProgressContainer .progress-text');
              if (progressFill) {
                progressFill.style.width = progress + '%';
              }
              if (progressText) {
                progressText.textContent = progress + '%';
                if (taskData.message) {
                  progressText.textContent = progress + '% - ' + taskData.message;
                }
              }
            }
          });
          
          completedUnsubscribe = window.electronAPI.receive('event:task.completed', (data) => {
            let taskData = data;
            if (Array.isArray(data) && data.length > 0) {
              taskData = data[0];
            }
            if (taskData && taskData.task_id === taskId) {
              cleanupListeners();
              hideModalLoading('importContainerLoading');
              const progressFill = document.getElementById('importProgressBarFill');
              const progressText = document.querySelector('#importProgressContainer .progress-text');
              if (progressFill) {
                progressFill.style.width = '100%';
              }
              if (progressText) {
                progressText.textContent = '100% - 导入完成';
              }
              
              setTimeout(() => {
                cancelImportContainer();
                loadContainers();
                showToast('导入工作区成功', 'success');
              }, 500);
            }
          });
          
          failedUnsubscribe = window.electronAPI.receive('event:task.failed', (data) => {
            let taskData = data;
            if (Array.isArray(data) && data.length > 0) {
              taskData = data[0];
            }
            if (taskData && taskData.task_id === taskId) {
              cleanupListeners();
              hideModalLoading('importContainerLoading');
              document.getElementById('importProgressContainer').style.display = 'none';
              
              let errorMsg = '导入工作区失败';
              const errMessage = taskData.error_message || taskData.message;
              
              if (errMessage && errMessage.startsWith('DIRECTORY_EXISTS_RESIDUAL|')) {
                const detailMsg = errMessage.substring(errMessage.indexOf('|') + 1);
                const dirPathMatch = detailMsg.match(/: (.+?)(?:\. This|$)/);
                const dirPath = dirPathMatch ? dirPathMatch[1] : '未知路径';
                
                showConfirmModal({
                  title: '发现残留目录',
                  message: '检测到该工作区之前可能导入失败，存在残留文件。',
                  detail: `残留路径: ${dirPath}\n\n是否删除残留目录并重新导入？`,
                  icon: 'warning',
                  confirmText: '删除并重新导入',
                  cancelText: '取消',
                  confirmClass: 'btn-danger'
                }).then(confirmed => {
                  if (confirmed) {
                    showModalLoading('importContainerLoading');
                    document.getElementById('importProgressContainer').style.display = 'block';
                    
                    const retryParams = { ...importParams, force_overwrite: 1 };
                    
                    dserverCall('container.import', retryParams)
                      .then(newResult => {
                        if (newResult && newResult.taskId) {
                          const newTaskId = newResult.taskId;
                          
                          taskManager.createTask({
                            id: newTaskId,
                            type: 'container_import',
                            status: 'running',
                            progress: 0,
                            payload: retryParams,
                            recovery_mode: 'ui'
                          });
                          
                          const newProgressUnsub = window.electronAPI.receive('event:task.progress', (data) => {
                            let newTaskData = data;
                            if (Array.isArray(data) && data.length > 0) {
                              newTaskData = data[0];
                            }
                            if (newTaskData && newTaskData.task_id === newTaskId) {
                              const progress = newTaskData.progress || 0;
                              const progressFill = document.getElementById('importProgressBarFill');
                              const progressText = document.querySelector('#importProgressContainer .progress-text');
                              if (progressFill) {
                                progressFill.style.width = progress + '%';
                              }
                              if (progressText) {
                                progressText.textContent = progress + '%';
                                if (newTaskData.message) {
                                  progressText.textContent = progress + '% - ' + newTaskData.message;
                                }
                              }
                            }
                          });
                          
                          const newCompletedUnsub = window.electronAPI.receive('event:task.completed', (data) => {
                            let newTaskData = data;
                            if (Array.isArray(data) && data.length > 0) {
                              newTaskData = data[0];
                            }
                            if (newTaskData && newTaskData.task_id === newTaskId) {
                              newProgressUnsub();
                              newCompletedUnsub();
                              newFailedUnsub();
                              hideModalLoading('importContainerLoading');
                              const progressFill = document.getElementById('importProgressBarFill');
                              const progressText = document.querySelector('#importProgressContainer .progress-text');
                              if (progressFill) {
                                progressFill.style.width = '100%';
                              }
                              if (progressText) {
                                progressText.textContent = '100% - 导入完成';
                              }
                              
                              setTimeout(() => {
                                cancelImportContainer();
                                loadContainers();
                                showToast('导入工作区成功', 'success');
                              }, 500);
                            }
                          });
                          
                          const newFailedUnsub = window.electronAPI.receive('event:task.failed', (data) => {
                            let newTaskData = data;
                            if (Array.isArray(data) && data.length > 0) {
                              newTaskData = data[0];
                            }
                            if (newTaskData && newTaskData.task_id === newTaskId) {
                              newProgressUnsub();
                              newCompletedUnsub();
                              newFailedUnsub();
                              hideModalLoading('importContainerLoading');
                              document.getElementById('importProgressContainer').style.display = 'none';
                              showToast('强制重新导入失败: ' + (newTaskData.error_message || newTaskData.message), 'error');
                            }
                          });
                        } else {
                          hideModalLoading('importContainerLoading');
                          document.getElementById('importProgressContainer').style.display = 'none';
                          showToast('创建导入任务失败', 'error');
                        }
                      })
                      .catch(err => {
                        hideModalLoading('importContainerLoading');
                        document.getElementById('importProgressContainer').style.display = 'none';
                        showToast('强制重新导入失败: ' + (err.message || err), 'error');
                      });
                  }
                });
              } else if (errMessage) {
                if (errMessage.includes('GUID conflict')) {
                  if (errMessage.includes('in trash')) {
                    errorMsg = '工作区(回收站)已存在，无法导入';
                  } else {
                    errorMsg = '工作区已存在，无法导入';
                  }
                } else if (errMessage.includes('name conflict')) {
                  errorMsg = '工作区名称已存在，请输入其他名称';
                } else if (errMessage.includes('Password verification failed')) {
                  errorMsg = '密码错误，请重新输入';
                } else if (errMessage.includes('Tar version')) {
                  const versionMatch = errMessage.match(/upgrade to version (\S+) or later/);
                  if (versionMatch) {
                    errorMsg = '版本不兼容，请升级到 ' + versionMatch[1] + ' 或更高版本后再导入';
                  } else {
                    errorMsg = '版本不兼容，请升级后再导入';
                  }
                } else if (errMessage.includes('decrypt')) {
                  errorMsg = '解密失败，请检查密码是否正确';
                } else if (errMessage.includes('directory already exists')) {
                  errorMsg = '工作区目录已存在，可能已导入过该工作区。请检查后重试。';
                } else {
                  errorMsg = '导入工作区失败: ' + errMessage;
                }
                showToast(errorMsg, 'error');
              }
            }
          });
        } else {
          hideModalLoading('importContainerLoading');
          document.getElementById('importProgressContainer').style.display = 'none';
          showToast('创建导入任务失败', 'error');
        }
      }).catch(err => {
        console.error('Failed to create import task:', err);
        hideModalLoading('importContainerLoading');
        document.getElementById('importProgressContainer').style.display = 'none';
        
        let errorMsg = '导入工作区失败';
        if (err && err.message) {
          if (err.message.includes('GUID conflict')) {
            errorMsg = '工作区已存在，无法导入';
          } else if (err.message.includes('name conflict')) {
            errorMsg = '工作区名称已存在，请输入其他名称';
          } else if (err.message.includes('Password verification failed')) {
            errorMsg = '密码错误，请重新输入';
          } else if (err.message.includes('Tar version')) {
            const versionMatch = err.message.match(/upgrade to version (\S+) or later/);
            if (versionMatch) {
              errorMsg = '版本不兼容，请升级到 ' + versionMatch[1] + ' 或更高版本后再导入';
            } else {
              errorMsg = '版本不兼容，请升级后再导入';
            }
          } else if (err.message.includes('decrypt')) {
            errorMsg = '解密失败，请检查密码是否正确';
          } else if (err.message.includes('directory already exists')) {
            errorMsg = '工作区目录已存在，可能已导入过该工作区。请检查后重试。';
          } else {
            errorMsg = '导入工作区失败: ' + err.message;
          }
        }
        showToast(errorMsg, 'error');
      });
  });
}

function showExportContainerModal(containerId) {
  if (containerId) {
    currentContainerId = containerId;
  }
  document.getElementById('exportPath').value = '';
  document.getElementById('exportPassword').value = '';
  document.getElementById('exportProgressContainer').style.display = 'none';
  document.getElementById('exportContainerModal').classList.add('active');
  
  addModalKeyHandler('exportContainerModal', confirmExportContainer, cancelExportContainer);
}

function confirmExportContainer() {
  exportContainer();
}

function cancelExportContainer() {
  document.getElementById('exportContainerModal').classList.remove('active');
  if (isTaskRunning) {
    showToast('导出工作区在后台执行中...', 'info');
  }
}

function browseExportPath() {
  const container = containers.find(c => String(c.id) === String(currentContainerId));
  const containerName = container?.name || container?.alias_name || 'container';
  const defaultFileName = `stackrun_${containerName}`;
  
  ipcCall('save-file-dialog', { 
    filters: [{ name: '工作区文件', extensions: ['srtar'] }],
    defaultPath: defaultFileName
  })
    .then(result => {
      if (result && result.filePath) {
        let filePath = result.filePath;
        if (!filePath.toLowerCase().endsWith('.srtar')) {
          filePath += '.srtar';
        }
        document.getElementById('exportPath').value = filePath;
      }
    })
    .catch(err => {
      console.error('Failed to open save dialog:', err);
      showToast('无法打开保存对话框', 'error');
    });
}

async function exportContainer() {
  const exportPath = document.getElementById('exportPath').value.trim();
  const exportPassword = document.getElementById('exportPassword').value.trim();
  
  if (!exportPath) {
    showToast('请选择导出路径', 'warning');
    return;
  }
  
  const fileExists = await window.electronAPI.fileExists(exportPath);
  if (fileExists) {
    const confirmed = await showConfirmModal({
      title: '文件已存在',
      message: '该路径下已存在同名文件，是否覆盖？',
      detail: exportPath,
      confirmText: '覆盖',
      cancelText: '取消',
      confirmClass: 'btn-danger'
    });
    
    if (!confirmed) {
      return;
    }
  }
  
  const dirPath = exportPath.substring(0, exportPath.lastIndexOf('/'));
  const dirExists = await window.electronAPI.fileExists(dirPath);
  if (!dirExists) {
    showToast('导出目录路径不存在', 'error');
    return;
  }
  
  const confirmed = await showConfirmModal({
    title: '确认导出工作区',
    message: '导出工作区可能需要较长时间，请确认继续？',
    detail: exportPath,
    icon: 'info',
    confirmText: '确认',
    cancelText: '取消',
    confirmClass: 'btn-primary'
  });
  
  if (!confirmed) {
    return;
  }
  
  showModalLoading('exportContainerLoading');
  document.getElementById('exportProgressContainer').style.display = 'block';
  document.getElementById('exportProgressBarFill').style.width = '0%';
  document.getElementById('exportProgressText').textContent = '0%';
  
  isTaskRunning = true;
  
  dserverCall('container.export', { containerId: currentContainerId, exportPath: exportPath, password: exportPassword })
    .then((result) => {
      if (result && result.taskId) {
        taskManager.createTask({
          id: result.taskId,
          type: 'container_export',
          status: 'running',
          progress: 0,
          container_id: currentContainerId,
          payload: { containerId: currentContainerId, exportPath, password: exportPassword },
          recovery_mode: 'silent'
        });
        startExportProgressMonitor(result.taskId);
      } else {
        hideModalLoading('exportContainerLoading');
        cancelExportContainer();
        showToast('导出工作区成功', 'success');
      }
    }).catch(err => {
      console.error('Failed to export container:', err);
      hideModalLoading('exportContainerLoading');
      document.getElementById('exportProgressContainer').style.display = 'none';
      showToast('导出工作区失败: ' + (err.message || err), 'error');
    });
}

function startExportProgressMonitor(taskId) {
  const monitorInterval = setInterval(() => {
    dserverCall('task.status', { taskId: taskId })
      .then(status => {
        if (!status) {
          clearInterval(monitorInterval);
          hideModalLoading('exportContainerLoading');
          isTaskRunning = false;
          return;
        }
        
        const progress = status.progress || 0;
        const message = status.message || '';
        
        document.getElementById('exportProgressBarFill').style.width = `${progress}%`;
        document.getElementById('exportProgressText').textContent = `${progress}% ${message}`;
        
        if (status.status === 'completed') {
          clearInterval(monitorInterval);
          hideModalLoading('exportContainerLoading');
          isTaskRunning = false;
          setTimeout(() => {
            cancelExportContainer();
            showToast('导出工作区成功', 'success');
          }, 500);
        } else if (status.status === 'failed' || status.status === 'cancelled') {
          clearInterval(monitorInterval);
          hideModalLoading('exportContainerLoading');
          isTaskRunning = false;
          document.getElementById('exportProgressContainer').style.display = 'none';
          showToast('导出工作区失败: ' + (status.error || '未知错误'), 'error');
        }
      })
      .catch(() => {
        clearInterval(monitorInterval);
        hideModalLoading('exportContainerLoading');
        isTaskRunning = false;
      });
  }, 1000);
}

function handleExportPasswordInput() {
  const passwordInput = document.getElementById('exportPassword');
  const toggleBtn = document.getElementById('exportPasswordToggle');
  
  if (passwordInput.value.length > 0) {
    toggleBtn.style.display = 'flex';
  } else {
    toggleBtn.style.display = 'none';
    passwordInput.type = 'password';
    toggleBtn.innerHTML = `<img src="${getAssetUrl('../../assets/images/cipher.svg')}" alt="显示密码" width="16" height="16">`;
  }
}

window.handleExportPasswordInput = handleExportPasswordInput;

function toggleExportPasswordVisibility() {
  const passwordInput = document.getElementById('exportPassword');
  const toggleBtn = document.getElementById('exportPasswordToggle');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    toggleBtn.innerHTML = `<img src="${getAssetUrl('../../assets/images/plain.svg')}" alt="隐藏密码" width="16" height="16">`;
  } else {
    passwordInput.type = 'password';
    toggleBtn.innerHTML = `<img src="${getAssetUrl('../../assets/images/cipher.svg')}" alt="显示密码" width="16" height="16">`;
  }
}

window.toggleExportPasswordVisibility = toggleExportPasswordVisibility;

function showInstallComponentsModal() {
  document.getElementById('componentName').value = '';
  document.getElementById('installLog').value = '';
  document.getElementById('componentDropdown').style.display = 'none';
  document.getElementById('installComponentsModal').classList.add('active');
  
  addModalKeyHandler('installComponentsModal', startInstallComponents, cancelInstallComponents);
}

function toggleComponentDropdown(event) {
  event.stopPropagation();
  const dropdown = document.getElementById('componentDropdown');
  dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

function onComponentInput() {
  const input = document.getElementById('componentName').value.toLowerCase();
  const dropdown = document.getElementById('componentDropdown');
  const items = dropdown.querySelectorAll('div');
  
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(input) ? '' : 'none';
  });
}

function selectComponent(event, name) {
  event.stopPropagation();
  document.getElementById('componentName').value = name;
  document.getElementById('componentDropdown').style.display = 'none';
}

let currentInstallTaskId = null;

async function startInstallComponents() {
  const componentName = document.getElementById('componentName').value.trim();
  const forceInstall = document.getElementById('forceInstall').checked;
  
  if (!componentName) {
    document.getElementById('componentNameError').style.display = 'block';
    return;
  }
  document.getElementById('componentNameError').style.display = 'none';
  
  const confirmed = await showConfirmModal({
    title: '安装组件确认',
    message: '安装组件前需要关闭所有打开的应用，是否确认？',
    confirmText: '确认安装',
    cancelText: '取消'
  });
  
  if (!confirmed) {
    return;
  }
  
  const installBtn = document.getElementById('installDialogConfirm');
  const cancelBtn = document.getElementById('installDialogCancel');
  
  installBtn.disabled = true;
  cancelBtn.disabled = false;
  document.getElementById('installLog').value = '';
  document.body.style.cursor = 'wait';
  
  try {
    document.getElementById('installLog').value += '正在关闭工作区应用...\n';
    
    try {
      const killResult = await dserverCall('wine.wineboot_kill', { container_id: currentContainerId });
      if (killResult && killResult.success !== false) {
        document.getElementById('installLog').value += '工作区应用已关闭\n';
      } else {
        document.getElementById('installLog').value += '关闭应用失败，但将继续安装\n';
      }
    } catch (killErr) {
      document.getElementById('installLog').value += '关闭应用时出错，但将继续安装\n';
    }
    
    document.getElementById('installLog').value += '\n';
    
    const confirmToken = await generateConfirmToken(currentContainerId);
    const result = await ipcCall('install-component', { 
      containerId: currentContainerId, 
      name: componentName, 
      force: forceInstall,
      confirmToken: confirmToken
    });
    
    if (result && result.success && result.result) {
      currentInstallTaskId = result.result.task_id;
      showToast('安装组件已提交: ' + componentName, 'success');
      
      const removeListener = window.electronAPI.receive('dserver:progress', (eventData) => {
        const taskId = eventData.task_id || eventData.taskId;
        if (taskId !== currentInstallTaskId) return;
        
        const logArea = document.getElementById('installLog');
        if (eventData.message) {
          logArea.value += eventData.message + '\n';
          logArea.scrollTop = logArea.scrollHeight;
        }
        
        if (eventData.progress === 100 || eventData.stage === '完成' || eventData.stage === 'completed') {
          removeListener();
          logArea.value += '\n执行完毕。\n';
          logArea.scrollTop = logArea.scrollHeight;
          installBtn.disabled = false;
          cancelBtn.disabled = true;
          currentInstallTaskId = null;
          document.body.style.cursor = 'default';
          showToast('安装完成', 'success');
        } else if (eventData.progress === -1 || eventData.stage === '失败' || eventData.stage === 'cancelled') {
          removeListener();
          logArea.value += '\n执行完毕。\n';
          logArea.scrollTop = logArea.scrollHeight;
          installBtn.disabled = false;
          cancelBtn.disabled = true;
          currentInstallTaskId = null;
          document.body.style.cursor = 'default';
          if (eventData.stage === 'cancelled' || eventData.stage === '已取消') {
            showToast('安装已取消', 'warning');
          } else {
            showToast('安装失败', 'error');
          }
        }
      });
    } else {
      const errMsg = result.message || result.error || '安装失败';
      document.getElementById('installLog').value += '安装失败: ' + errMsg + '\n\n执行完毕。\n';
      showToast('安装失败: ' + errMsg, 'error');
      installBtn.disabled = false;
      cancelBtn.disabled = true;
      document.body.style.cursor = 'default';
    }
  } catch (err) {
    console.error('Failed to install component:', err);
    document.getElementById('installLog').value += '安装失败: ' + err.message + '\n\n执行完毕。\n';
    showToast('安装失败: ' + err.message, 'error');
    installBtn.disabled = false;
    cancelBtn.disabled = true;
    document.body.style.cursor = 'default';
  }
}

async function cancelInstallComponents() {
  if (!currentInstallTaskId) {
    document.getElementById('installComponentsModal').classList.remove('active');
    return;
  }
  
  const confirmed = await showConfirmModal({
    title: '取消安装组件',
    message: '组件正在安装中，确定要取消吗？',
    detail: '取消后当前安装进度将丢失，且可能触发未知异常问题',
    confirmText: '确认取消',
    cancelText: '继续安装',
    confirmClass: 'btn-danger'
  });
  
  if (confirmed) {
    try {
      const confirmToken = await generateConfirmToken(currentContainerId);
      await ipcCall('cancel-install', { 
        containerId: currentContainerId,
        confirmToken: confirmToken
      });
      document.getElementById('installLog').value += '\n用户已取消安装\n\n执行完毕。\n';
      showToast('安装已取消', 'warning');
    } catch (err) {
      console.error('Failed to cancel install:', err);
      document.getElementById('installLog').value += '\n取消失败: ' + err.message + '\n\n执行完毕。\n';
    }
    currentInstallTaskId = null;
    document.body.style.cursor = 'default';
    document.getElementById('installComponentsModal').classList.remove('active');
  }
}

function showAppContextMenu(event, appId, containerId) {
  event.preventDefault();
  currentAppId = appId;
  if (containerId) {
    currentContainerId = containerId;
  }
  
  const appItem = event.target.closest('.app-item, .app-card');
  if (appItem) {
    const appName = appItem.dataset.appName || appItem.querySelector('.app-name, .app-card-name')?.textContent || '';
    const exePath = appItem.dataset.exePath || '';
    const tempApp = { id: appId, name: appName, exe_path: exePath };
    if (!apps.find(a => String(a.id) === String(appId))) {
      apps.push(tempApp);
    } else {
      const existingApp = apps.find(a => String(a.id) === String(appId));
      if (existingApp) {
        if (!existingApp.name) existingApp.name = appName;
        if (!existingApp.exe_path) existingApp.exe_path = exePath;
      }
    }
  }
  
  const x = event.clientX;
  const y = event.clientY;
  
  if (window.electronAPI?.showAppContextMenu) {
    window.electronAPI.showAppContextMenu({
      x: x,
      y: y,
      appId: appId,
      containerId: containerId || currentContainerId
    });
  } else {
    let menu = document.getElementById('appContextMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'appContextMenu';
      menu.className = 'app-context-menu';
      document.body.appendChild(menu);
    }
    menu.innerHTML = `
      <div class="context-menu-item" onclick="openAppSettingsFromContextMenu()">设置</div>
      <div class="context-menu-item" onclick="openAppPathFromContextMenu()">打开应用路径</div>
      <div class="context-menu-item" onclick="createAppDesktopShortcutFromContextMenu()">创建桌面图标</div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item context-menu-danger" onclick="deleteAppFromContextMenu()">删除</div>
    `;
    
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.add('active');
    
    document.addEventListener('click', closeAppContextMenu, { once: true });
  }
}

function closeAppContextMenu() {
  const menu = document.getElementById('appContextMenu');
  if (menu) {
    menu.classList.remove('active');
  }
}

function openAppSettingsFromContextMenu(appId, containerId) {
  if (appId !== undefined && appId !== null && appId !== '') currentAppId = appId;
  if (containerId !== undefined && containerId !== null && containerId !== '') currentContainerId = containerId;
  closeAppContextMenu();
  showAppSettingsModal();
}

function openAppPathFromContextMenu(appId, containerId) {
  if (appId !== undefined && appId !== null && appId !== '') currentAppId = appId;
  if (containerId !== undefined && containerId !== null && containerId !== '') currentContainerId = containerId;
  closeAppContextMenu();
  if (!currentAppId) {
    showToast('应用ID无效', 'error');
    return;
  }
  dserverCall('app.openPath', { appId: parseInt(currentAppId) }).then(() => {
    showToast('打开应用路径成功', 'success');
  }).catch(err => {
    console.error('Failed to open app path:', err);
    showToast('打开应用路径失败', 'error');
  });
}

function createAppDesktopShortcutFromContextMenu(appId, containerId) {
  if (appId !== undefined && appId !== null && appId !== '') currentAppId = appId;
  if (containerId !== undefined && containerId !== null && containerId !== '') currentContainerId = containerId;
  closeAppContextMenu();
  if (!currentAppId || !currentContainerId) {
    showToast('应用ID或容器ID无效', 'error');
    return;
  }
  dserverCall('shortcut.createDesktop', {
    containerId: currentContainerId,
    appId: currentAppId
  }).then(() => {
    showToast('桌面图标创建成功', 'success');
  }).catch(err => {
    console.error('Failed to create desktop shortcut:', err);
    showToast('桌面图标创建失败', 'error');
  });
}

async function deleteAppFromContextMenu(appId, containerId) {
  if (appId !== undefined && appId !== null && appId !== '') currentAppId = appId;
  if (containerId !== undefined && containerId !== null && containerId !== '') currentContainerId = containerId;
  closeAppContextMenu();
  if (!currentAppId) {
    showToast('应用ID无效', 'error');
    return;
  }
  
  let app = apps.find(a => String(a.id) === String(currentAppId));
  if (!app) {
    try {
      const result = await dserverCall('app.list', { containerId: currentContainerId });
      if (result && Array.isArray(result)) {
        app = result.find(a => String(a.id) === String(currentAppId));
      }
    } catch (err) {
      console.error('Failed to fetch app info:', err);
    }
  }
  
  if (!app) {
    showToast(t('message.appInfoNotFound'), 'error');
    return;
  }
  
  const appName = app.name || app.alias_name;
  const hasUninstallCmd = app.uninstall_cmd && app.uninstall_cmd.trim() !== '';
  const appType = app.app_type || 1;
  
  let confirmMessage = t('appDelete.confirmDelete', { name: appName });
  let confirmDetail = t('appDelete.detailDelete');
  
  if (hasUninstallCmd) {
    confirmMessage = t('appDelete.confirmUninstall', { name: appName });
    confirmDetail = t('appDelete.detailUninstall');
  }
  
  showConfirmModal({
    title: hasUninstallCmd ? t('appDelete.titleUninstall') : t('appDelete.titleDelete'),
    message: confirmMessage,
    detail: confirmDetail,
    confirmText: hasUninstallCmd ? t('appDelete.confirmUninstallText') : t('appDelete.confirmDeleteText'),
    cancelText: t('common.cancel'),
    confirmClass: 'btn-danger'
  }).then(async (confirmed) => {
    if (confirmed) {
      try {
        const targetContainerId = currentContainerId;
        
        if (hasUninstallCmd) {
          if (uninstallingContainers.has(targetContainerId)) {
            showToast(t('message.uninstallingApp'), 'info');
            return;
          }
          uninstallingContainers.set(targetContainerId, new Set());
          showToast(t('message.uninstallingAppNow'), 'info');
          
          let completedListener = null;
          let failedListener = null;
          let resultTaskId = null;
          
          const cleanup = () => {
            uninstallingContainers.delete(targetContainerId);
            if (completedListener) {
              try { completedListener(); } catch(e) {}
              completedListener = null;
            }
            if (failedListener) {
              try { failedListener(); } catch(e) {}
              failedListener = null;
            }
          };
          
          await new Promise((resolve) => {
            completedListener = window.electronAPI.receive('event:task.completed', (data) => {
              let taskData = data;
              if (Array.isArray(data) && data.length > 0) {
                taskData = data[0];
              }
              if (taskData && taskData.task_id === resultTaskId && taskData.container_id === targetContainerId) {
                cleanup();
                showToast('应用卸载成功', 'success');
                resolve();
              }
            });
            
            failedListener = window.electronAPI.receive('event:task.failed', (data) => {
              let taskData = data;
              if (Array.isArray(data) && data.length > 0) {
                taskData = data[0];
              }
              if (taskData && taskData.task_id === resultTaskId && taskData.container_id === targetContainerId) {
                cleanup();
                showToast('应用卸载失败', 'error');
                resolve();
              }
            });
            
            dserverCall('app.uninstall', {
              containerId: targetContainerId,
              appId: currentAppId,
              uninstallCmd: app.uninstall_cmd
            }).then(result => {
              if (result && result.taskId) {
                resultTaskId = result.taskId;
                const containerTasks = uninstallingContainers.get(targetContainerId);
                if (containerTasks) {
                  containerTasks.add(result.taskId);
                }
              } else {
                cleanup();
                showToast(result && result.success !== false ? '应用卸载成功' : '应用卸载失败', result && result.success !== false ? 'success' : 'error');
                resolve();
              }
            }).catch(err => {
              cleanup();
              console.error('Failed to uninstall app:', err);
              showToast('应用卸载失败', 'error');
              resolve();
            });
          });
        } else {
          const result = await dserverCall('app.delete', {
            containerId: currentContainerId,
            appId: currentAppId
          });
          if (result && result.success !== false) {
            showToast('应用删除成功', 'success');
          } else {
            showToast('应用删除失败', 'error');
          }
        }
        
        try {
          if (typeof dserverCall === 'function') {
            await dserverCall('container.refresh', { containerId: targetContainerId || currentContainerId });
          }
        } catch(e) {
          console.warn('[deleteFromContextMenu] container.refresh failed:', e);
        }
        
        await loadApps(currentContainerId);
        await loadTotalAppCount();
        if (currentView === 'detail' && typeof renderContainerDetail === 'function' && currentContainerId) {
          try { renderContainerDetail(currentContainerId); } catch(e) {}
        } else {
          renderHome();
        }
        if (typeof updateTaskHeaderButton === 'function') {
          try { updateTaskHeaderButton(); } catch(e) {}
        }
      } catch (err) {
        console.error('Failed to delete/uninstall app:', err);
        showToast(hasUninstallCmd ? '应用卸载失败' : '应用删除失败', 'error');
      }
    }
  });
}

function showAppSettingsModal() {
  closeAppContextMenu();
  const app = allAppsMap[currentAppId] || apps.find(a => String(a.id) === String(currentAppId));
  if (!app) {
    dserverCall('app.list', { containerId: currentContainerId }).then(result => {
      if (result && Array.isArray(result)) {
        const foundApp = result.find(a => String(a.id) === String(currentAppId));
        if (foundApp) {
          const iconSrc = getAppIconUrl(foundApp.icon_path);
          const appData = {
            ...foundApp,
            id: foundApp.id,
            icon: iconSrc,
            name: foundApp.alias_name || foundApp.name,
            version: foundApp.product_version || foundApp.version,
            size: foundApp.file_size_kb || foundApp.size || 0,
            dateModified: foundApp.date_modified || '',
            launchArguments: foundApp.launch_arguments || '',
            env: foundApp.env || '',
            kernelArgs: foundApp.kernel_args || ''
          };
          allAppsMap[foundApp.id] = appData;
          document.getElementById('appSettingsName').value = appData.name || '';
          document.getElementById('appSettingsPath').value = appData.exe_path || appData.path || '';
          document.getElementById('appSettingsArgs').value = appData.launchArguments || '';
          document.getElementById('appSettingsEnv').value = appData.env || '';
          document.getElementById('appSettingsKernel').value = appData.kernelArgs || '';
          document.getElementById('appSettingsModal').classList.add('active');
          addModalKeyHandler('appSettingsModal', saveAppSettings, closeAppSettingsModal);
        } else {
          showToast('应用不存在', 'error');
        }
      }
    }).catch(err => {
      console.error('Failed to load app info:', err);
      showToast('加载应用信息失败', 'error');
    });
    return;
  }
  
  document.getElementById('appSettingsName').value = app.name || '';
  document.getElementById('appSettingsPath').value = app.exe_path || app.path || '';
  document.getElementById('appSettingsArgs').value = app.launchArguments || app.args || '';
  document.getElementById('appSettingsEnv').value = app.env || '';
  document.getElementById('appSettingsKernel').value = app.kernelArgs || '';
  
  document.getElementById('appSettingsModal').classList.add('active');
  
  addModalKeyHandler('appSettingsModal', saveAppSettings, closeAppSettingsModal);
}

function closeAppSettingsModal() {
  document.getElementById('appSettingsModal').classList.remove('active');
}

function saveAppSettings() {
  let name = document.getElementById('appSettingsName').value;
  let args = document.getElementById('appSettingsArgs').value;
  let env = document.getElementById('appSettingsEnv').value;
  let kernelArgs = document.getElementById('appSettingsKernel').value;
  
  name = sanitizeInput(name);
  args = sanitizeInput(args);
  env = sanitizeInput(env);
  kernelArgs = sanitizeInput(kernelArgs);
  
  if (!name) {
    showToast('应用名称不能为空', 'error');
    return;
  }
  
  dserverCall('app.update', {
    appId: currentAppId,
    aliasName: name,
    launchArguments: args,
    env: env,
    kernelArgs: kernelArgs
  }).then(() => {
    showToast('应用设置保存成功', 'success');
    closeAppSettingsModal();
    loadApps();
    loadTotalAppCount().then(renderHome);
  }).catch(err => {
    console.error('Failed to update app:', err);
    const errMsg = err.message || err.error_message || err;
    if (errMsg && (errMsg.includes('已存在') || errMsg === '应用名称已存在')) {
      showToast('应用名称已存在，请使用其他名称', 'error');
    } else {
      showToast('应用设置保存失败', 'error');
    }
  });
}

function showAddShortcutModal(containerId) {
  closeAppContextMenu();
  if (containerId) {
    currentContainerId = containerId;
  }
  const app = apps.find(a => a.id === currentAppId);
  
  document.getElementById('shortcutName').value = app ? (app.name || '') : '';
  document.getElementById('shortcutPath').value = app ? (app.path || '') : '';
  document.getElementById('shortcutArgs').value = app ? (app.args || '') : '';
  document.getElementById('shortcutEnv').value = app ? (app.env || '') : '';
  document.getElementById('shortcutKernel').value = app ? (app.kernelArgs || '') : '';
  document.getElementById('createDesktopIcon').checked = true;
  document.getElementById('saveShortcutBtn').disabled = false;
  
  document.getElementById('addShortcutModal').classList.add('active');
  
  addModalKeyHandler('addShortcutModal', saveShortcut, closeAddShortcutModal);
}

function closeAddShortcutModal() {
  document.getElementById('addShortcutModal').classList.remove('active');
}

function selectShortcutPath() {
  const container = containers.find(c => String(c.id) === String(currentContainerId));
  const containerPath = container?.wine_prefix_full_path || '';
  
  ipcCall('open-file-dialog', {
    title: '选择快捷方式路径',
    properties: ['openFile'],
    filters: [
      { name: '可执行文件', extensions: ['exe', 'bat', 'cmd', 'sh'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  }).then(result => {
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];
      
      if (containerPath && !selectedPath.startsWith(containerPath)) {
        showToast('只能选择当前工作区中的文件', 'warning');
        return;
      }
      
      document.getElementById('shortcutPath').value = selectedPath;
    }
  });
}

function saveShortcut() {
  let name = document.getElementById('shortcutName').value;
  let path = document.getElementById('shortcutPath').value;
  let args = document.getElementById('shortcutArgs').value;
  let env = document.getElementById('shortcutEnv').value;
  let kernelArgs = document.getElementById('shortcutKernel').value;
  let createDesktopIcon = document.getElementById('createDesktopIcon').checked;
  
  name = sanitizeInput(name);
  args = sanitizeInput(args);
  env = sanitizeInput(env);
  kernelArgs = sanitizeInput(kernelArgs);
  
  if (!name || !path) {
    showToast('应用名称和路径不能为空', 'warning');
    return;
  }
  
  const currentContainer = containers.find(c => String(c.id) === String(currentContainerId));
  const currentContainerPath = currentContainer?.wine_prefix_full_path || '';
  if (currentContainerPath && !path.startsWith(currentContainerPath)) {
    showToast(`只能选择当前工作区 "${currentContainer?.alias_name || currentContainer?.name || ''}" 中的文件`, 'warning');
    return;
  }
  
  showModalLoading('addShortcutLoading');
  document.getElementById('saveShortcutBtn').disabled = true;
  
  dserverCall('app.create', {
    containerId: currentContainerId,
    name,
    path,
    args,
    env,
    kernelArgs,
    createDesktopIcon
  }).then(async (result) => {
    if (result && result.appExists) {
      hideModalLoading('addShortcutLoading');
      document.getElementById('saveShortcutBtn').disabled = false;
      
      const existingApp = result.existingApp || {};
      const existingName = existingApp.name || existingApp.alias_name || '该应用';
      
      const confirmed = await showConfirmModal({
        title: '应用已存在',
        message: `${existingName} 已经安装，确认是否重复添加？`,
        detail: `重复添加将创建一个新的快捷方式，名称为：${name}`,
        icon: 'warning',
        confirmText: '确认添加',
        cancelText: '取消'
      });
      
      if (confirmed) {
        showModalLoading('addShortcutLoading');
        document.getElementById('saveShortcutBtn').disabled = true;
        
        try {
          const forceResult = await dserverCall('app.create', {
            containerId: currentContainerId,
            name,
            path,
            args,
            env,
            kernelArgs,
            createDesktopIcon,
            forceAdd: true
          });
          if (forceResult && forceResult.taskId) {
            const createTaskShortcutListeners = (taskId) => {
              let progressUnsubscribe = null;
              let completedUnsubscribe = null;
              let failedUnsubscribe = null;
              
              const cleanupListeners = () => {
                if (progressUnsubscribe) progressUnsubscribe();
                if (completedUnsubscribe) completedUnsubscribe();
                if (failedUnsubscribe) failedUnsubscribe();
              };
              
              taskManager.createTask({
                id: taskId,
                type: 'app_create',
                status: 'running',
                progress: 0,
                container_id: currentContainerId,
                payload: { appPath: path, containerId: currentContainerId },
                recovery_mode: 'ui'
              });
              
              progressUnsubscribe = window.electronAPI.receive('event:task.progress', (data) => {
                let taskData = data;
                if (Array.isArray(data) && data.length > 0) taskData = data[0];
                if (taskData && taskData.task_id === taskId && taskData.message) {
                  document.getElementById('addShortcutLoading').title = taskData.message;
                }
              });
              
              completedUnsubscribe = window.electronAPI.receive('event:task.completed', (data) => {
                let taskData = data;
                if (Array.isArray(data) && data.length > 0) taskData = data[0];
                if (taskData && taskData.task_id === taskId) {
                  cleanupListeners();
                  hideModalLoading('addShortcutLoading');
                  closeAddShortcutModal();
                  loadApps();
                  loadTotalAppCount().then(renderHome);
                  showToast('快捷方式添加成功', 'success');
                }
              });
              
              failedUnsubscribe = window.electronAPI.receive('event:task.failed', (data) => {
                let taskData = data;
                if (Array.isArray(data) && data.length > 0) taskData = data[0];
                if (taskData && taskData.task_id === taskId) {
                  cleanupListeners();
                  hideModalLoading('addShortcutLoading');
                  document.getElementById('saveShortcutBtn').disabled = false;
                  
                  let errorMsg = '快捷方式添加失败';
                  let resultObj = null;
                  
                  if (taskData.result) {
                    try {
                      resultObj = typeof taskData.result === 'string' ? JSON.parse(taskData.result) : taskData.result;
                    } catch (e) {}
                  }
                  
                  if (resultObj && resultObj.message) {
                    errorMsg = resultObj.message;
                  } else if (taskData.message) {
                    errorMsg = taskData.message;
                  }
                  
                  showToast(errorMsg, 'error');
                }
              });
            };
            createTaskShortcutListeners(forceResult.taskId);
          } else {
            hideModalLoading('addShortcutLoading');
            document.getElementById('saveShortcutBtn').disabled = false;
            showToast('快捷方式添加失败', 'error');
          }
        } catch (err) {
          hideModalLoading('addShortcutLoading');
          document.getElementById('saveShortcutBtn').disabled = false;
          showToast('快捷方式添加失败: ' + (err.message || err), 'error');
        }
      }
      return;
    }
    
    if (!result || !result.taskId) {
      hideModalLoading('addShortcutLoading');
      document.getElementById('saveShortcutBtn').disabled = false;
      showToast('快捷方式添加失败', 'error');
      return;
    }
    
    const taskId = result.taskId;
    
    taskManager.createTask({
      id: taskId,
      type: 'app_create',
      status: 'running',
      progress: 0,
      container_id: currentContainerId,
      payload: { appPath: path, containerId: currentContainerId },
      recovery_mode: 'ui'
    });
    
    let progressUnsubscribe = null;
    let completedUnsubscribe = null;
    let failedUnsubscribe = null;
    
    const cleanupListeners = () => {
      if (progressUnsubscribe) progressUnsubscribe();
      if (completedUnsubscribe) completedUnsubscribe();
      if (failedUnsubscribe) failedUnsubscribe();
    };
    
    progressUnsubscribe = window.electronAPI.receive('event:task.progress', (data) => {
      let taskData = data;
      if (Array.isArray(data) && data.length > 0) {
        taskData = data[0];
      }
      if (taskData && taskData.task_id === taskId) {
        if (taskData.message) {
          document.getElementById('addShortcutLoading').title = taskData.message;
        }
      }
    });
    
    completedUnsubscribe = window.electronAPI.receive('event:task.completed', (data) => {
      let taskData = data;
      if (Array.isArray(data) && data.length > 0) {
        taskData = data[0];
      }
      if (taskData && taskData.task_id === taskId) {
        cleanupListeners();
        hideModalLoading('addShortcutLoading');
        closeAddShortcutModal();
        loadApps();
        loadTotalAppCount().then(renderHome);
        showToast('快捷方式添加成功', 'success');
      }
    });
    
    failedUnsubscribe = window.electronAPI.receive('event:task.failed', (data) => {
      let taskData = data;
      if (Array.isArray(data) && data.length > 0) {
        taskData = data[0];
      }
      if (taskData && taskData.task_id === taskId) {
        cleanupListeners();
        hideModalLoading('addShortcutLoading');
        document.getElementById('saveShortcutBtn').disabled = false;
        
        let errorMsg = '快捷方式添加失败';
        let resultObj = null;
        
        if (taskData.result) {
          try {
            resultObj = typeof taskData.result === 'string' ? JSON.parse(taskData.result) : taskData.result;
          } catch (e) {}
        }
        
        if (resultObj && resultObj.appExists) {
          const existingApp = resultObj.existingApp || {};
          const existingName = existingApp.name || '该应用';
          
          showConfirmModal({
            title: '应用已存在',
            message: `${existingName} 已经安装，确认是否重复添加？`,
            detail: `重复添加将创建一个新的快捷方式，名称为：${name}`,
            icon: 'warning',
            confirmText: '确认添加',
            cancelText: '取消'
          }).then(async (confirmed) => {
            if (confirmed) {
              showModalLoading('addShortcutLoading');
              document.getElementById('saveShortcutBtn').disabled = true;
              
              try {
                const forceResult = await dserverCall('app.create', {
                  containerId: currentContainerId,
                  name,
                  path,
                  args,
                  env,
                  kernelArgs,
                  createDesktopIcon,
                  forceAdd: true
                });
                
                if (forceResult && forceResult.taskId) {
                  const newTaskId = forceResult.taskId;
                  
                  taskManager.createTask({
                    id: newTaskId,
                    type: 'app_create',
                    status: 'running',
                    progress: 0,
                    container_id: currentContainerId,
                    payload: { appPath: path, containerId: currentContainerId },
                    recovery_mode: 'ui'
                  });
                  
                  let forceProgressUnsubscribe = null;
                  let forceCompletedUnsubscribe = null;
                  let forceFailedUnsubscribe = null;
                  
                  const forceCleanupListeners = () => {
                    if (forceProgressUnsubscribe) forceProgressUnsubscribe();
                    if (forceCompletedUnsubscribe) forceCompletedUnsubscribe();
                    if (forceFailedUnsubscribe) forceFailedUnsubscribe();
                  };
                  
                  forceProgressUnsubscribe = window.electronAPI.receive('event:task.progress', (forceData) => {
                    let forceTaskData = forceData;
                    if (Array.isArray(forceData) && forceData.length > 0) {
                      forceTaskData = forceData[0];
                    }
                    if (forceTaskData && forceTaskData.task_id === newTaskId) {
                      if (forceTaskData.message) {
                        document.getElementById('addShortcutLoading').title = forceTaskData.message;
                      }
                    }
                  });
                  
                  forceCompletedUnsubscribe = window.electronAPI.receive('event:task.completed', (forceData) => {
                    let forceTaskData = forceData;
                    if (Array.isArray(forceData) && forceData.length > 0) {
                      forceTaskData = forceData[0];
                    }
                    if (forceTaskData && forceTaskData.task_id === newTaskId) {
                      forceCleanupListeners();
                      hideModalLoading('addShortcutLoading');
                      closeAddShortcutModal();
                      loadApps();
                      loadTotalAppCount().then(renderHome);
                      showToast('快捷方式添加成功', 'success');
                    }
                  });
                  
                  forceFailedUnsubscribe = window.electronAPI.receive('event:task.failed', (forceData) => {
                    let forceTaskData = forceData;
                    if (Array.isArray(forceData) && forceData.length > 0) {
                      forceTaskData = forceData[0];
                    }
                    if (forceTaskData && forceTaskData.task_id === newTaskId) {
                      forceCleanupListeners();
                      hideModalLoading('addShortcutLoading');
                      document.getElementById('saveShortcutBtn').disabled = false;
                      
                      let forceErrorMsg = '快捷方式添加失败';
                      let forceResultObj = null;
                      
                      if (forceTaskData.result) {
                        try {
                          forceResultObj = typeof forceTaskData.result === 'string' ? JSON.parse(forceTaskData.result) : forceTaskData.result;
                        } catch (e) {}
                      }
                      
                      if (forceResultObj && forceResultObj.message) {
                        forceErrorMsg = forceResultObj.message;
                      } else if (forceTaskData.message) {
                        forceErrorMsg = forceTaskData.message;
                      }
                      
                      showToast(forceErrorMsg, 'error');
                    }
                  });
                } else {
                  hideModalLoading('addShortcutLoading');
                  document.getElementById('saveShortcutBtn').disabled = false;
                  showToast('快捷方式添加失败', 'error');
                }
              } catch (err) {
                console.error('Failed to force add shortcut:', err);
                hideModalLoading('addShortcutLoading');
                document.getElementById('saveShortcutBtn').disabled = false;
                showToast('快捷方式添加失败: ' + (err.message || err), 'error');
              }
            }
          });
          return;
        }
        
        if (resultObj && resultObj.error_key) {
          const keyParts = resultObj.error_key.split('.');
          if (keyParts.length >= 3 && keyParts[0] === 'app' && keyParts[1] === 'create') {
            const errorType = keyParts[2];
            const errorKey = keyParts.slice(3).join('.');
            if (errorType === 'error' && errorKey) {
              errorMsg = t(`errors.appCreate.${errorKey}`) || resultObj.message || errorMsg;
            } else if (errorType.startsWith('error.')) {
              const oldErrorKey = errorType.substring(6);
              errorMsg = t(`errors.appCreate.${oldErrorKey}`) || resultObj.message || errorMsg;
            } else if (resultObj.message) {
              errorMsg = resultObj.message;
            }
          } else if (resultObj.message) {
            errorMsg = resultObj.message;
          }
        } else if (resultObj && resultObj.message) {
          errorMsg = resultObj.message;
        } else if (taskData.error_message) {
          errorMsg = taskData.error_message;
        } else if (taskData.message_key) {
          errorMsg = t(taskData.message_key) || taskData.message || errorMsg;
        } else if (taskData.message) {
          errorMsg = taskData.message;
        }
        
        showToast(errorMsg, 'error');
      }
    });
  }).catch(err => {
    console.error('Failed to add shortcut:', err);
    hideModalLoading('addShortcutLoading');
    document.getElementById('saveShortcutBtn').disabled = false;
    showToast('快捷方式添加失败: ' + (err.message || err), 'error');
  });
}

function uninstallSingleApp() {
  const targetContainerId = currentContainerId;
  
  if (uninstallingContainers.has(targetContainerId)) {
    showToast('应用卸载中，请稍等...', 'info');
    return;
  }
  
  closeAppContextMenu();
  
  const app = apps.find(a => a.id === currentAppId);
  if (!app) return;
  
  if (confirm(`确定要卸载应用 "${app.name}" 吗？`)) {
    uninstallingContainers.set(targetContainerId, new Set());
    showToast('正在卸载应用...', 'info');
    
    let completedListener = null;
    let failedListener = null;
    let resultTaskId = null;
    
    const cleanup = () => {
      uninstallingContainers.delete(targetContainerId);
      if (completedListener) {
        try { completedListener(); } catch(e) {}
        completedListener = null;
      }
      if (failedListener) {
        try { failedListener(); } catch(e) {}
        failedListener = null;
      }
    };
    
    completedListener = window.electronAPI.receive('event:task.completed', (data) => {
      let taskData = data;
      if (Array.isArray(data) && data.length > 0) {
        taskData = data[0];
      }
      if (taskData && taskData.task_id === resultTaskId && taskData.container_id === targetContainerId) {
        cleanup();
        showToast('应用卸载成功', 'success');
        loadApps();
      }
    });
    
    failedListener = window.electronAPI.receive('event:task.failed', (data) => {
      let taskData = data;
      if (Array.isArray(data) && data.length > 0) {
        taskData = data[0];
      }
      if (taskData && taskData.task_id === resultTaskId && taskData.container_id === targetContainerId) {
        cleanup();
        console.error('Uninstall task failed:', taskData.error_message);
        showToast('应用卸载失败', 'error');
      }
    });
    
    dserverCall('app.uninstall', { containerId: targetContainerId, appId: currentAppId }).then(result => {
      if (result && result.taskId) {
        resultTaskId = result.taskId;
        const containerTasks = uninstallingContainers.get(targetContainerId);
        if (containerTasks) {
          containerTasks.add(result.taskId);
        }
      } else {
        cleanup();
        loadApps();
      }
    }).catch(err => {
      cleanup();
      console.error('Failed to uninstall app:', err);
      showToast('应用卸载失败', 'error');
    });
  }
}

function createLoadingOverlay() {
  let overlay = document.getElementById('startup-loading');
  if (overlay) return overlay;
  
  overlay = document.createElement('div');
  overlay.id = 'startup-loading';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 99999;
    background-color: var(--bg-color);
  `;
  
  overlay.innerHTML = `
    <div style="width: 60px; height: 60px; border: 4px solid rgba(52, 152, 219, 0.3); border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
    <p style="margin: 20px 0 0; font-size: 18px; color: var(--text-color); font-weight: 500;">正在启动栈行平台...</p>
    <p id="startup-status" style="margin: 10px 0 0; font-size: 14px; color: var(--text-secondary);">连接服务中...</p>
  `;
  
  document.body.appendChild(overlay);
  return overlay;
}

function showConnectionError() {
  const overlay = document.getElementById('startup-loading');
  if (!overlay) return;
  
  overlay.innerHTML = `
    <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(255, 77, 79, 0.2); display: flex; justify-content: center; align-items: center; margin-bottom: 16px;">
      <svg viewBox="0 0 24 24" style="width: 32px; height: 32px; fill: #ff4d4f;">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
    </div>
    <div style="color: #ffffff; font-size: 18px; font-weight: 600; margin-bottom: 8px;">连接失败</div>
    <div style="color: rgba(255, 255, 255, 0.6); font-size: 14px; margin-bottom: 24px;">无法连接到 StackRun 后端服务</div>
    <div style="display: flex; gap: 12px;">
      <button onclick="retryConnection()" style="padding: 10px 24px; border: none; border-radius: 4px; font-size: 14px; font-weight: 500; cursor: pointer; background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3);">重试</button>
      <button onclick="closeApp()" style="padding: 10px 24px; border: none; border-radius: 4px; font-size: 14px; font-weight: 500; cursor: pointer; background: rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.8); border: 1px solid rgba(255, 255, 255, 0.2);">关闭</button>
    </div>
  `;
}

function hideLoadingOverlay() {
  const startupLoading = document.getElementById('startup-loading');
  if (startupLoading) {
    startupLoading.style.pointerEvents = 'none';
    startupLoading.style.opacity = '0';
    startupLoading.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      try {
        if (startupLoading && startupLoading.parentNode) {
          startupLoading.parentNode.removeChild(startupLoading);
        }
      } catch (e) {
        console.error('Failed to remove startup-loading:', e);
      }
    }, 350);
  }
  
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.style.pointerEvents = 'none';
    loadingOverlay.style.opacity = '0';
    loadingOverlay.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      try {
        if (loadingOverlay && loadingOverlay.parentNode) {
          loadingOverlay.parentNode.removeChild(loadingOverlay);
        }
      } catch (e) {
        console.error('Failed to remove loadingOverlay:', e);
      }
    }, 350);
  }
}

function retryConnection() {
  createLoadingOverlay();
  if (window.electronAPI) {
    window.electronAPI.send('splash:retry');
  }
}

function closeApp() {
  if (window.electronAPI) {
    window.electronAPI.send('splash:close');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const theme = getTheme();
  setTheme(theme);
  createLoadingOverlay();
  init();
  
  console.log('[DIAGNOSTIC] DOMContentLoaded completed, waiting for dserver:connected');
  
  setTimeout(() => {
    if (!_containersLoaded) {
      console.log('[DIAGNOSTIC] TIMEOUT: dserver:connected event not received, forcing load');
      if (electronAPI.send) {
        electronAPI.send('renderer-log', '[DIAGNOSTIC] TIMEOUT: forcing loadContainers');
      }
      hideLoadingOverlay();
      loadContainers();
    }
  }, 15000);
});

console.log('[DIAGNOSTIC] electronAPI available:', !!window.electronAPI);
console.log('[DIAGNOSTIC] electronAPI.receive available:', !!window.electronAPI?.receive);

if (window.electronAPI && window.electronAPI.receive) {
  console.log('[DIAGNOSTIC] Registering event listeners');
  
  window.electronAPI.receive('startup:status', (data) => {
    console.log('[Renderer] Startup status:', data);
    const statusEl = document.getElementById('startup-status');
    if (statusEl) {
      statusEl.textContent = data.message;
    }
  });
  
  window.electronAPI.receive('dserver:connected', () => {
    console.log('[Renderer] DServer connected event RECEIVED');
    hideLoadingOverlay();
    
    console.log('[Renderer] Loading containers after dserver connected');
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('renderer-log', '[Renderer] Loading containers after dserver connected');
    }
    loadContainers();
  });
  
  window.electronAPI.receive('dserver:connection-failed', (data) => {
    console.error('[Renderer] DServer connection failed:', data);
    showConnectionError();
  });
  
  window.electronAPI.receive('dserver:quit-app', (data) => {
    const reason = (data && data.reason) || 'upgrade';
    const message = reason === 'uninstall' 
      ? '正在卸载程序，即将退出...' 
      : '正在升级程序，即将退出...';
    console.log('[Renderer] Received quit request from DServer, reason:', reason);
    
    const existingOverlay = document.getElementById('quit-overlay');
    if (!existingOverlay) {
      const overlay = document.createElement('div');
      overlay.id = 'quit-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;color:#fff;font-size:18px;font-family:sans-serif;';
      overlay.textContent = message;
      document.body.appendChild(overlay);
    }
    
    setTimeout(() => {
      if (window.electronAPI) {
        window.electronAPI.send('exit-app');
      }
    }, 500);
  });
  
  window.electronAPI.receive('dserver:progress', (data) => {
    const eventData = {
      taskId: data.task_id || data.taskId,
      progress: data.progress || 0,
      message: data.message || '',
      status: data.status || data.stage || ''
    };
    if (window.stackrun && window.stackrun.emit) {
      window.stackrun.emit('task-progress', eventData);
    }
  });
  
  window.electronAPI.receive('menu-action', (action) => {
    console.log('[Renderer] Received menu-action:', action);
    switch (action.action) {
      case 'create-container':
        showCreateContainerModal();
        break;
      case 'import-container':
        showImportContainerModal();
        break;
      case 'container-trash':
        showContainerTrashModal();
        break;
      case 'close-all-apps':
        showCloseAllAppsModal();
        break;
      case 'import-font':
        showImportFontModal();
        break;
      case 'settings':
        showSettingsModal();
        break;
      case 'help':
        showHelpModal();
        break;
      case 'about':
        showAboutModal();
        break;
      default:
        console.warn('Unknown menu action:', action.action);
    }
  });
}

// 设置模态框
function closeSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => {
      modal.remove();
    }, 300);
  }
}

function showSettingsModal() {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'settingsModal';
  const currentTheme = getTheme();
  modal.innerHTML = `
    <div class="modal-content" style="width: 400px;">
      <div class="modal-header">
        <h3>${t('settings.settings')}</h3>
        <button class="modal-close-btn" onclick="closeSettingsModal()">&times;</button>
      </div>
      <div class="modal-body" style="padding: 20px;">
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 10px; font-weight: 500;">${t('settings.language')}</label>
          <select id="languageSelect" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; background: var(--card-bg); color: var(--text-color); font-size: 14px;">
            <option value="zh-CN" ${getLanguage() === 'zh-CN' ? 'selected' : ''}>${t('settings.chinese')}</option>
            <option value="en-US" ${getLanguage() === 'en-US' ? 'selected' : ''}>${t('settings.english')}</option>
          </select>
        </div>
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 10px; font-weight: 500;">${t('settings.theme')}</label>
          <select id="themeSelect" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; background: var(--card-bg); color: var(--text-color); font-size: 14px;">
            <option value="light" ${currentTheme === 'light' ? 'selected' : ''}>${t('settings.light')}</option>
            <option value="dark" ${currentTheme === 'dark' ? 'selected' : ''}>${t('settings.dark')}</option>
            <option value="system" ${currentTheme === 'system' ? 'selected' : ''}>${t('settings.system')}</option>
          </select>
        </div>
      </div>
      <div class="modal-footer" style="justify-content: flex-end;">
        <button class="btn btn-secondary" onclick="closeSettingsModal()">${t('dialog.cancel')}</button>
        <button class="btn btn-primary" onclick="saveSettings()">${t('dialog.confirm')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  addModalKeyHandler('settingsModal', saveSettings, closeSettingsModal);
}

function getTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) return saved;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'system';
  }
  return 'light';
}

function setTheme(theme) {
  localStorage.setItem('theme', theme);
  const html = document.documentElement;
  
  if (theme === 'dark') {
    html.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    html.setAttribute('data-theme', 'light');
  } else if (theme === 'system') {
    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }
}

function saveSettings() {
  const langSelect = document.getElementById('languageSelect');
  const themeSelect = document.getElementById('themeSelect');
  const newLang = langSelect.value;
  const newTheme = themeSelect.value;
  
  if (newLang && newLang !== getLanguage()) {
    setLanguage(newLang);
    syncMainLanguage(newLang);
    refreshUI();
    if (typeof updateEditionBadge === 'function') {
      updateEditionBadge();
    }
    if (typeof updateAuthHeaderImage === 'function') {
      updateAuthHeaderImage();
    }
    loadContainers();
    if (currentContainerId) {
      renderContainerDetail(currentContainerId);
    } else {
      renderHome();
    }
  }
  
  if (newTheme && newTheme !== getTheme()) {
    setTheme(newTheme);
  }
  
  closeSettingsModal();
}

function initTheme() {
  const theme = getTheme();
  setTheme(theme);
  
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
      const current = getTheme();
      if (current === 'system') {
        setTheme('system');
      }
    });
  }
}

window.saveSettings = saveSettings;
window.closeSettingsModal = closeSettingsModal;
window.getTheme = getTheme;
window.setTheme = setTheme;

async function showHelpModal() {
  try {
    const result = await dserverCall('system.getHelpDocPath', {});
    if (result && result.path) {
      const pdfPath = result.path;
      const exists = result.exists === 1 || result.exists === true;
      
      if (exists) {
        const openResult = await window.electronAPI.openPath(pdfPath);
        if (!openResult.success) {
          alert('打开帮助文档失败: ' + (openResult.error || '未知错误'));
        }
      } else {
        alert('帮助文档不存在: ' + pdfPath);
      }
    } else {
      alert('获取帮助文档路径失败');
    }
  } catch (error) {
    console.error('Error opening help document:', error);
    alert('打开帮助文档失败: ' + error.message);
  }
}

// 关于模态框
async function showAboutModal() {
  const modal = document.getElementById('aboutModal');
  modal.classList.add('active');
  
  addModalKeyHandler('aboutModal', null, closeAboutModal);
  
  try {
    const result = await dserverCall('system.version', {});
    if (result) {
      if (result.version) {
        document.getElementById('aboutVersionText').textContent = t('message.aboutVersion', { version: result.version });
      }
      if (result.arch) {
        const archMap = {
          'X86_64': 'x86_64',
          'x86_64': 'x86_64',
          'AMD64': 'x86_64',
          'ARM64': 'arm64',
          'arm64': 'arm64',
          'AARCH64': 'arm64',
          'aarch64': 'arm64',
          'MIPS64': 'mips64',
          'mips64': 'mips64',
          'LOONGARCH64': 'loongarch64',
          'loongarch64': 'loongarch64'
        };
        const displayArch = archMap[result.arch] || result.arch;
        document.getElementById('aboutArchText').textContent = t('message.aboutArch', { arch: displayArch });
        document.getElementById('aboutArchText').style.display = 'block';
      }
    }
  } catch (error) {
    console.error('[showAboutModal] Error:', error);
  }
}

function closeAboutModal() {
  const modal = document.getElementById('aboutModal');
  modal.classList.remove('active');
}

async function openUserAgreement() {
  try {
    const content = await window.electronAPI.readFile('assets/html/user-agreement.html');
    if (content) {
      showAgreementModal(content, '用户协议');
    } else {
      alert('无法读取用户协议文件');
    }
  } catch (error) {
    console.error('Error opening user agreement:', error);
    alert('打开用户协议失败: ' + error.message);
  }
}

async function openPrivacyPolicy() {
  try {
    const content = await window.electronAPI.readFile('assets/html/privacy-policy.html');
    if (content) {
      showAgreementModal(content, '隐私政策');
    } else {
      alert('无法读取隐私政策文件');
    }
  } catch (error) {
    console.error('Error opening privacy policy:', error);
    alert('打开隐私政策失败: ' + error.message);
  }
}

function showAgreementModal(htmlContent, title) {
  let modal = document.getElementById('agreementModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'agreementModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" style="width: 700px; height: 500px;">
        <div class="modal-header">
          <h3 id="agreementTitle">${title}</h3>
          <button class="modal-close-btn" onclick="closeAgreementModal()">&times;</button>
        </div>
        <div class="modal-body" style="overflow-y: auto; padding: 20px;">
          <div id="agreementContent"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  document.getElementById('agreementTitle').textContent = title;
  document.getElementById('agreementContent').innerHTML = htmlContent;
  modal.classList.add('active');
  
  addModalKeyHandler('agreementModal', null, closeAgreementModal);
}

function closeAgreementModal() {
  const modal = document.getElementById('agreementModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

async function checkServerInitTask() {
  try {
    const result = await dserverCall('task.list', { type: 'container_create', status: 'running' });
    if (result && result.success && result.data) {
      const tasks = Array.isArray(result.data) ? result.data : [];
      const initTask = tasks.find(t => t.type === 'container_create' && t.status === 'running');
      if (initTask) {
        return { exists: true, task: initTask };
      }
    }
    return { exists: false };
  } catch (error) {
    console.error('[checkServerInitTask] Error:', error);
    return { exists: false, error: error.message };
  }
}

stackrun.receive && stackrun.receive('task-output', (data) => {
  const logContent = document.getElementById('logContent');
  if (logContent) {
    logContent.textContent += data.data + '\n';
    logContent.scrollTop = logContent.scrollHeight;
  }
  
  const installLog = document.getElementById('installLog');
  if (installLog) {
    installLog.value += data.data + '\n';
    installLog.scrollTop = installLog.scrollHeight;
  }
});

stackrun.receive && stackrun.receive('task-progress', (data) => {
  const progressBarFill = document.getElementById('progressBarFill');
  const progressText = document.getElementById('progressText');

  if (progressBarFill && progressText) {
    progressBarFill.style.width = data.progress + '%';
    progressText.textContent = data.progress + '%';
  }

  const addAppProgressFill = document.getElementById('addAppProgressFill');
  const addAppProgressText = document.getElementById('addAppProgressText');

  if (addAppProgressFill && addAppProgressText) {
    addAppProgressFill.style.width = data.progress + '%';
    addAppProgressText.textContent = data.progress + '%';
  }
});

// 更多菜单关闭（原生菜单自动管理，此处预留接口）
function closeMoreMenu() {
  // Electron 原生 Menu.popup 菜单在点击外部时自动关闭
}

// ============================================================
// 授权激活相关函数
// ============================================================

// 授权状态对象
let currentAuthStatus = {
  isValid: false,
  edition: 'personal',
  expireDays: null,
  isExpired: false,
  deviceMatch: true
};

// 显示授权模态框
function showAuthModal() {
  const modal = document.getElementById('authModal');
  modal.classList.add('active');
  
  addModalKeyHandler('authModal', null, cancelAuth);
  
  // 加载设备信息
  loadDeviceInfo();
  
  // 更新授权状态显示
  updateAuthStatusDisplay();
}

// 加载设备信息（机器码）
async function loadDeviceInfo() {
  try {
    const result = await dserverCall('device.info', {});
    if (result && result.device_id) {
      document.getElementById('deviceCodeInput').value = result.device_id || '';
    } else {
      document.getElementById('deviceCodeInput').value = '未获取到设备信息';
    }
  } catch (error) {
    console.error('Error loading device info:', error);
    document.getElementById('deviceCodeInput').value = '获取设备信息失败';
  }
}

// 获取授权状态
async function getAuthStatus() {
  try {
    const result = await dserverCall('activation.status', {});
    
    if (!result || !result.is_valid) {
      currentAuthStatus = {
        isValid: false,
        edition: 'personal',
        expireDays: null,
        isExpired: false,
        deviceMatch: true
      };
      return currentAuthStatus;
    }
    
    currentAuthStatus = {
      isValid: result.is_valid,
      edition: result.edition || 'personal',
      expireDays: result.expire_days,
      isExpired: result.is_expired || false,
      deviceMatch: result.device_match || true
    };
    
    return currentAuthStatus;
  } catch (error) {
    console.error('Error getting auth status:', error);
    currentAuthStatus = {
      isValid: false,
      edition: 'personal',
      expireDays: null,
      isExpired: false,
      deviceMatch: true
    };
    return currentAuthStatus;
  }
}

// 更新授权状态显示
async function updateAuthStatusDisplay() {
  try {
    const status = await getAuthStatus();
    const statusValue = document.getElementById('authStatusValue');
    const expireSection = document.getElementById('authExpireSection');
    const expireValue = document.getElementById('authExpireValue');
    
    let statusText = t('edition.' + (status.edition || 'personal'));
    
    if (status.isExpired) {
      statusText += '-' + t('message.authExpired');
      statusValue.className = 'auth-status-value';
    } else {
      if (status.edition === 'personal') {
        statusValue.className = 'auth-status-value';
      } else {
        statusValue.className = 'auth-status-value valid';
      }
    }
    
    statusValue.textContent = statusText;
    
    if (status.edition !== 'personal' && status.expireDays !== null) {
      expireSection.style.display = 'flex';
      expireValue.textContent = status.expireDays + ' ' + t('message.authDays');
    } else {
      expireSection.style.display = 'none';
    }
  } catch (error) {
    console.error('Error updating auth status display:', error);
  }
}

// 更新标题栏授权图标
function updateAuthHeaderImage() {
  const authBtnImg = document.getElementById('authBtnImg');
  if (!authBtnImg) return;
  
  const status = currentAuthStatus;
  
  // 判断是否需要显示红色图标（未授权、个人版、过期）
  const showRed = !status.isValid || status.edition === 'personal' || status.isExpired;
  
  if (showRed) {
    authBtnImg.src = getAssetUrl('../../assets/images/headred.png');
    authBtnImg.title = t('message.authNotActivated');
  } else {
    authBtnImg.src = getAssetUrl('../../assets/images/headgreen.png');
    authBtnImg.title = t('message.authActivated');
  }
}

// 更新标题栏版本徽章
function updateEditionBadge() {
  const badge = document.getElementById('editionBadge');
  if (badge) {
    badge.textContent = t('edition.' + (currentAuthStatus.edition || 'personal'));
    badge.onclick = function() {
      showAboutModal();
    };
  }
}

// 关闭授权模态框
function cancelAuth() {
  const modal = document.getElementById('authModal');
  modal.classList.remove('active');
  
  // 清空授权文件输入框
  document.getElementById('licenseFileInput').value = '';
}

// 导出机器码
async function exportDeviceCode() {
  try {
    const result = await dserverCall('device.info', {});
    
    if (!result || !result.device_id) {
      alert('未获取到设备信息');
      return;
    }
    
    const saveResult = await ipcCall('save-file-dialog', {
      title: '保存机器码',
      defaultPath: `${result.device_id}`,
      filters: [
        { name: '机器码文件', extensions: ['srkey'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    
    if (saveResult && saveResult.filePath) {
      let filePath = saveResult.filePath;
      
      if (filePath.length <= 6 || filePath.substring(filePath.length - 6) !== '.srkey') {
        filePath += '.srkey';
      }
      
      const fileExists = await window.electronAPI.fileExists(filePath);
      if (fileExists) {
        const confirmed = await showConfirmModal({
          title: '文件已存在',
          message: '该路径下已存在同名文件，是否覆盖？',
          detail: filePath,
          confirmText: '覆盖',
          cancelText: '取消',
          confirmClass: 'btn-danger'
        });
        
        if (!confirmed) {
          return;
        }
      }
      
      const exportResult = await dserverCall('device.exportMachineCode', { 
        filePath: filePath 
      });
      
      if (exportResult && exportResult.success !== false) {
        await showConfirmModal({
          title: '导出成功',
          message: '机器码导出成功',
          icon: 'success',
          confirmText: '确定',
          confirmClass: 'btn-primary',
          showCancel: false
        });
      } else {
        await showConfirmModal({
          title: '导出失败',
          message: exportResult?.message || '未知错误',
          icon: 'error',
          confirmText: '确定',
          confirmClass: 'btn-primary',
          showCancel: false
        });
      }
    }
  } catch (error) {
    console.error('Error exporting device code:', error);
    alert('导出失败: ' + error.message);
  }
}

// 选择授权文件
async function selectLicenseFile() {
  try {
    const result = await ipcCall('open-file-dialog', {
      title: t('auth.selectLicenseFileTitle'),
      filters: [{ name: t('auth.licenseFile'), extensions: ['srlic'] }],
      properties: ['openFile']
    });
    
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      document.getElementById('licenseFileInput').value = result.filePaths[0];
    }
  } catch (error) {
    console.error('Error selecting license file:', error);
  }
}

// 确认激活
async function confirmAuth() {
  const licenseFilePath = document.getElementById('licenseFileInput').value;
  
  if (!licenseFilePath) {
    alert(t('auth.pleaseSelectLicenseFile'));
    return;
  }
  
  try {
    const fileContent = await ipcCall('read-file', { filePath: licenseFilePath });
    
    if (!fileContent) {
      alert('授权文件不存在或无法读取');
      return;
    }
    
    const result = await dserverCall('activation.activate', {
      licenseContent: fileContent
    });
    
    if (result && result.success) {
      await getAuthStatus();
      updateAuthHeaderImage();
      updateEditionBadge();
      await updateAuthStatusDisplay();
      
      alert('授权成功');
      cancelAuth();
    } else {
      alert('授权失败: ' + (result?.message || '未知错误'));
    }
  } catch (error) {
    console.error('Error confirming auth:', error);
    alert('授权失败: ' + error.message);
  }
}

// 更新授权按钮图标（初始化时调用）
function updateAuthButton() {
  const authBtnImg = document.getElementById('authBtnImg');
  if (authBtnImg) {
    // 默认显示红色图标（未激活）
    authBtnImg.src = getAssetUrl('../../assets/images/headred.png');
    authBtnImg.title = t('message.authNotActivated');
  }
}

// 窗口状态变化处理
function updateMaximizeButton(isMaximized) {
  const maxBtn = document.getElementById('maxBtn');
  const maxBtnImg = document.getElementById('maxBtnImg');
  if (maxBtn && maxBtnImg) {
    if (isMaximized) {
      maxBtn.title = t('window.restore');
      maxBtn.setAttribute('data-i18n-title', 'window.restore');
      maxBtnImg.src = getAssetUrl('../../assets/images/restore.png');
    } else {
      maxBtn.title = t('window.maximize');
      maxBtn.setAttribute('data-i18n-title', 'window.maximize');
      maxBtnImg.src = getAssetUrl('../../assets/images/max.png');
    }
  }
}

if (window.electronAPI) {
  window.electronAPI.onWindowMaximized && window.electronAPI.onWindowMaximized(() => {
    updateMaximizeButton(true);
  });
  window.electronAPI.onWindowUnmaximized && window.electronAPI.onWindowUnmaximized(() => {
    updateMaximizeButton(false);
  });
}

function setCurrentContainerAndShowAppModal(containerId) {
  const taskListModal = document.getElementById('taskListModal');
  if (taskListModal && taskListModal.classList.contains('active')) {
    closeTaskListModal();
    return;
  }
  
  const activeModals = document.querySelectorAll('.modal.active');
  if (activeModals.length > 0) {
    return;
  }
  
  currentContainerId = containerId;
  showAddAppModal();
}

function showContainerContextMenu(event, containerId) {
  event.preventDefault();
  currentContainerId = containerId;
  
  const container = containers.find(c => String(c.id) === String(containerId));
  const containerPath = container?.wine_prefix_full_path || '';
  const x = event.clientX;
  const y = event.clientY;
  
  if (window.electronAPI?.showContainerContextMenu) {
    window.electronAPI.showContainerContextMenu({
      x: x,
      y: y,
      containerId: containerId,
      containerPath: containerPath
    }).catch(error => {
      console.error('[showContainerContextMenu] Electron menu failed:', error);
    });
  }
}

function closeContainerContextMenu() {
  const menu = document.getElementById('containerContextMenu');
  if (menu) {
    menu.classList.remove('active');
  }
}

async function showContainerMoreMenu(event, containerId) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  
  currentContainerId = containerId;
  
  const button = event?.target || event?.currentTarget;
  let x = 0, y = 0;
  if (button) {
    const rect = button.getBoundingClientRect();
    x = rect.left;
    y = rect.bottom + 5;
  }
  
  const container = containers.find(c => String(c.id) === String(containerId));
  const containerPath = container?.wine_prefix_full_path || '';
  
  if (window.electronAPI?.showContainerMoreMenu) {
    window.electronAPI.showContainerMoreMenu({
      x: x,
      y: y,
      containerId: containerId,
      containerPath: containerPath
    }).catch(error => {
      console.error('[showContainerMoreMenu] Electron menu failed:', error);
    });
  }
}



function closeContainerMoreMenu() {
  const menu = document.getElementById('containerMoreMenu');
  if (menu) {
    menu.classList.remove('active');
  }
}

function setAppSortBy(sortBy) {
  appSortBy = sortBy;
  localStorage.setItem('appSortBy', sortBy);
  closeContainerMoreMenu();
  if (currentView === 'detail' && currentContainerId) {
    renderContainerDetail(currentContainerId);
  } else if (currentView === 'home') {
    renderHome();
  }
}

function refreshContainerApps(containerId) {
  closeContainerMoreMenu();
  if (containerId) {
    currentContainerId = containerId;
  }
  refreshContainer();
}

function selectAppItem(element) {
  document.querySelectorAll('.app-item.selected').forEach(el => {
    el.classList.remove('selected');
  });
  if (element) {
    element.classList.add('selected');
    const appId = element.dataset.appId;
    if (appId) {
      currentAppId = appId;
    }
  }
}

function selectAppCard(element) {
  document.querySelectorAll('.app-card.selected').forEach(el => {
    el.classList.remove('selected');
  });
  if (element) {
    element.classList.add('selected');
    const appId = element.dataset.appId;
    if (appId) {
      currentAppId = appId;
    }
  }
}

function handleAppDoubleClick(event, appId) {
  event.stopPropagation();
  launchApp(appId);
}

function showAppTooltip(event, appName, version, size, modifyDate) {
  event.stopPropagation();
  
  const tooltip = document.getElementById('appTooltip');
  if (!tooltip) {
    const tooltipEl = document.createElement('div');
    tooltipEl.id = 'appTooltip';
    tooltipEl.className = 'app-tooltip';
    tooltipEl.innerHTML = `
      <div class="tooltip-content">
        <div class="tooltip-item"><strong id="tooltipLabelName">${t('message.tooltipName')}</strong> <span id="tooltipName"></span></div>
        <div class="tooltip-item"><strong id="tooltipLabelVersion">${t('message.tooltipVersion')}</strong> <span id="tooltipVersion"></span></div>
        <div class="tooltip-item"><strong id="tooltipLabelSize">${t('message.tooltipSize')}</strong> <span id="tooltipSize"></span></div>
        <div class="tooltip-item"><strong id="tooltipLabelModifyDate">${t('message.tooltipModifyDate')}</strong> <span id="tooltipModifyDate"></span></div>
      </div>
    `;
    document.body.appendChild(tooltipEl);
  } else {
    const nameLbl = document.getElementById('tooltipLabelName');
    const verLbl = document.getElementById('tooltipLabelVersion');
    const sizeLbl = document.getElementById('tooltipLabelSize');
    const mdateLbl = document.getElementById('tooltipLabelModifyDate');
    if (nameLbl) nameLbl.textContent = t('message.tooltipName');
    if (verLbl) verLbl.textContent = t('message.tooltipVersion');
    if (sizeLbl) sizeLbl.textContent = t('message.tooltipSize');
    if (mdateLbl) mdateLbl.textContent = t('message.tooltipModifyDate');
  }
  
  document.getElementById('tooltipName').textContent = appName || 'Unknown';
  document.getElementById('tooltipVersion').textContent = version || 'Unknown';
  document.getElementById('tooltipSize').textContent = size || 'Unknown';
  document.getElementById('tooltipModifyDate').textContent = modifyDate || 'Unknown';
  
  const tooltipEl = document.getElementById('appTooltip');
  tooltipEl.style.left = (event.clientX + 15) + 'px';
  tooltipEl.style.top = (event.clientY + 15) + 'px';
  tooltipEl.style.display = 'block';
  
  setTimeout(() => {
    const t = document.getElementById('appTooltip');
    if (t) {
      t.style.display = 'none';
    }
  }, 3000);
}

function hideAppTooltip() {
  const tooltip = document.getElementById('appTooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

function editContainerName(containerId, currentName) {
  console.log('[DEBUG] editContainerName called:', containerId, currentName);
  showInputModal({
    title: t('container.editNameTitle'),
    defaultValue: currentName || '',
    confirmText: t('common.save'),
    cancelText: t('common.cancel'),
    maxLength: 30
  }).then(newName => {
    if (newName === null) return;
    
    const trimmedName = sanitizeInput(newName);
    
    if (trimmedName === (currentName || '')) return;
    
    if (trimmedName === '') {
      showToast(t('message.containerNameEmpty'), 'warning');
      return;
    }
    
    const nameExists = containers.some(c => c.id !== containerId && 
      (c.name === trimmedName || c.alias_name === trimmedName));
    if (nameExists) {
      showToast(t('message.containerNameExists'), 'warning');
      return;
    }
    
    dserverCall('container.update', {
      containerId,
      name: trimmedName
    }).then(() => {
      showToast(t('message.containerNameChangedSuccess'), 'success');
      if (currentContainerId === containerId) {
        renderContainerDetail(containerId);
      }
      loadContainers(true);
    }).catch(err => {
      console.error('Failed to update container name:', err);
      showToast(t('message.updateContainerNameFailed'), 'error');
    });
  });
}

function editContainerNotes(containerId, currentNotes) {
  showInputModal({
    title: t('container.editDescTitle'),
    defaultValue: currentNotes || '',
    confirmText: t('common.save'),
    cancelText: t('common.cancel'),
    maxLength: 255,
    type: 'textarea'
  }).then(newNotes => {
    // 用户点击取消或关闭按钮，直接返回
    if (newNotes === null) return;
    
    const sanitizedNotes = sanitizeInput(newNotes);
    
    // 描述未修改，直接返回
    if (sanitizedNotes === (currentNotes || '')) return;
    
    dserverCall('container.update', {
      containerId,
      description: sanitizedNotes
    }).then(() => {
      showToast(t('message.containerDescChangedSuccess'), 'success');
      if (currentContainerId === containerId) {
        renderContainerDetail(containerId);
      }
      loadContainers(true);
    }).catch(err => {
      console.error('Failed to update container notes:', err);
      showToast(t('message.updateContainerDescFailed'), 'error');
    });
  });
}

function moreActions(containerId, event) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  
  const containerDetail = document.querySelector('.container-detail');
  let containerPath = '';
  if (containerDetail) {
    containerPath = containerDetail.dataset.containerPath || '';
  }
  
  const button = event?.target;
  let x = 0, y = 0;
  if (button) {
    const rect = button.getBoundingClientRect();
    x = rect.left;
    y = rect.bottom + 5;
  }
  
  if (window.electronAPI?.showContainerContextMenu) {
    window.electronAPI.showContainerContextMenu({
      x: x,
      y: y,
      containerId: containerId,
      containerPath: containerPath
    });
  }
}

// ============================================================
// 工具子菜单函数
// ============================================================

// 打开系统C盘
async function openSystemCdrive(containerId) {
  console.log('[openSystemCdrive] Called with containerId:', containerId);
  
  try {
    const result = await dserverCall('wine.explorer_cdrive', { container_id: containerId });
    if (isSuccessResult(result)) {
      console.log('系统C盘打开成功');
      showToast(t('message.systemCDriveOpened'), 'success');
    } else {
      console.error('打开系统C盘失败:', getResultError(result));
      showToast(t('message.openSystemCDriveFailed') + ': ' + getResultError(result), 'error');
    }
  } catch (error) {
    console.error('打开系统C盘失败:', error);
    showToast(t('message.openSystemCDriveFailed') + ': ' + error.message, 'error');
  }
}

// 打开注册表编辑器
async function openRegistry(containerId) {
  console.log('[openRegistry] Called with containerId:', containerId);
  
  try {
    const result = await dserverCall('wine.regedit', { container_id: containerId });
    if (isSuccessResult(result)) {
      console.log('注册表编辑器打开成功');
      showToast(t('message.registryOpened'), 'success');
    } else {
      console.error('打开注册表编辑器失败:', getResultError(result));
      showToast(t('message.openRegistryFailed') + ': ' + getResultError(result), 'error');
    }
  } catch (error) {
    console.error('打开注册表编辑器失败:', error);
    showToast(t('message.openRegistryFailed') + ': ' + error.message, 'error');
  }
}

// 打开命令提示符
async function openCommandLine(containerId) {
  console.log('[openCommandLine] Called with containerId:', containerId);
  
  try {
    const result = await dserverCall('wine.cmd', { container_id: containerId });
    if (isSuccessResult(result)) {
      console.log('命令提示符打开成功');
      showToast(t('message.commandPromptOpened'), 'success');
    } else {
      console.error('打开命令提示符失败:', getResultError(result));
      showToast(t('message.openCommandPromptFailed') + ': ' + getResultError(result), 'error');
    }
  } catch (error) {
    console.error('打开命令提示符失败:', error);
    showToast(t('message.openCommandPromptFailed') + ': ' + error.message, 'error');
  }
}

// 打开Internet选项
async function openInternetOptions(containerId) {
  console.log('[openInternetOptions] Called with containerId:', containerId);
  
  try {
    const result = await dserverCall('wine.internet_options', { container_id: containerId });
    if (isSuccessResult(result)) {
      console.log('Internet选项打开成功');
      showToast(t('message.internetOptionsOpened'), 'success');
    } else {
      console.error('打开Internet选项失败:', getResultError(result));
      showToast(t('message.openInternetOptionsFailed') + ': ' + getResultError(result), 'error');
    }
  } catch (error) {
    console.error('打开Internet选项失败:', error);
    showToast(t('message.openInternetOptionsFailed') + ': ' + error.message, 'error');
  }
}

// 打开游戏控制器
async function openGameController(containerId) {
  console.log('[openGameController] Called with containerId:', containerId);
  
  try {
    const result = await dserverCall('wine.game_controller', { container_id: containerId });
    if (isSuccessResult(result)) {
      console.log('游戏控制器打开成功');
      showToast(t('message.gameControllerOpened'), 'success');
    } else {
      console.error('打开游戏控制器失败:', getResultError(result));
      showToast(t('message.openGameControllerFailed') + ': ' + getResultError(result), 'error');
    }
  } catch (error) {
    console.error('打开游戏控制器失败:', error);
    showToast(t('message.openGameControllerFailed') + ': ' + error.message, 'error');
  }
}

// 打开控制面板
async function openControlPanel(containerId) {
  console.log('[openControlPanel] Called with containerId:', containerId);
  
  try {
    const result = await dserverCall('wine.control_panel', { container_id: containerId });
    if (isSuccessResult(result)) {
      console.log('控制面板打开成功');
      showToast(t('message.controlPanelOpened'), 'success');
    } else {
      console.error('打开控制面板失败:', getResultError(result));
      showToast(t('message.openControlPanelFailed') + ': ' + getResultError(result), 'error');
    }
  } catch (error) {
    console.error('打开控制面板失败:', error);
    showToast(t('message.openControlPanelFailed') + ': ' + error.message, 'error');
  }
}

// 打开任务管理器
async function openTaskManager(containerId) {
  console.log('[openTaskManager] Called with containerId:', containerId);
  
  try {
    const result = await dserverCall('wine.task_manager', { container_id: containerId });
    if (isSuccessResult(result)) {
      console.log('任务管理器打开成功');
      showToast(t('message.taskManagerOpened'), 'success');
    } else {
      console.error('打开任务管理器失败:', getResultError(result));
      showToast(t('message.openTaskManagerFailed') + ': ' + getResultError(result), 'error');
    }
  } catch (error) {
    console.error('打开任务管理器失败:', error);
    showToast(t('message.openTaskManagerFailed') + ': ' + error.message, 'error');
  }
}

// 生成 confirm_token
async function generateConfirmToken(containerId) {
  const ts = Math.floor(Date.now() / 1000);
  let prefixHash = '';
  if (containerId && window.crypto && window.crypto.subtle) {
    try {
      const enc = new TextEncoder().encode(containerId);
      const buf = await window.crypto.subtle.digest('SHA-256', enc);
      const arr = Array.from(new Uint8Array(buf)).slice(0, 8);
      prefixHash = arr.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      prefixHash = '';
    }
  }
  return `DEEPX_CONFIRM:${ts}:${prefixHash}`;
}

// 模拟重启
async function simulateRestart(containerId) {
  console.log('[simulateRestart] Called with containerId:', containerId);
  
  if (showLoading) {
    showLoading(t('message.simulateRestartLoading') || '正在模拟重启...');
  }
  
  try {
    const confirmToken = await generateConfirmToken(containerId);
    const result = await dserverCall('wine.simulate_restart', {
      container_id: containerId,
      confirm_token: confirmToken
    });
    if (isSuccessResult(result)) {
      console.log('模拟重启成功');
      showToast(t('message.simulateRestartSuccess'), 'success');
    } else {
      console.error('模拟重启失败:', getResultError(result));
      showToast(t('message.simulateRestartFailed') + ': ' + getResultError(result), 'error');
    }
  } catch (error) {
    console.error('模拟重启失败:', error);
    showToast(t('message.simulateRestartFailed') + ': ' + error.message, 'error');
  } finally {
    if (hideLoading) {
      hideLoading();
    }
  }
}

// 关闭工作区应用
async function closeAllAppsInContainer(containerId) {
  console.log('[closeAllAppsInContainer] Called with containerId:', containerId);
  
  closeContainerMoreMenu();
  
  showLoading(t('container.closingApps') || '正在关闭工作区应用...');
  
  try {
    const result = await dserverCall('wine.wineboot_kill', { container_id: containerId });
    
    if (isSuccessResult(result)) {
      console.log('关闭工作区应用成功');
      showToast(t('container.appsClosed'), 'success');
      
      if (currentView === 'detail' && currentContainerId) {
        loadApps(currentContainerId);
      }
    } else {
      console.error('关闭工作区应用失败:', getResultError(result));
      showToast(t('container.closeAppsFailed') + ': ' + getResultError(result), 'error');
    }
  } catch (error) {
    console.error('关闭工作区应用失败:', error);
    showToast(t('container.closeAppsFailed') + ': ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

// 显示安装组件模态框（用于菜单调用）
function showInstallComponentModal(containerId) {
  currentContainerId = containerId;
  showInstallComponentsModal();
}

// ============================================================
// 容器设置子菜单函数
// ============================================================

// 设置虚拟桌面
async function setVirtualDesktop(containerId, value) {
  console.log('[setVirtualDesktop] Called with containerId:', containerId, 'value:', value);
  
  showLoading(t('containerSettings.virtualDesktop.loading'));
  
  try {
    const result = await dserverCall('container.set_virtual_desktop', { container_id: containerId, value: value });
    if (isSuccessResult(result)) {
      const label = value === '0x0' ? t('containerSettings.virtualDesktop.close') : value;
      console.log(`虚拟桌面已设置为: ${label}`);
      showToast(t('containerSettings.virtualDesktop.success', { label }), 'success');
    } else {
      console.error('设置虚拟桌面失败:', getResultError(result));
      showToast(t('containerSettings.virtualDesktop.failed', { err: getResultError(result) || '' }), 'error');
    }
  } catch (error) {
    console.error('设置虚拟桌面失败:', error);
    showToast(t('containerSettings.virtualDesktop.failed', { err: error.message || '' }), 'error');
  } finally {
    hideLoading();
  }
}

// 显示虚拟桌面设置模态框
async function showVirtualDesktopModal(containerId) {
  console.log('[showVirtualDesktopModal] Called with containerId:', containerId);
  
  let currentValue = '0x0';
  try {
    const configResult = await dserverCall('container.get_config', { container_id: containerId });
    if (isSuccessResult(configResult) && configResult.virtual_desktop) {
      currentValue = configResult.virtual_desktop;
    }
  } catch (error) {
    console.warn('获取容器配置失败:', error);
  }
  
  const resolutions = [
    { value: '0x0', label: t('containerSettings.virtualDesktop.disableVD') },
    { value: '800x600', label: '800 × 600' },
    { value: '1024x768', label: '1024 × 768' },
    { value: '1280x720', label: '1280 × 720' },
    { value: '1280x1024', label: '1280 × 1024' },
    { value: '1366x768', label: '1366 × 768' },
    { value: '1920x1080', label: '1920 × 1080' },
    { value: '2560x1440', label: '2560 × 1440' },
    { value: '3840x2160', label: '3840 × 2160' }
  ];
  
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content" style="width: 480px;">
      <div class="modal-header">
        <h3 data-i18n="containerSettings.virtualDesktop.title">${t('containerSettings.virtualDesktop.title')}</h3>
        <button class="modal-close-btn" onclick="this.closest('.modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label data-i18n="containerSettings.virtualDesktop.selectResolution">${t('containerSettings.virtualDesktop.selectResolution')}</label>
          <select class="form-select" id="vd-resolution" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
            ${resolutions.map(r => `<option value="${r.value}" ${r.value === currentValue ? 'selected' : ''}>${r.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>${t('containerSettings.common.currentSetting')}<span id="vd-current-value" style="color: #007bff;">${currentValue === '0x0' ? t('containerSettings.virtualDesktop.close') : currentValue}</span></label>
        </div>
        <div id="vd-loading" style="display: none; text-align: center; padding: 20px;">
          <div class="modal-spinner" style="margin: 0 auto 10px;"></div>
          <p style="color: #666;" data-i18n="containerSettings.common.setting">${t('containerSettings.common.setting')}</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()" data-i18n="containerSettings.common.cancel">${t('containerSettings.common.cancel')}</button>
        <button class="btn btn-primary" id="vd-apply-btn" data-i18n="containerSettings.common.apply">${t('containerSettings.common.apply')}</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('#vd-apply-btn').onclick = async () => {
    const resolution = modal.querySelector('#vd-resolution').value;
    const loading = modal.querySelector('#vd-loading');
    const applyBtn = modal.querySelector('#vd-apply-btn');
    
    loading.style.display = 'block';
    applyBtn.disabled = true;
    
    try {
      const result = await dserverCall('container.set_virtual_desktop', { container_id: containerId, value: resolution });
      
      loading.style.display = 'none';
      applyBtn.disabled = false;
      
      if (isSuccessResult(result)) {
        const label = resolution === '0x0' ? t('containerSettings.virtualDesktop.close') : resolution;
        showToast(t('containerSettings.virtualDesktop.success', { label }), 'success');
        modal.querySelector('#vd-current-value').textContent = label;
        modal.querySelector('#vd-current-value').style.color = '#28a745';
        setTimeout(() => modal.remove(), 1500);
      } else {
        showToast(t('containerSettings.virtualDesktop.failed', { err: getResultError(result) || '' }), 'error');
      }
    } catch (error) {
      loading.style.display = 'none';
      applyBtn.disabled = false;
      showToast(t('containerSettings.virtualDesktop.failed', { err: error.message || '' }), 'error');
    }
  };
}

// 显示显示系统设置模态框
async function showDisplaySystemModal(containerId) {
  let currentValue = 'auto';
  try {
    const configResult = await dserverCall('container.get_config', { container_id: containerId });
    if (isSuccessResult(configResult) && configResult.display_system) {
      currentValue = configResult.display_system;
    }
  } catch (error) {
    console.warn('获取容器配置失败:', error);
  }

  const options = [
    { value: 'auto', label: t('containerSettings.displaySystem.auto') },
    { value: 'wayland', label: t('containerSettings.displaySystem.wayland') },
    { value: 'x11', label: t('containerSettings.displaySystem.x11') }
  ];

  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content" style="width: 400px;">
      <div class="modal-header">
        <h3 data-i18n="containerSettings.displaySystem.title">${t('containerSettings.displaySystem.title')}</h3>
        <button class="modal-close-btn" onclick="this.closest('.modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label data-i18n="containerSettings.displaySystem.selectOption">${t('containerSettings.displaySystem.selectOption')}</label>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${options.map(opt => `
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="radio" name="ds-option" value="${opt.value}" ${opt.value === currentValue ? 'checked' : ''} style="width: 16px; height: 16px;">
                <span>${opt.label}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label>${t('containerSettings.common.currentSetting')}<span id="ds-current-value" style="color: #007bff;">${options.find(o => o.value === currentValue)?.label || currentValue}</span></label>
        </div>
        <div id="ds-loading" style="display: none; text-align: center; padding: 20px;">
          <div class="modal-spinner" style="margin: 0 auto 10px;"></div>
          <p style="color: #666;" data-i18n="containerSettings.common.setting">${t('containerSettings.common.setting')}</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()" data-i18n="containerSettings.common.cancel">${t('containerSettings.common.cancel')}</button>
        <button class="btn btn-primary" id="ds-apply-btn" data-i18n="containerSettings.common.apply">${t('containerSettings.common.apply')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#ds-apply-btn').onclick = async () => {
    const selectedValue = modal.querySelector('input[name="ds-option"]:checked')?.value;
    if (!selectedValue) return;

    const loading = modal.querySelector('#ds-loading');
    const applyBtn = modal.querySelector('#ds-apply-btn');

    loading.style.display = 'block';
    applyBtn.disabled = true;

    try {
      const result = await dserverCall('container.set_display_system', { container_id: containerId, value: selectedValue });

      loading.style.display = 'none';
      applyBtn.disabled = false;

      if (isSuccessResult(result)) {
        const label = options.find(o => o.value === selectedValue)?.label || selectedValue;
        showToast(t('containerSettings.displaySystem.success', { label }), 'success');
        modal.querySelector('#ds-current-value').textContent = label;
        modal.querySelector('#ds-current-value').style.color = '#28a745';
        setTimeout(() => modal.remove(), 1500);
      } else {
        showToast(t('containerSettings.displaySystem.failed', { err: getResultError(result) || '' }), 'error');
      }
    } catch (error) {
      loading.style.display = 'none';
      applyBtn.disabled = false;
      showToast(t('containerSettings.displaySystem.failed', { err: error.message || '' }), 'error');
    }
  };
}

// 显示界面缩放设置模态框
async function showUiScaleModal(containerId) {
  let currentValue = 100;
  try {
    const configResult = await dserverCall('container.get_config', { container_id: containerId });
    if (isSuccessResult(configResult) && configResult.ui_scale) {
      currentValue = parseInt(configResult.ui_scale);
    }
  } catch (error) {
    console.warn('获取容器配置失败:', error);
  }

  const options = [
    { value: 100, label: '100%' },
    { value: 125, label: '125%' },
    { value: 150, label: '150%' },
    { value: 175, label: '175%' },
    { value: 200, label: '200%' },
    { value: 225, label: '225%' },
    { value: 250, label: '250%' },
    { value: 300, label: '300%' }
  ];

  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content" style="width: 400px;">
      <div class="modal-header">
        <h3 data-i18n="containerSettings.uiScale.title">${t('containerSettings.uiScale.title')}</h3>
        <button class="modal-close-btn" onclick="this.closest('.modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label data-i18n="containerSettings.uiScale.selectOption">${t('containerSettings.uiScale.selectOption')}</label>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${options.map(opt => `
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="radio" name="uis-option" value="${opt.value}" ${opt.value === currentValue ? 'checked' : ''} style="width: 16px; height: 16px;">
                <span>${opt.label}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label>${t('containerSettings.common.currentSetting')}<span id="uis-current-value" style="color: #007bff;">${options.find(o => o.value === currentValue)?.label || currentValue + '%'}</span></label>
        </div>
        <div id="uis-loading" style="display: none; text-align: center; padding: 20px;">
          <div class="modal-spinner" style="margin: 0 auto 10px;"></div>
          <p style="color: #666;" data-i18n="containerSettings.common.setting">${t('containerSettings.common.setting')}</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()" data-i18n="containerSettings.common.cancel">${t('containerSettings.common.cancel')}</button>
        <button class="btn btn-primary" id="uis-apply-btn" data-i18n="containerSettings.common.apply">${t('containerSettings.common.apply')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#uis-apply-btn').onclick = async () => {
    const selectedValue = parseInt(modal.querySelector('input[name="uis-option"]:checked')?.value);
    if (!selectedValue) return;

    const loading = modal.querySelector('#uis-loading');
    const applyBtn = modal.querySelector('#uis-apply-btn');

    loading.style.display = 'block';
    applyBtn.disabled = true;

    try {
      const result = await dserverCall('container.set_ui_scale', { container_id: containerId, value: selectedValue });

      loading.style.display = 'none';
      applyBtn.disabled = false;

      if (isSuccessResult(result)) {
        const label = options.find(o => o.value === selectedValue)?.label || selectedValue + '%';
        showToast(t('containerSettings.uiScale.success', { label }), 'success');
        modal.querySelector('#uis-current-value').textContent = label;
        modal.querySelector('#uis-current-value').style.color = '#28a745';
        setTimeout(() => modal.remove(), 1500);
      } else {
        showToast(t('containerSettings.uiScale.failed', { err: getResultError(result) || '' }), 'error');
      }
    } catch (error) {
      loading.style.display = 'none';
      applyBtn.disabled = false;
      showToast(t('containerSettings.uiScale.failed', { err: error.message || '' }), 'error');
    }
  };
}

// 显示图形加速设置模态框
async function showGraphicsBackendModal(containerId) {
  let currentValue = 'auto';
  try {
    const configResult = await dserverCall('container.get_config', { container_id: containerId });
    if (isSuccessResult(configResult) && configResult.graphics_backend) {
      currentValue = configResult.graphics_backend;
    }
  } catch (error) {
    console.warn('获取容器配置失败:', error);
  }

  const options = [
    { value: 'auto', label: t('containerSettings.graphicsBackend.auto') },
    { value: 'dxvk', label: t('containerSettings.graphicsBackend.dxvk') },
    { value: 'opengl', label: t('containerSettings.graphicsBackend.opengl') },
    { value: 'llvmpipe', label: t('containerSettings.graphicsBackend.llvmpipe') }
  ];

  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content" style="width: 400px;">
      <div class="modal-header">
        <h3 data-i18n="containerSettings.graphicsBackend.title">${t('containerSettings.graphicsBackend.title')}</h3>
        <button class="modal-close-btn" onclick="this.closest('.modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label data-i18n="containerSettings.graphicsBackend.selectOption">${t('containerSettings.graphicsBackend.selectOption')}</label>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${options.map(opt => `
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="radio" name="gb-option" value="${opt.value}" ${opt.value === currentValue ? 'checked' : ''} style="width: 16px; height: 16px;">
                <span>${opt.label}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label>${t('containerSettings.common.currentSetting')}<span id="gb-current-value" style="color: #007bff;">${options.find(o => o.value === currentValue)?.label || currentValue}</span></label>
        </div>
        <div id="gb-loading" style="display: none; text-align: center; padding: 20px;">
          <div class="modal-spinner" style="margin: 0 auto 10px;"></div>
          <p style="color: #666;" data-i18n="containerSettings.common.setting">${t('containerSettings.common.setting')}</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()" data-i18n="containerSettings.common.cancel">${t('containerSettings.common.cancel')}</button>
        <button class="btn btn-primary" id="gb-apply-btn" data-i18n="containerSettings.common.apply">${t('containerSettings.common.apply')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#gb-apply-btn').onclick = async () => {
    const selectedValue = modal.querySelector('input[name="gb-option"]:checked')?.value;
    if (!selectedValue) return;

    const loading = modal.querySelector('#gb-loading');
    const applyBtn = modal.querySelector('#gb-apply-btn');

    loading.style.display = 'block';
    applyBtn.disabled = true;

    try {
      const result = await dserverCall('container.set_graphics_backend', { container_id: containerId, value: selectedValue });

      loading.style.display = 'none';
      applyBtn.disabled = false;

      if (isSuccessResult(result)) {
        const label = options.find(o => o.value === selectedValue)?.label || selectedValue;
        showToast(t('containerSettings.graphicsBackend.success', { label }), 'success');
        modal.querySelector('#gb-current-value').textContent = label;
        modal.querySelector('#gb-current-value').style.color = '#28a745';
        setTimeout(() => modal.remove(), 1500);
      } else {
        showToast(t('containerSettings.graphicsBackend.failed', { err: getResultError(result) || '' }), 'error');
      }
    } catch (error) {
      loading.style.display = 'none';
      applyBtn.disabled = false;
      showToast(t('containerSettings.graphicsBackend.failed', { err: error.message || '' }), 'error');
    }
  };
}

// 显示窗口模式设置模态框
async function showWindowModeModal(containerId) {
  let currentValue = 'managed';
  try {
    const configResult = await dserverCall('container.get_config', { container_id: containerId });
    if (isSuccessResult(configResult) && configResult.window_mode) {
      currentValue = configResult.window_mode;
    }
  } catch (error) {
    console.warn('获取容器配置失败:', error);
  }

  const options = [
    { value: 'managed', label: t('containerSettings.windowMode.managed') },
    { value: 'unmanaged', label: t('containerSettings.windowMode.unmanaged') }
  ];

  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content" style="width: 400px;">
      <div class="modal-header">
        <h3 data-i18n="containerSettings.windowMode.title">${t('containerSettings.windowMode.title')}</h3>
        <button class="modal-close-btn" onclick="this.closest('.modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label data-i18n="containerSettings.windowMode.selectOption">${t('containerSettings.windowMode.selectOption')}</label>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${options.map(opt => `
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="radio" name="wm-option" value="${opt.value}" ${opt.value === currentValue ? 'checked' : ''} style="width: 16px; height: 16px;">
                <span>${opt.label}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label>${t('containerSettings.common.currentSetting')}<span id="wm-current-value" style="color: #007bff;">${options.find(o => o.value === currentValue)?.label || currentValue}</span></label>
        </div>
        <div id="wm-loading" style="display: none; text-align: center; padding: 20px;">
          <div class="modal-spinner" style="margin: 0 auto 10px;"></div>
          <p style="color: #666;" data-i18n="containerSettings.common.setting">${t('containerSettings.common.setting')}</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()" data-i18n="containerSettings.common.cancel">${t('containerSettings.common.cancel')}</button>
        <button class="btn btn-primary" id="wm-apply-btn" data-i18n="containerSettings.common.apply">${t('containerSettings.common.apply')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#wm-apply-btn').onclick = async () => {
    const selectedValue = modal.querySelector('input[name="wm-option"]:checked')?.value;
    if (!selectedValue) return;

    const loading = modal.querySelector('#wm-loading');
    const applyBtn = modal.querySelector('#wm-apply-btn');

    loading.style.display = 'block';
    applyBtn.disabled = true;

    try {
      const result = await dserverCall('container.set_window_mode', { container_id: containerId, value: selectedValue });

      loading.style.display = 'none';
      applyBtn.disabled = false;

      if (isSuccessResult(result)) {
        const label = options.find(o => o.value === selectedValue)?.label || selectedValue;
        showToast(t('containerSettings.windowMode.success', { label }), 'success');
        modal.querySelector('#wm-current-value').textContent = label;
        modal.querySelector('#wm-current-value').style.color = '#28a745';
        setTimeout(() => modal.remove(), 1500);
      } else {
        showToast(t('containerSettings.windowMode.failed', { err: getResultError(result) || '' }), 'error');
      }
    } catch (error) {
      loading.style.display = 'none';
      applyBtn.disabled = false;
      showToast(t('containerSettings.windowMode.failed', { err: error.message || '' }), 'error');
    }
  };
}

// 显示窗口装饰设置模态框
async function showWindowDecorationModal(containerId) {
  let currentValue = 'native';
  try {
    const configResult = await dserverCall('container.get_config', { container_id: containerId });
    if (isSuccessResult(configResult) && configResult.window_decoration) {
      currentValue = configResult.window_decoration;
    }
  } catch (error) {
    console.warn('获取容器配置失败:', error);
  }

  const options = [
    { value: 'native', label: t('containerSettings.windowDecoration.native') },
    { value: 'custom', label: t('containerSettings.windowDecoration.custom') }
  ];

  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content" style="width: 400px;">
      <div class="modal-header">
        <h3 data-i18n="containerSettings.windowDecoration.title">${t('containerSettings.windowDecoration.title')}</h3>
        <button class="modal-close-btn" onclick="this.closest('.modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label data-i18n="containerSettings.windowDecoration.selectOption">${t('containerSettings.windowDecoration.selectOption')}</label>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${options.map(opt => `
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="radio" name="wd-option" value="${opt.value}" ${opt.value === currentValue ? 'checked' : ''} style="width: 16px; height: 16px;">
                <span>${opt.label}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label>${t('containerSettings.common.currentSetting')}<span id="wd-current-value" style="color: #007bff;">${options.find(o => o.value === currentValue)?.label || currentValue}</span></label>
        </div>
        <div id="wd-loading" style="display: none; text-align: center; padding: 20px;">
          <div class="modal-spinner" style="margin: 0 auto 10px;"></div>
          <p style="color: #666;" data-i18n="containerSettings.common.setting">${t('containerSettings.common.setting')}</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()" data-i18n="containerSettings.common.cancel">${t('containerSettings.common.cancel')}</button>
        <button class="btn btn-primary" id="wd-apply-btn" data-i18n="containerSettings.common.apply">${t('containerSettings.common.apply')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#wd-apply-btn').onclick = async () => {
    const selectedValue = modal.querySelector('input[name="wd-option"]:checked')?.value;
    if (!selectedValue) return;

    const loading = modal.querySelector('#wd-loading');
    const applyBtn = modal.querySelector('#wd-apply-btn');

    loading.style.display = 'block';
    applyBtn.disabled = true;

    try {
      const result = await dserverCall('container.set_window_decoration', { container_id: containerId, value: selectedValue });

      loading.style.display = 'none';
      applyBtn.disabled = false;

      if (isSuccessResult(result)) {
        const label = options.find(o => o.value === selectedValue)?.label || selectedValue;
        showToast(t('containerSettings.windowDecoration.success', { label }), 'success');
        modal.querySelector('#wd-current-value').textContent = label;
        modal.querySelector('#wd-current-value').style.color = '#28a745';
        setTimeout(() => modal.remove(), 1500);
      } else {
        showToast(t('containerSettings.windowDecoration.failed', { err: getResultError(result) || '' }), 'error');
      }
    } catch (error) {
      loading.style.display = 'none';
      applyBtn.disabled = false;
      showToast(t('containerSettings.windowDecoration.failed', { err: error.message || '' }), 'error');
    }
  };
}

// 设置显示系统
async function setDisplaySystem(containerId, value) {
  console.log('[setDisplaySystem] Called with containerId:', containerId, 'value:', value);
  
  showLoading(t('containerSettings.displaySystem.loading'));
  
  try {
    const result = await dserverCall('container.set_display_system', { container_id: containerId, value: value });
    if (isSuccessResult(result)) {
      const label = value === 'auto' ? t('containerSettings.displaySystem.auto') : (value === 'wayland' ? t('containerSettings.displaySystem.wayland') : t('containerSettings.displaySystem.x11'));
      console.log(`显示系统已设置为: ${label}`);
      showToast(t('containerSettings.displaySystem.success', { label }), 'success');
    } else {
      console.error('设置显示系统失败:', getResultError(result));
      showToast(t('containerSettings.displaySystem.failed', { err: getResultError(result) || '' }), 'error');
    }
  } catch (error) {
    console.error('设置显示系统失败:', error);
    showToast(t('containerSettings.displaySystem.failed', { err: error.message || '' }), 'error');
  } finally {
    hideLoading();
  }
}

// 设置界面缩放
async function setUiScale(containerId, value) {
  console.log('[setUiScale] Called with containerId:', containerId, 'value:', value);
  
  showLoading(t('containerSettings.uiScale.loading'));
  
  try {
    const result = await dserverCall('container.set_ui_scale', { container_id: containerId, value: value });
    if (isSuccessResult(result)) {
      const label = value + '%';
      console.log(`界面缩放已设置为: ${label}`);
      showToast(t('containerSettings.uiScale.success', { label }), 'success');
    } else {
      console.error('设置界面缩放失败:', getResultError(result));
      showToast(t('containerSettings.uiScale.failed', { err: getResultError(result) || '' }), 'error');
    }
  } catch (error) {
    console.error('设置界面缩放失败:', error);
    showToast(t('containerSettings.uiScale.failed', { err: error.message || '' }), 'error');
  } finally {
    hideLoading();
  }
}

// 设置图形后端
async function setGraphicsBackend(containerId, value) {
  console.log('[setGraphicsBackend] Called with containerId:', containerId, 'value:', value);
  
  if (showLoading) {
    showLoading(t('containerSettings.graphicsBackend.loading'));
  }
  
  try {
    const result = await dserverCall('container.set_graphics_backend', { container_id: containerId, value: value });
    if (isSuccessResult(result)) {
      const label = value === 'auto' ? t('containerSettings.graphicsBackend.auto') : (value === 'dxvk' ? t('containerSettings.graphicsBackend.dxvk') : (value === 'opengl' ? t('containerSettings.graphicsBackend.opengl') : t('containerSettings.graphicsBackend.llvmpipe')));
      console.log(`图形加速已设置为: ${label}`);
      showToast(t('containerSettings.graphicsBackend.success', { label }), 'success');
    } else {
      console.error('设置图形加速失败:', getResultError(result));
      showToast(t('containerSettings.graphicsBackend.failed', { err: getResultError(result) || '' }), 'error');
    }
  } catch (error) {
    console.error('设置图形加速失败:', error);
    showToast(t('containerSettings.graphicsBackend.failed', { err: error.message || '' }), 'error');
  } finally {
    hideLoading();
  }
}

// 设置窗口模式
async function setWindowMode(containerId, value) {
  console.log('[setWindowMode] Called with containerId:', containerId, 'value:', value);
  
  if (showLoading) {
    showLoading(t('containerSettings.windowMode.loading'));
  }
  
  try {
    const result = await dserverCall('container.set_window_mode', { container_id: containerId, value: value });
    if (isSuccessResult(result)) {
      const label = value === 'managed' ? t('containerSettings.windowMode.managed') : t('containerSettings.windowMode.unmanaged');
      console.log(`窗口模式已设置为: ${label}`);
      showToast(t('containerSettings.windowMode.success', { label }), 'success');
    } else {
      console.error('设置窗口模式失败:', getResultError(result));
      showToast(t('containerSettings.windowMode.failed', { err: getResultError(result) || '' }), 'error');
    }
  } catch (error) {
    console.error('设置窗口模式失败:', error);
    showToast(t('containerSettings.windowMode.failed', { err: error.message || '' }), 'error');
  } finally {
    if (hideLoading) {
      hideLoading();
    }
  }
}

// 设置窗口装饰
async function setWindowDecoration(containerId, value) {
  console.log('[setWindowDecoration] Called with containerId:', containerId, 'value:', value);
  
  showLoading(t('containerSettings.windowDecoration.loading'));
  
  try {
    const result = await dserverCall('container.set_window_decoration', { container_id: containerId, value: value });
    if (isSuccessResult(result)) {
      const label = value === 'native' ? t('containerSettings.windowDecoration.native') : t('containerSettings.windowDecoration.custom');
      console.log(`窗口装饰已设置为: ${label}`);
      showToast(t('containerSettings.windowDecoration.success', { label }), 'success');
    } else {
      console.error('设置窗口装饰失败:', getResultError(result));
      showToast(t('containerSettings.windowDecoration.failed', { err: getResultError(result) || '' }), 'error');
    }
  } catch (error) {
    console.error('设置窗口装饰失败:', error);
    showToast(t('containerSettings.windowDecoration.failed', { err: error.message || '' }), 'error');
  } finally {
    hideLoading();
  }
}

// 将函数暴露到全局，供 HTML inline onclick 调用
window.toggleSidebar = toggleSidebar;
window.initSidebarIcon = initSidebarIcon;
window.handleSearch = handleSearch;
window.clearSearch = clearSearch;
window.toggleMoreMenu = toggleMoreMenu;
window.closeMoreMenu = closeMoreMenu;
window.refreshData = refreshData;
window.minimizeWindow = minimizeWindow;
window.maximizeWindow = maximizeWindow;
window.closeWindow = closeWindow;
window.showCreateContainerModal = showCreateContainerModal;
window.cancelCreateContainer = cancelCreateContainer;
window.createContainer = createContainer;
window.updateContainerNameCharCount = updateContainerNameCharCount;
window.updateCharCount = updateCharCount;
window.showAddAppModal = showAddAppModal;
window.cancelAddApp = cancelAddApp;
window.browseAppPath = browseAppPath;
window.addApp = addApp;
window.showUninstallAppModal = showUninstallAppModal;
window.cancelUninstallApp = cancelUninstallApp;
window.confirmUninstallApp = confirmUninstallApp;
window.showDeleteContainerModal = showDeleteContainerModal;
window.cancelDeleteContainer = cancelDeleteContainer;
window.confirmDeleteContainer = confirmDeleteContainer;
window.showContainerTrashModal = showContainerTrashModal;
window.cancelContainerTrash = cancelContainerTrash;
window.updateTrashButtons = updateTrashButtons;
window.restoreSelectedContainers = restoreSelectedContainers;
window.deleteSelectedContainers = deleteSelectedContainers;
window.showCloseAllAppsModal = showCloseAllAppsModal;
window.showImportFontModal = showImportFontModal;
window.cancelImportFont = cancelImportFont;
window.browseFontPath = browseFontPath;
window.confirmImportFont = confirmImportFont;
window.showImportContainerModal = showImportContainerModal;
window.cancelImportContainer = cancelImportContainer;
window.browseImportPath = browseImportPath;
window.confirmImportContainer = confirmImportContainer;
window.showExportContainerModal = showExportContainerModal;
window.cancelExportContainer = cancelExportContainer;
window.browseExportPath = browseExportPath;
window.exportContainer = exportContainer;
window.showInstallComponentsModal = showInstallComponentsModal;
window.cancelInstallComponents = cancelInstallComponents;
window.toggleComponentDropdown = toggleComponentDropdown;
window.onComponentInput = onComponentInput;
window.selectComponent = selectComponent;
window.startInstallComponents = startInstallComponents;
window.showAppSettingsModal = showAppSettingsModal;
window.closeAppSettingsModal = closeAppSettingsModal;
window.saveAppSettings = saveAppSettings;
window.showAddShortcutModal = showAddShortcutModal;
window.closeAddShortcutModal = closeAddShortcutModal;
window.saveShortcut = saveShortcut;
window.selectShortcutPath = selectShortcutPath;
window.showAppContextMenu = showAppContextMenu;
window.closeAppContextMenu = closeAppContextMenu;
window.openAppSettingsFromContextMenu = openAppSettingsFromContextMenu;
window.openAppPathFromContextMenu = openAppPathFromContextMenu;
window.createAppDesktopShortcutFromContextMenu = createAppDesktopShortcutFromContextMenu;
window.deleteAppFromContextMenu = deleteAppFromContextMenu;
window.uninstallSingleApp = uninstallSingleApp;
window.launchApp = launchApp;
window.launchAppFromHome = launchAppFromHome;
window.switchToHome = switchToHome;
window.selectContainer = selectContainer;
window.updateEditionBadge = updateEditionBadge;
window.updateAuthButton = updateAuthButton;
window.showAuthModal = showAuthModal;
window.showAbout = showAbout;
window.loadData = loadData;
window.showConfirmModal = showConfirmModal;
window.cancelConfirmModal = cancelConfirmModal;
window.executeConfirmModal = executeConfirmModal;
window.retryCreateDefaultContainer = retryCreateDefaultContainer;
window.closeDefaultContainerModal = closeDefaultContainerModal;
window.setCurrentContainerAndShowAppModal = setCurrentContainerAndShowAppModal;
window.showContainerContextMenu = showContainerContextMenu;
window.closeContainerContextMenu = closeContainerContextMenu;
window.showContainerMoreMenu = showContainerMoreMenu;
window.closeContainerMoreMenu = closeContainerMoreMenu;
window.setAppSortBy = setAppSortBy;
window.refreshContainerApps = refreshContainerApps;
window.selectAppItem = selectAppItem;
window.selectAppCard = selectAppCard;
window.handleAppDoubleClick = handleAppDoubleClick;
window.showAppTooltip = showAppTooltip;
window.hideAppTooltip = hideAppTooltip;
window.moreActions = moreActions;

// 工具子菜单函数
window.openSystemCdrive = openSystemCdrive;
window.openRegistry = openRegistry;
window.openCommandLine = openCommandLine;
window.openInternetOptions = openInternetOptions;
window.openGameController = openGameController;
window.openControlPanel = openControlPanel;
window.openTaskManager = openTaskManager;
window.simulateRestart = simulateRestart;
window.closeAllAppsInContainer = closeAllAppsInContainer;
window.showInstallComponentModal = showInstallComponentModal;

// 工具子菜单函数别名（与菜单调用一致）
window.openSystemCDrive = openSystemCdrive;
window.openRegistryEditor = openRegistry;
window.openCommandPrompt = openCommandLine;

// 容器设置子菜单函数
window.setVirtualDesktop = setVirtualDesktop;
window.setDisplaySystem = setDisplaySystem;
window.setUiScale = setUiScale;
window.setGraphicsBackend = setGraphicsBackend;
window.setWindowMode = setWindowMode;
window.setWindowDecoration = setWindowDecoration;

// 容器设置模态框函数
window.showVirtualDesktopModal = showVirtualDesktopModal;
window.showDisplaySystemModal = showDisplaySystemModal;
window.showUiScaleModal = showUiScaleModal;
window.showGraphicsBackendModal = showGraphicsBackendModal;
window.showWindowModeModal = showWindowModeModal;
window.showWindowDecorationModal = showWindowDecorationModal;

// 授权激活函数
window.cancelAuth = cancelAuth;
window.confirmAuth = confirmAuth;
window.exportDeviceCode = exportDeviceCode;
window.selectLicenseFile = selectLicenseFile;
window.getAuthStatus = getAuthStatus;
window.updateAuthHeaderImage = updateAuthHeaderImage;
window.updateAuthStatusDisplay = updateAuthStatusDisplay;
window.loadDeviceInfo = loadDeviceInfo;

// 设置、帮助、关于模态框
window.showSettingsModal = showSettingsModal;
window.showHelpModal = showHelpModal;
window.showAboutModal = showAboutModal;
window.closeAboutModal = closeAboutModal;
window.openUserAgreement = openUserAgreement;
window.openPrivacyPolicy = openPrivacyPolicy;

// 任务列表函数
window.showTaskListModal = showTaskListModal;
window.closeTaskListModal = closeTaskListModal;
window.showTaskDetailModal = showTaskDetailModal;
window.closeTaskDetailModal = closeTaskDetailModal;

let taskListRefreshInterval = null;

function getTaskTypeLabel(type) {
  if (!type) return '未知任务';
  const t = type.toLowerCase();
  if (t.includes('container_create') || t.includes('container.ensure')) return '新建工作区';
  if (t.includes('app_install') || t.includes('app.install')) return '添加应用';
  if (t.includes('wine_install') || t.includes('wine.install')) return '安装 Wine';
  if (t.includes('import')) return '导入工作区';
  if (t.includes('export')) return '导出工作区';
  if (t.includes('uninstall')) return '卸载应用';
  if (t.includes('delete')) return '删除工作区';
  if (t.includes('install') && t.includes('component')) return '安装组件';
  return type;
}

function getTaskTypeIcon(type) {
  if (!type) return '📋';
  const t = type.toLowerCase();
  if (t.includes('container_create') || t.includes('container.ensure')) return '📦';
  if (t.includes('app_install') || t.includes('app.install')) return '📱';
  if (t.includes('wine_install') || t.includes('wine.install')) return '🍷';
  if (t.includes('import')) return '📥';
  if (t.includes('export')) return '📤';
  if (t.includes('uninstall')) return '🗑️';
  if (t.includes('delete')) return '🗑️';
  if (t.includes('install') && t.includes('component')) return '🔧';
  return '📋';
}

function getTaskTypeClass(type) {
  if (!type) return 'other';
  const t = type.toLowerCase();
  if (t.includes('container_create') || t.includes('container.ensure')) return 'container';
  if (t.includes('app_install') || t.includes('app.install')) return 'app';
  if (t.includes('wine_install') || t.includes('wine.install')) return 'wine';
  return 'other';
}

function getStatusLabel(status) {
  const statusMap = {
    'queued': '排队中',
    'initializing': '初始化',
    'running': '运行中',
    'paused': '已暂停',
    'retrying': '重试中',
    'completed': '已完成',
    'failed': '失败',
    'cancelled': '已取消',
    'cancelling': '取消中'
  };
  return statusMap[status] || '未知';
}

function getStatusClass(status) {
  if (['running', 'initializing', 'retrying', 'queued', 'cancelling'].includes(status)) return 'running';
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  return 'pending';
}

function updateTaskHeaderButton() {
  const taskBtn = document.getElementById('taskBtn');
  const taskBadge = document.getElementById('taskBadge');
  
  if (!taskBtn || !taskBadge) return;
  
  const runningTasks = taskStore.getRunningTasks();
  const count = runningTasks.length;
  
  if (count > 0) {
    taskBtn.style.display = 'flex';
    taskBadge.textContent = count;
    taskBadge.style.display = 'flex';
  } else {
    taskBtn.style.display = 'none';
    taskBadge.style.display = 'none';
  }
}

function isTerminalTaskStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'completed' || s === 'failed' || s === 'cancelled' ||
         s === 'canceled' || s === 'cleaned' || s === 'done' || s === 'error' || s === 'success';
}

function mergeTasksWithStore(allTasks) {
  const storeState = (taskStore && typeof taskStore.getAllState === 'function') ? taskStore.getAllState() : {};
  const storeById = storeState && typeof storeState === 'object' ? storeState : {};
  const merged = [];
  const seen = new Set();
  if (Array.isArray(allTasks)) {
    allTasks.forEach(t => {
      if (!t || !t.task_id) return;
      const tid = String(t.task_id);
      seen.add(tid);
      const storeTask = storeById[tid];
      if (storeTask && (isTerminalTaskStatus(storeTask.status) || !isTerminalTaskStatus(t.status))) {
        merged.push({ ...t, ...storeTask, task_id: tid });
      } else {
        merged.push({ ...t, task_id: tid });
      }
    });
  }
  Object.keys(storeById).forEach(tid => {
    if (seen.has(tid)) return;
    const storeTask = storeById[tid];
    if (!storeTask) return;
    merged.push({ ...storeTask, task_id: tid });
  });
  return merged;
}

function isRunningTaskStatus(status) {
  return ['running', 'initializing', 'retrying', 'queued', 'cancelling'].includes(String(status || ''));
}

async function showTaskListModal() {
  const modal = document.getElementById('taskListModal');
  const container = document.getElementById('taskListContainer');
  const emptyState = document.getElementById('taskEmptyState');
  const taskBtn = document.getElementById('taskBtn');
  
  if (!modal || !container || !emptyState) return;
  
  if (taskBtn) {
    const rect = taskBtn.getBoundingClientRect();
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.style.position = 'fixed';
      content.style.top = `${rect.bottom + 8}px`;
      content.style.right = `${window.innerWidth - rect.right}px`;
      content.style.left = 'auto';
      content.style.margin = '0';
    }
  }
  
  document.removeEventListener('click', closeTaskListModalOnOutsideClick);
  document.addEventListener('click', closeTaskListModalOnOutsideClick);
  
  try {
    const allTasks = mergeTasksWithStore(await taskManager.listTasks());
    
    const runningTasks = allTasks.filter(t => isRunningTaskStatus(t.status));
    
    if (!runningTasks || runningTasks.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'block';
      modal.classList.add('active');
      return;
    }
    
    emptyState.style.display = 'none';
    
    const sortedTasks = [...runningTasks].sort((a, b) => {
      const statusOrder = { 'running': 0, 'initializing': 1, 'retrying': 2, 'queued': 3, 'cancelling': 4 };
      return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
    });
    
    container.style.maxHeight = '300px';
    container.style.overflowY = 'auto';
    
    container.innerHTML = sortedTasks.map(task => {
      const typeLabel = getTaskTypeLabel(task.type);
      const typeIcon = getTaskTypeIcon(task.type);
      const typeClass = getTaskTypeClass(task.type);
      const statusLabel = getStatusLabel(task.status);
      const statusClass = getStatusClass(task.status);
      const progress = task.progress || 0;
      const showStage = !isTerminalTaskStatus(task.status) && task.stage;
      
      return `
        <div class="task-list-item" onclick="taskManager.openTaskInView('${task.task_id}'); closeTaskListModal();">
          <div class="task-list-icon ${typeClass}">${typeIcon}</div>
          <div class="task-list-info">
            <div class="task-list-title">${typeLabel}</div>
            <div class="task-list-meta">
              <span class="task-list-progress">
                <span class="task-list-progress-bar">
                  <span class="task-list-progress-fill ${statusClass}" style="width: ${progress}%"></span>
                </span>
                <span>${progress}%</span>
              </span>
              <span class="task-list-status ${statusClass}">${statusLabel}</span>
              ${showStage ? `<span>${task.stage}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    modal.classList.add('active');
    
    if (taskListRefreshInterval) {
      clearInterval(taskListRefreshInterval);
    }
    taskListRefreshInterval = setInterval(() => {
      if (modal.classList.contains('active')) {
        refreshTaskList();
      }
    }, 2000);
    
  } catch (error) {
    console.error('获取任务列表失败:', error);
    showToast('获取任务列表失败', 'error');
  }
}

async function refreshTaskList() {
  const container = document.getElementById('taskListContainer');
  const emptyState = document.getElementById('taskEmptyState');
  
  if (!container || !emptyState) return;
  
  try {
    const allTasks = mergeTasksWithStore(await taskManager.listTasks());
    
    const runningTasks = allTasks.filter(t => isRunningTaskStatus(t.status));
    
    if (!runningTasks || runningTasks.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    
    emptyState.style.display = 'none';
    
    const sortedTasks = [...runningTasks].sort((a, b) => {
      const statusOrder = { 'running': 0, 'initializing': 1, 'retrying': 2, 'queued': 3, 'cancelling': 4 };
      return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
    });
    
    container.style.maxHeight = '300px';
    container.style.overflowY = 'auto';
    
    container.innerHTML = sortedTasks.map(task => {
      const typeLabel = getTaskTypeLabel(task.type);
      const typeIcon = getTaskTypeIcon(task.type);
      const typeClass = getTaskTypeClass(task.type);
      const statusLabel = getStatusLabel(task.status);
      const statusClass = getStatusClass(task.status);
      const progress = task.progress || 0;
      const showStage = !isTerminalTaskStatus(task.status) && task.stage;
      
      return `
        <div class="task-list-item" onclick="taskManager.openTaskInView('${task.task_id}'); closeTaskListModal();">
          <div class="task-list-icon ${typeClass}">${typeIcon}</div>
          <div class="task-list-info">
            <div class="task-list-title">${typeLabel}</div>
            <div class="task-list-meta">
              <span class="task-list-progress">
                <span class="task-list-progress-bar">
                  <span class="task-list-progress-fill ${statusClass}" style="width: ${progress}%"></span>
                </span>
                <span>${progress}%</span>
              </span>
              <span class="task-list-status ${statusClass}">${statusLabel}</span>
              ${showStage ? `<span>${task.stage}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('刷新任务列表失败:', error);
  }
}

function closeTaskListModalOnOutsideClick(event) {
  const modal = document.getElementById('taskListModal');
  const content = modal?.querySelector('.modal-content');
  const taskBtn = document.getElementById('taskBtn');
  
  if (!modal || !modal.classList.contains('active')) return;
  
  if (content && content.contains(event.target)) return;
  if (taskBtn && taskBtn.contains(event.target)) return;
  
  closeTaskListModal();
}

function closeTaskListModal() {
  const modal = document.getElementById('taskListModal');
  if (modal) {
    modal.classList.remove('active');
  }
  document.removeEventListener('click', closeTaskListModalOnOutsideClick);
  if (taskListRefreshInterval) {
    clearInterval(taskListRefreshInterval);
    taskListRefreshInterval = null;
  }
}

function showTaskDetailModal(taskId) {
  const modal = document.getElementById('taskDetailModal');
  if (!modal) return;
  
  const task = taskStore.getState(taskId);
  if (!task) {
    showToast('任务不存在', 'error');
    return;
  }
  
  document.getElementById('taskDetailType').textContent = getTaskTypeLabel(task.type);
  
  const statusLabel = getStatusLabel(task.status);
  const statusClass = getStatusClass(task.status);
  const statusEl = document.getElementById('taskDetailStatus');
  statusEl.textContent = statusLabel;
  statusEl.className = `task-list-status ${statusClass}`;
  
  document.getElementById('taskDetailProgress').textContent = `${task.progress || 0}%`;
  document.getElementById('taskDetailStage').textContent = task.stage || '-';
  document.getElementById('taskDetailMessage').textContent = task.message || task.message_key || '-';
  document.getElementById('taskDetailId').textContent = task.task_id || '-';
  
  const createdEl = document.getElementById('taskDetailCreated');
  if (task.created_at) {
    createdEl.textContent = new Date(task.created_at).toLocaleString('zh-CN');
  } else {
    createdEl.textContent = '-';
  }
  
  const errorRow = document.getElementById('taskDetailErrorRow');
  const errorEl = document.getElementById('taskDetailError');
  if (task.error_message) {
    errorRow.style.display = 'flex';
    errorEl.textContent = task.error_message;
  } else {
    errorRow.style.display = 'none';
  }
  
  const resultRow = document.getElementById('taskDetailResultRow');
  const resultEl = document.getElementById('taskDetailResult');
  if (task.result) {
    resultRow.style.display = 'flex';
    resultEl.textContent = typeof task.result === 'object' ? JSON.stringify(task.result, null, 2) : String(task.result);
  } else {
    resultRow.style.display = 'none';
  }
  
  modal.classList.add('active');
}

function closeTaskDetailModal() {
  const modal = document.getElementById('taskDetailModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function initTaskManagerIntegration() {
  taskManager.on('created', () => {
    updateTaskHeaderButton();
  });
  
  taskManager.on('progress', () => {
    updateTaskHeaderButton();
  });
  
  taskManager.on('completed', () => {
    updateTaskHeaderButton();
  });
  
  taskManager.on('failed', () => {
    updateTaskHeaderButton();
  });
  
  taskManager.on('cancelled', () => {
    updateTaskHeaderButton();
  });
  
  const isTerminal = (s) => {
    const t = String(s || '').toLowerCase();
    return t === 'completed' || t === 'failed' || t === 'cancelled' ||
           t === 'canceled' || t === 'cleaned' || t === 'done' || t === 'error' || t === 'success';
  };

  try {
    taskStore.subscribe(() => {
      try { updateTaskHeaderButton(); } catch (e) {}
    });
  } catch (e) {}

  setInterval(async () => {
    try {
      const list = await taskManager.listTasks();
      if (Array.isArray(list)) {
        const runningIds = new Set();
        list.forEach(t => {
          if (!t || !t.task_id) return;
          const tid = String(t.task_id);
          const existing = taskStore.getState(tid);
          const existingStatus = existing ? existing.status : '';
          if (isTerminal(existingStatus)) {
            return;
          }
          if (['running', 'initializing', 'retrying', 'queued', 'cancelling'].includes(t.status)) {
            runningIds.add(tid);
            const updates = { status: t.status };
            if (typeof t.progress === 'number') updates.progress = t.progress;
            if (t.stage) updates.stage = t.stage;
            if (t.message) updates.message = t.message;
            if (t.message_key) updates.message_key = t.message_key;
            if (t.error_message) updates.error_message = t.error_message;
            if (t.result) updates.result = t.result;
            if (t.type) updates.type = t.type;
            if (t.container_id != null) updates.container_id = String(t.container_id);
            if (t.app_id != null) updates.app_id = String(t.app_id);
            if (existing) {
              taskStore.setState(tid, { ...existing, ...updates });
            }
          } else {
            if (existing && ['running', 'initializing', 'retrying', 'queued', 'cancelling', 'init', 'queued', 'paused', 'recovering', 'ui_active'].includes(existingStatus || '')) {
              const updates = { status: t.status };
              if (t.error_message) updates.error_message = t.error_message;
              if (t.result) updates.result = t.result;
              taskStore.setState(tid, { ...existing, ...updates });
            }
          }
        });
        const all = taskStore.getAllState ? taskStore.getAllState() : {};
        Object.keys(all).forEach(tid => {
          const task = all[tid];
          if (!task) return;
          if (isTerminal(task.status)) {
            return;
          }
          if (['running', 'initializing', 'retrying', 'queued', 'cancelling', 'init', 'paused', 'recovering', 'ui_active'].includes(task.status || '')) {
            if (!runningIds.has(tid)) {
              taskStore.setState(tid, { ...task, status: task.status === 'completed' ? 'completed' : 'failed' });
            }
          }
        });
      }
    } catch (e) {
      console.warn('[TaskBadge] Sync taskStore from backend failed:', e);
    }
    updateTaskHeaderButton();
  }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  initTaskManagerIntegration();
  updateTaskHeaderButton();
});

window.taskManager = taskManager;
window.taskStore = taskStore;
window.checkServerInitTask = checkServerInitTask;