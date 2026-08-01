/**
 * 栈行平台 组件层
 *
 * 职责：
 *   - 渲染各种 UI 面板（容器详情、组件安装进度、组件列表、设置面板）
 *   - 处理菜单触发的 stackrunserver 调用
 *   - 展示后端通过 socket_server_broadcast 推送的 progress 事件
 *
 * 数据流（安装组件）：
 *   1. 用户在 UI 中选组件 + 容器
 *   2. 调 window.stackrun.call('wine.installComponents', { container_id, components, confirm_token })
 *   3. 后端启动 winetricks 异步执行，socket 推送 progress 事件
 *   4. 渲染进程通过 onProgress 收到事件 -> 实时更新进度条
 *   5. 完成后（status=success/failed） -> 刷新已安装列表
 *
 * 数据流（菜单触发）：
 *   1. 用户在主进程菜单点击 -> main.js webContents.send('menu:invoke', { method, params })
 *   2. preload 转发到渲染进程
 *   3. components.handleMenuInvoke 调用 api 对应方法
 */

const { AppItem } = require('./appItem');
const api = require('./api');
const { t } = require('./i18n/i18n');

class Components {
  constructor() {
    this.app = null;
    // 安装任务状态：task_id -> { containerId, components, status, progress, message, log[] }
    this.installTasks = new Map();
    // 当前显示的安装进度面板
    this.activeInstallPanel = null;
  }

  init(app) {
    this.app = app;
    this.injectStyles();

    // 监听菜单事件
    this.bindMenuEvents();

    // 监听后端 progress 推送
    this.subscribeProgress();
  }

  // ============================================================
  //  样式
  // ============================================================

  injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .app-item {
        display: flex;
        align-items: center;
        padding: 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.2s;
        gap: 12px;
      }
      .app-item:hover { background: #0f3460; }
      .app-item.selected { background: #0f3460; border: 1px solid #e94560; }
      .app-item-icon {
        width: 40px; height: 40px; border-radius: 8px;
        background-color: #0f3460; display: flex; align-items: center;
        justify-content: center; font-size: 20px;
      }
      .app-item-info { flex: 1; min-width: 0; }
      .app-item-name {
        font-weight: 500; margin-bottom: 4px; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
      }
      .app-item-status { font-size: 12px; color: #64748b; }
      .app-item-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; }
      .app-item-badge.running { background: #166534; color: #4ade80; }
      .app-item-badge.stopped { background: #1e293b; color: #94a3b8; }

      .wizard-overlay {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.7);
        display: flex; align-items: center; justify-content: center;
        z-index: 1000;
      }
      .wizard {
        background: #1a1a2e; border-radius: 12px; width: 500px;
        max-width: 90vw; max-height: 85vh; overflow: auto;
        box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
      }
      .wizard-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 16px 20px; border-bottom: 1px solid #0f3460;
      }
      .wizard-header h3 { margin: 0; font-size: 18px; }
      .wizard-close {
        background: none; border: none; color: #94a3b8;
        font-size: 24px; cursor: pointer; padding: 0; line-height: 1;
      }
      .wizard-close:hover { color: #e94560; }
      .wizard-progress {
        display: flex; padding: 16px 20px; gap: 8px;
      }
      .wizard-step {
        flex: 1; text-align: center; padding: 8px;
        background: #0f3460; border-radius: 6px;
        font-size: 13px; color: #64748b;
      }
      .wizard-step.active { background: #e94560; color: white; }
      .wizard-step.completed { background: #166534; color: #4ade80; }
      .wizard-content { padding: 20px; min-height: 200px; }
      .wizard-form-group { margin-bottom: 16px; }
      .wizard-form-group label {
        display: block; margin-bottom: 8px;
        font-size: 14px; color: #94a3b8;
      }
      .wizard-select, .wizard-input {
        width: 100%; padding: 10px 12px;
        border: 1px solid #0f3460; border-radius: 6px;
        background: #16213e; color: white; font-size: 14px;
      }
      .wizard-select:focus, .wizard-input:focus {
        outline: none; border-color: #e94560;
      }
      .wizard-footer {
        display: flex; justify-content: space-between;
        padding: 16px 20px; border-top: 1px solid #0f3460;
      }
      .wizard-summary {
        background: #16213e; padding: 16px; border-radius: 8px;
      }
      .wizard-summary h4 { margin: 0 0 12px 0; color: #e94560; }
      .summary-item {
        display: flex; padding: 8px 0; border-bottom: 1px solid #0f3460;
      }
      .summary-item:last-child { border-bottom: none; }
      .summary-label { width: 80px; color: #94a3b8; }
      .summary-value { flex: 1; word-break: break-all; }

      /* ====== 容器详情 ====== */
      .app-detail { max-width: 800px; }
      .app-detail-header {
        display: flex; align-items: center;
        gap: 16px; margin-bottom: 24px;
      }
      .app-detail-icon {
        width: 64px; height: 64px; background: #0f3460;
        border-radius: 12px; display: flex; align-items: center;
        justify-content: center; font-size: 32px;
      }
      .app-detail-title h2 { margin: 0 0 4px 0; }
      .app-detail-title .badge {
        display: inline-block; padding: 4px 12px;
        border-radius: 12px; font-size: 12px;
      }
      .app-detail-title .badge.running { background: #166534; color: #4ade80; }
      .app-detail-title .badge.stopped { background: #1e293b; color: #94a3b8; }
      .app-detail-section {
        background: #16213e; border-radius: 8px;
        padding: 16px; margin-bottom: 16px;
      }
      .app-detail-section h4 {
        margin: 0 0 12px 0; color: #94a3b8;
        font-size: 13px; text-transform: uppercase;
      }
      .app-detail-actions { display: flex; gap: 12px; flex-wrap: wrap; }

      .progress-view { text-align: center; padding: 20px; }
      .progress-text { font-size: 18px; margin-bottom: 16px; }
      .progress-status { margin-top: 12px; color: #64748b; font-size: 14px; }

      /* ====== 安装组件进度面板 ====== */
      .install-panel {
        background: #16213e; border-radius: 12px;
        padding: 24px; margin-bottom: 16px;
      }
      .install-panel-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 16px;
      }
      .install-panel-title {
        font-size: 18px; font-weight: 600; color: #e94560;
      }
      .install-panel-close {
        background: none; border: none; color: #94a3b8;
        font-size: 20px; cursor: pointer;
      }
      .install-panel-close:hover { color: #e94560; }
      .install-task {
        background: #0f3460; border-radius: 8px;
        padding: 16px; margin-bottom: 12px;
      }
      .install-task-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 8px;
      }
      .install-task-name {
        font-size: 14px; font-weight: 500; color: #eee;
      }
      .install-task-status {
        font-size: 12px; padding: 2px 8px; border-radius: 10px;
      }
      .install-task-status.running { background: #1e3a8a; color: #93c5fd; }
      .install-task-status.success { background: #166534; color: #4ade80; }
      .install-task-status.failed  { background: #7f1d1d; color: #fca5a5; }
      .install-task-status.pending { background: #374151; color: #9ca3af; }
      .install-task-components {
        font-size: 12px; color: #94a3b8; margin-bottom: 8px;
        word-break: break-all;
      }
      .install-task-progress-bar {
        width: 100%; height: 6px; background: #1a1a2e;
        border-radius: 3px; overflow: hidden;
      }
      .install-task-progress-fill {
        height: 100%; background: linear-gradient(90deg, #4ade80, #e94560);
        transition: width 0.3s ease;
      }
      .install-task-message {
        font-size: 12px; color: #cbd5e1; margin-top: 8px;
        font-family: 'Consolas', 'Monaco', monospace;
        word-break: break-all; max-height: 100px; overflow-y: auto;
      }
      .install-task-cancel {
        background: #7f1d1d; color: #fca5a5; border: none;
        padding: 4px 10px; border-radius: 4px; cursor: pointer;
        font-size: 12px; margin-left: 8px;
      }
      .install-task-cancel:hover { background: #991b1b; }
      .install-task-cancel:disabled { opacity: 0.5; cursor: not-allowed; }

      /* ====== 组件列表 ====== */
      .component-list { display: flex; flex-wrap: wrap; gap: 6px; }
      .component-chip {
        background: #0f3460; color: #cbd5e1; padding: 4px 10px;
        border-radius: 12px; font-size: 12px;
      }
      .component-chip.installed { background: #166534; color: #4ade80; }
      .component-chip.not-installed { background: #1e293b; color: #94a3b8; }
      .component-chip-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 12px;
      }
      .component-chip-refresh {
        background: none; border: 1px solid #0f3460; color: #94a3b8;
        padding: 4px 10px; border-radius: 4px; cursor: pointer;
        font-size: 12px;
      }
      .component-chip-refresh:hover { border-color: #e94560; color: #e94560; }

      /* ====== Toast ====== */
      .toast {
        position: fixed; top: 20px; right: 20px; z-index: 2000;
        background: #16213e; color: #eee; padding: 12px 20px;
        border-radius: 8px; border-left: 4px solid #4ade80;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        max-width: 360px; animation: slideIn 0.3s ease;
      }
      .toast.error { border-left-color: #ef4444; }
      .toast.warn  { border-left-color: #fbbf24; }
      .toast.info  { border-left-color: #4ade80; }
      @keyframes slideIn { from { transform: translateX(120%); } to { transform: translateX(0); } }
      .toast-title { font-weight: 600; margin-bottom: 4px; }
      .toast-message { font-size: 13px; color: #cbd5e1; }
    `;
    document.head.appendChild(style);
  }

  // ============================================================
  //  菜单事件绑定（主进程 -> 渲染进程）
  // ============================================================

  bindMenuEvents() {
    // 菜单点击 - 调用后端 API
    if (window.stackrunMenu) {
      window.stackrunMenu.onInvoke((data) => {
        this.handleMenuInvoke(data);
      });
      // 帮助菜单 - 列出工具
      window.stackrunMenu.onListTools(() => {
        this.showToolList();
      });
      // 组件菜单 - 安装组件
      window.stackrunMenu.onInstallComponents(() => {
        this.showInstallComponentsDialog();
      });
    } else {
      console.warn('[Components] stackrunMenu not available, menu events will not work');
    }
  }

  async handleMenuInvoke({ method, params, label }) {
    this.app.log('INFO', `菜单触发: ${label || method}`);
    this.showToast({ level: 'info', title: label || method, message: t('home.loading') });

    // 1. 取当前选中容器
    const container = this.app.selectedContainer;
    const finalParams = { ...(params || {}) };
    // 移除前端标记字段
    const alreadyConfirmed = finalParams.already_confirmed === true;
    delete finalParams.already_confirmed;
    if (container && !finalParams.container_id && !finalParams.id) {
      finalParams.container_id = container.id;
    }

    // 2. 高危操作需要 confirm_token
    if (method === 'container.simulateRestart') {
      if (!alreadyConfirmed) {
        const ok = confirm(`确定要执行 "${label}" 吗？\n（这是一个高危操作）`);
        if (!ok) {
          this.app.log('WARN', `用户取消高危操作: ${label}`);
          return;
        }
      }
      finalParams.confirm_token = await this.generateConfirmToken(finalParams.container_id);
    }

    // 3. 调用后端
    const result = await api.call(method, finalParams);

    if (result.success) {
      this.app.log('INFO', `${label} 成功: ${JSON.stringify(result.result)}`);
      this.showToast({ level: 'info', title: label || method, message: t('dialog.confirm') });

      // 特殊：组件安装需要切到进度面板
      if (method === 'container.installComponents' && result.result && result.result.task_id) {
        this.trackInstallTask(result.result, finalParams);
      }
      // 特殊：列出已安装组件
      if (method === 'container.listInstalledComponents' && result.result) {
        this.showInstalledComponents(result.result);
      }
      // 特殊：刷新容器
      if (method === 'container.refresh' && this.app.refreshContainers) {
        await this.app.refreshContainers();
      }
    } else {
      this.app.log('ERROR', `${label} 失败: ${result.error}`);
      this.showToast({ level: 'error', title: label || method, message: result.error || 'Failed' });
    }
  }

  /**
   * 生成 confirm_token（与后端 tool_policy_check 配套）
   *
   * 后端校验规则：
   *   token 格式 = "DEEPX_CONFIRM:<unix_timestamp>:<sha256(prefix)[:16]>"
   *   ts 与当前时间差不超过 60 秒
   *
   * 这里是简化实现：使用 crypto.subtle 计算 SHA-256
   */
  async generateConfirmToken(containerId) {
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

  // ============================================================
  //  监听后端 progress 推送
  // ============================================================

  subscribeProgress() {
    window.stackrun.onProgress((data) => {
      this.handleProgress(data);
    });
  }

  /**
   * 处理 progress 事件
   * 后端 danger_tools.c 推送格式：
   *   { type:"progress", task_id, status, progress, message, ... }
   */
  handleProgress(data) {
    if (!data) return;

    // 安装任务进度
    if (data.type === 'progress' && data.task_id && this.installTasks.has(data.task_id)) {
      const task = this.installTasks.get(data.task_id);
      task.status = data.status || task.status;
      task.progress = (data.progress !== undefined) ? data.progress : task.progress;
      task.message = data.message || task.message;
      task.lastUpdate = Date.now();
      if (data.exit_code !== undefined) task.exitCode = data.exit_code;

      this.app.log(this._progressLogLevel(data.status), `[install ${data.task_id}] ${data.message || data.status}`);

      // 更新面板
      this.renderInstallPanel();

      // 终态时清理
      if (data.status === 'success' || data.status === 'failed') {
        setTimeout(() => {
          // 保留 30 秒让用户查看
          setTimeout(() => {
            this.installTasks.delete(data.task_id);
            this.renderInstallPanel();
            // 终态：刷新已安装列表
            if (data.status === 'success' && task.containerId) {
              api.listInstalledComponents({ container_id: task.containerId });
            }
          }, 30000);
        }, 100);
      }
      return;
    }

    // 其它 progress：通用处理（保留旧逻辑）
    this.app.stateManager?.setProgress?.({
      task: data.task_id || data.task,
      percent: data.progress || data.percent,
      stage: data.stage || data.message
    });
  }

  _progressLogLevel(status) {
    if (status === 'failed') return 'ERROR';
    if (status === 'success') return 'INFO';
    return 'INFO';
  }

  // ============================================================
  //  安装组件 UI
  // ============================================================

  /**
   * 显示"安装组件"对话框
   * 让用户选容器 + 输入组件名
   */
  showInstallComponentsDialog() {
    const containers = this.app.stateManager?.get('containers') || [];
    if (containers.length === 0) {
      this.showToast({ level: 'warn', title: '无可用工作区', message: '请先创建工作区' });
      return;
    }

    // 常见 winetricks 组件
    const common = [
      { name: 'vcrun6sp6',   desc: 'VC++ 6.0 SP6' },
      { name: 'vcrun2019',   desc: 'VC++ 2015-2019' },
      { name: 'dxvk',        desc: 'D3D9/10/11 over Vulkan' },
      { name: 'vkd3d',       desc: 'D3D12 over Vulkan' },
      { name: 'd3dx9',       desc: 'D3D9 runtime' },
      { name: 'd3dx11_43',   desc: 'D3D11 4.3' },
      { name: 'dotnet48',    desc: '.NET Framework 4.8' },
      { name: 'dotnet472',   desc: '.NET Framework 4.7.2' },
      { name: 'xna40',       desc: 'XNA 4.0' },
      { name: 'physx',       desc: 'PhysX' },
      { name: 'quartz',      desc: 'Quartz (DirectShow)' },
      { name: 'wmp9',        desc: 'Windows Media Player 9' }
    ];

    const containerOptions = containers.map(c =>
      `<option value="${this.escapeHtml(c.id)}">${this.escapeHtml(c.name)}</option>`
    ).join('');

    const componentChips = common.map(c =>
      `<span class="component-chip" data-component="${c.name}" title="${c.desc}">${c.name}</span>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.className = 'wizard-overlay';
    overlay.id = 'installDialogOverlay';
    overlay.innerHTML = `
      <div class="wizard" style="width:480px;">
        <div class="wizard-header">
          <h3>安装组件</h3>
          <button class="wizard-close" id="installDialogClose">×</button>
        </div>
        <div class="wizard-content">
          <div class="wizard-form-group">
            <label>选择工作区</label>
            <select class="wizard-select" id="installContainerId">${containerOptions}</select>
          </div>
          <div class="wizard-form-group">
            <label>常用组件（点击选择）</label>
            <div class="component-list" id="commonComponents">${componentChips}</div>
          </div>
          <div class="wizard-form-group">
            <label>组件名（空格分隔，多个）</label>
            <input class="wizard-input" id="installComponentsInput"
                   placeholder="例如: vcrun2019 dxvk dotnet48" />
          </div>
          <div class="wizard-form-group" style="display:flex;align-items:center;">
            <input type="checkbox" id="installForceCheckbox" style="margin-right:8px;" />
            <label for="installForceCheckbox" style="margin:0;font-size:13px;color:#94a3b8;">强制安装（覆盖已安装的组件）</label>
          </div>
          <div style="background:#1a1a2e;padding:12px;border-radius:6px;margin-top:8px;">
            <div style="color:#94a3b8;font-size:12px;line-height:1.6;">
              该安装组件功能和下载的组件来源于互联网，请确保先联网并遵循相关协议：
              <a href="https://www.tldrlegal.com/license/gnu-lesser-general-public-license-v2-1-lgpl-2-1" 
                 style="color:#e94560;text-decoration:none;margin-left:8px;font-size:12px;"
                 target="_blank" id="licenseLink">📄 查看协议</a>
            </div>
          </div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary" id="installDialogCancel">取消</button>
          <button class="btn btn-primary" id="installDialogConfirm">安装</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#installDialogClose').onclick = close;
    overlay.querySelector('#installDialogCancel').onclick = close;
    
    overlay.querySelector('#licenseLink').onclick = (e) => {
      e.preventDefault();
      const url = 'https://www.tldrlegal.com/license/gnu-lesser-general-public-license-v2-1-lgpl-2-1';
      if (window.require) {
        const { shell } = window.require('electron');
        shell.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    };

    // chip 点击 -> 加入输入框
    overlay.querySelectorAll('#commonComponents .component-chip').forEach(chip => {
      chip.onclick = () => {
        const name = chip.getAttribute('data-component');
        const input = overlay.querySelector('#installComponentsInput');
        const cur = input.value.trim();
        if (cur.split(/\s+/).includes(name)) return;
        input.value = cur ? `${cur} ${name}` : name;
        chip.classList.add('installed');
      };
    });

    overlay.querySelector('#installDialogConfirm').onclick = async () => {
      const containerId = overlay.querySelector('#installContainerId').value;
      const components = overlay.querySelector('#installComponentsInput').value.trim();
      const force = overlay.querySelector('#installForceCheckbox').checked;
      if (!components) {
        this.showToast({ level: 'warn', title: '请输入组件名', message: '' });
        return;
      }
      close();
      await this.invokeInstall({ container_id: containerId, components, force });
    };
  }

  /**
   * 调用后端安装组件 API
   */
  async invokeInstall(params) {
    params.confirm_token = await this.generateConfirmToken(params.container_id);

    this.app.log('INFO', `开始安装组件: ${params.components} (工作区 ${params.container_id})`);
    this.showToast({ level: 'info', title: '安装组件', message: `已提交: ${params.components}` });

    const result = await api.installComponents(params);

    if (result.success && result.result) {
      if (result.result.need_confirm && result.result.already_installed) {
        const alreadyList = result.result.already_installed.join(', ');
        const confirmed = await this.showConfirmDialog(
          '组件已安装',
          `以下组件已安装: ${alreadyList}\n是否继续强制安装？`
        );
        if (confirmed) {
          params.force = true;
          params.confirm_token = await this.generateConfirmToken(params.container_id);
          const retryResult = await api.installComponents(params);
          if (retryResult.success && retryResult.result && retryResult.result.task_id) {
            this.trackInstallTask(retryResult.result, params);
          } else {
            this.showToast({ level: 'error', title: '安装失败', message: retryResult.error || '' });
          }
        }
        return;
      }
      
      if (result.result.task_id) {
        this.trackInstallTask(result.result, params);
      } else {
        this.showToast({ level: 'error', title: '安装失败', message: result.result.message || '' });
      }
    } else {
      this.app.log('ERROR', `安装失败: ${result.error || JSON.stringify(result)}`);
      this.showToast({ level: 'error', title: '安装失败', message: result.error || '' });
    }
  }

  /**
   * 显示确认对话框
   */
  showConfirmDialog(title, message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'wizard-overlay';
      overlay.innerHTML = `
        <div class="wizard" style="width:360px;">
          <div class="wizard-header">
            <h3>${title}</h3>
          </div>
          <div class="wizard-content">
            <div style="color:#94a3b8;font-size:14px;white-space:pre-line;">${message}</div>
          </div>
          <div class="wizard-footer">
            <button class="btn btn-secondary" id="confirmNo">取消</button>
            <button class="btn btn-primary" id="confirmYes">强制安装</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#confirmNo').onclick = () => {
        overlay.remove();
        resolve(false);
      };
      overlay.querySelector('#confirmYes').onclick = () => {
        overlay.remove();
        resolve(true);
      };
    });
  }

  /**
   * 注册安装任务用于进度追踪
   */
  trackInstallTask(taskResult, params) {
    const taskId = taskResult.task_id;
    if (!taskId) return;
    this.installTasks.set(taskId, {
      taskId,
      containerId: params.container_id,
      components: params.components,
      status: 'running',
      progress: 0,
      message: '已提交，等待启动...',
      createdAt: Date.now()
    });
    this.renderInstallPanel();
  }

  /**
   * 渲染安装进度面板
   */
  renderInstallPanel() {
    let panel = document.getElementById('installPanel');
    if (this.installTasks.size === 0) {
      if (panel) panel.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'installPanel';
      panel.className = 'install-panel';
      const content = document.getElementById('contentBody');
      if (content) content.prepend(panel);
    }
    const tasks = Array.from(this.installTasks.values());
    panel.innerHTML = `
      <div class="install-panel-header">
        <div class="install-panel-title">📦 组件安装进度 (${tasks.length})</div>
        <button class="install-panel-close" id="installPanelClose" title="关闭">×</button>
      </div>
      <div id="installTaskList">
        ${tasks.map(t => this._renderInstallTask(t)).join('')}
      </div>
    `;
    panel.querySelector('#installPanelClose').onclick = () => {
      this.installTasks.clear();
      this.renderInstallPanel();
    };
    panel.querySelectorAll('.install-task-cancel').forEach(btn => {
      btn.onclick = async () => {
        const tid = btn.getAttribute('data-task-id');
        btn.disabled = true;
        const r = await api.taskCancel({ taskId: tid });
        this.app.log('INFO', `取消任务 ${tid}: ${JSON.stringify(r)}`);
      };
    });
  }

  _renderInstallTask(t) {
    const pct = Math.max(0, Math.min(100, t.progress || 0));
    const statusClass = t.status || 'pending';
    return `
      <div class="install-task" data-task-id="${t.taskId}">
        <div class="install-task-header">
          <span class="install-task-name">
            🔧 ${this.escapeHtml(t.components)}
            <button class="install-task-cancel" data-task-id="${t.taskId}"
                    ${t.status === 'success' || t.status === 'failed' ? 'disabled' : ''}>取消</button>
          </span>
          <span class="install-task-status ${statusClass}">${this._statusLabel(t.status)}</span>
        </div>
        <div class="install-task-components">工作区: ${this.escapeHtml(t.containerId || '-')}</div>
        <div class="install-task-progress-bar">
          <div class="install-task-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="install-task-message">${this.escapeHtml(t.message || '')}</div>
      </div>
    `;
  }

  _statusLabel(s) {
    switch (s) {
      case 'running': return '进行中';
      case 'success': return '完成';
      case 'failed':  return '失败';
      case 'pending': return '等待';
      default:        return s;
    }
  }

  // ============================================================
  //  已安装组件列表
  // ============================================================

  showInstalledComponents(data) {
    const container = this.app.selectedContainer;
    const contentBody = document.getElementById('contentBody');
    if (!contentBody) return;

    const components = data.components || [];
    const count = data.count || components.length;
    const chips = components.map(c => `<span class="component-chip installed">${this.escapeHtml(c)}</span>`).join('') ||
      '<span style="color:#94a3b8">（无已安装组件）</span>';

    contentBody.innerHTML = `
      <div class="app-detail">
        <div class="app-detail-header">
          <div class="app-detail-icon">📦</div>
          <div class="app-detail-title">
            <h2>${this.escapeHtml(container ? container.name : '工作区')} - 已安装组件</h2>
            <span class="badge stopped">共 ${count} 个</span>
          </div>
        </div>
        <div class="app-detail-section">
          <div class="component-chip-header">
            <h4>组件列表 (${count})</h4>
            <button class="component-chip-refresh" id="refreshComponents">刷新</button>
          </div>
          <div class="component-list">${chips}</div>
        </div>
      </div>
    `;
    const refresh = document.getElementById('refreshComponents');
    if (refresh) refresh.onclick = () => this.handleMenuInvoke({
      method: 'container.listInstalledComponents', params: {}, label: '刷新已安装组件'
    });
  }

  // ============================================================
  //  工具列表 (Tool Discovery)
  // ============================================================

  async showToolList() {
    // 通过自定义事件从主进程读 dserver 内置的 tool list
    // 这里模拟一个静态展示（真实应通过 dserver JSON-RPC 拉取）
    const tools = [
      { name: 'container.openRegistry',       danger: 'MEDIUM' },
      { name: 'container.openCommandLine',    danger: 'MEDIUM' },
      { name: 'container.openCDrive',         danger: 'MEDIUM' },
      { name: 'container.openControlPanel',   danger: 'MEDIUM' },
      { name: 'container.openTaskManager',    danger: 'MEDIUM' },
      { name: 'container.openInternetOptions',danger: 'MEDIUM' },
      { name: 'container.openGameController', danger: 'MEDIUM' },
      { name: 'container.installComponents',  danger: 'HIGH'   },
      { name: 'container.simulateRestart',    danger: 'HIGH'   },
      { name: 'container.setVirtualDesktop',  danger: 'MEDIUM' },
      { name: 'container.setDisplaySystem',   danger: 'MEDIUM' },
      { name: 'container.setUiScale',         danger: 'MEDIUM' },
      { name: 'container.setGraphicsBackend', danger: 'MEDIUM' },
      { name: 'container.setWindowMode',      danger: 'MEDIUM' },
      { name: 'container.setWindowDecoration',danger: 'MEDIUM' },
      { name: 'container.refresh',            danger: 'LOW'    },
      { name: 'container.listInstalledComponents', danger: 'LOW' },
      { name: 'ping',                         danger: 'LOW'    }
    ];

    const contentBody = document.getElementById('contentBody');
    if (!contentBody) return;
    contentBody.innerHTML = `
      <div class="app-detail">
        <div class="app-detail-header">
          <div class="app-detail-icon">🛠</div>
          <div class="app-detail-title">
            <h2>Tool Runtime - 已注册工具</h2>
            <span class="badge stopped">共 ${tools.length} 个 Tool</span>
          </div>
        </div>
        <div class="app-detail-section">
          <h4>说明</h4>
          <p style="color:#cbd5e1;line-height:1.6">
            以下是 dserver 进程内已注册的全部 Tool（来自 Tool Runtime）。<br/>
            Electron UI 通过 JSON-RPC 调度这些 Tool；<br/>
            <span style="color:#fbbf24">HIGH</span> 级别 Tool 需要 confirm_token 二次确认。
          </p>
        </div>
        <div class="app-detail-section">
          <h4>工具列表</h4>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="text-align:left;color:#94a3b8;font-size:12px">
                <th style="padding:8px;border-bottom:1px solid #0f3460">方法名</th>
                <th style="padding:8px;border-bottom:1px solid #0f3460">危险级别</th>
              </tr>
            </thead>
            <tbody>
              ${tools.map(t => `
                <tr>
                  <td style="padding:8px;border-bottom:1px solid #0f3460;font-family:monospace">${t.name}</td>
                  <td style="padding:8px;border-bottom:1px solid #0f3460">
                    <span class="install-task-status ${t.danger === 'HIGH' ? 'failed' : t.danger === 'MEDIUM' ? 'running' : 'success'}">${t.danger}</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ============================================================
  //  Toast 通知
  // ============================================================

  showToast({ level = 'info', title, message, duration = 3500 }) {
    const toast = document.createElement('div');
    toast.className = `toast ${level}`;
    toast.innerHTML = `
      <div class="toast-title">${this.escapeHtml(title || '')}</div>
      ${message ? `<div class="toast-message">${this.escapeHtml(message)}</div>` : ''}
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ============================================================
  //  容器详情 (保持原有)
  // ============================================================

  renderAppDetail(container) {
    return `
      <div class="app-detail">
        <div class="app-detail-header">
          <div class="app-detail-icon">📦</div>
          <div class="app-detail-title">
            <h2>${this.escapeHtml(container.name)}</h2>
            <span class="badge ${container.status === 'running' ? 'running' : 'stopped'}">
              ${container.status === 'running' ? '运行中' : '已停止'}
            </span>
          </div>
        </div>
        <div class="app-detail-section">
          <h4>信息</h4>
          <p><strong>工作区 ID:</strong> ${this.escapeHtml(container.id)}</p>
          <p><strong>路径:</strong> ${this.escapeHtml(container.prefix_path || container.path || 'N/A')}</p>
          ${container.description ? `<p><strong>描述:</strong> ${this.escapeHtml(container.description)}</p>` : ''}
        </div>
        <div class="app-detail-section">
          <h4>操作</h4>
          <div class="app-detail-actions">
            <button class="btn btn-primary" id="actionRun" ${container.status === 'running' ? 'disabled' : ''}>运行</button>
            <button class="btn btn-secondary" id="actionStop" ${container.status !== 'running' ? 'disabled' : ''}>停止</button>
            <button class="btn btn-secondary" id="actionSettings">设置</button>
            <button class="btn btn-secondary" id="actionViewComponents">已安装组件</button>
            <button class="btn btn-danger" id="actionDelete">删除</button>
          </div>
        </div>
      </div>
    `;
  }

  bindAppDetailEvents(container) {
    const containerId = container.id;
    // 标记当前选中容器（用于菜单调用时附 container_id）
    this.app.selectedContainer = container;

    const runBtn = document.getElementById('actionRun');
    if (runBtn) {
      runBtn.onclick = async () => {
        const result = await api.containerStart({ id: containerId });
        if (result.success) this.app.refreshContainers();
        this.showToast({
          level: result.success ? 'info' : 'error',
          title: '运行工作区',
          message: result.success ? '已启动' : (result.error || '失败')
        });
      };
    }
    const stopBtn = document.getElementById('actionStop');
    if (stopBtn) {
      stopBtn.onclick = async () => {
        const result = await api.containerStop({ id: containerId });
        if (result.success) this.app.refreshContainers();
        this.showToast({
          level: result.success ? 'info' : 'error',
          title: '停止工作区',
          message: result.success ? '已停止' : (result.error || '失败')
        });
      };
    }
    const deleteBtn = document.getElementById('actionDelete');
    if (deleteBtn) {
      deleteBtn.onclick = async () => {
        if (!confirm(`确定要删除 "${container.name}" 吗？`)) return;
        const result = await api.containerDelete({ id: containerId });
        if (result.success) {
          this.app.refreshContainers();
          this.showToast({ level: 'info', title: '删除成功', message: '' });
        } else {
          this.showToast({ level: 'error', title: '删除失败', message: result.error || '' });
        }
      };
    }
    const settingsBtn = document.getElementById('actionSettings');
    if (settingsBtn) {
      settingsBtn.onclick = () => {
        this.showContainerSettingsDialog(container);
      };
    }
    const viewComponentsBtn = document.getElementById('actionViewComponents');
    if (viewComponentsBtn) {
      viewComponentsBtn.onclick = () => this.handleMenuInvoke({
        method: 'container.listInstalledComponents',
        params: { container_id: containerId },
        label: '已安装组件'
      });
    }
  }

  /**
   * 容器设置弹窗（图形后端 / DPI / 窗口模式等）
   */
  showContainerSettingsDialog(container) {
    const containerId = container.id;
    const overlay = document.createElement('div');
    overlay.className = 'wizard-overlay';
    overlay.innerHTML = `
      <div class="wizard" style="width:520px">
        <div class="wizard-header">
          <h3>工作区设置 - ${this.escapeHtml(container.name)}</h3>
          <button class="wizard-close" id="settingsClose">×</button>
        </div>
        <div class="wizard-content">
          <div class="wizard-form-group">
            <label>图形后端 (graphics_backend)</label>
            <select class="wizard-select" id="setGraphics">
              <option value="gl">gl (OpenGL)</option>
              <option value="vulkan">vulkan</option>
              <option value="dxvk">dxvk (推荐)</option>
              <option value="d3d11">d3d11</option>
              <option value="d3d9">d3d9</option>
              <option value="gdi">gdi (软件)</option>
            </select>
          </div>
          <div class="wizard-form-group">
            <label>界面缩放 (DPI, 50-400)</label>
            <input class="wizard-input" id="setDpi" type="number" min="50" max="400" value="96" />
          </div>
          <div class="wizard-form-group">
            <label>窗口模式</label>
            <select class="wizard-select" id="setWindowMode">
              <option value="fullscreen">fullscreen (全屏)</option>
              <option value="windowed">windowed (窗口)</option>
              <option value="borderless">borderless (无边框)</option>
            </select>
          </div>
          <div class="wizard-form-group">
            <label>显示系统</label>
            <select class="wizard-select" id="setDisplay">
              <option value="x11">x11</option>
              <option value="wayland">wayland</option>
            </select>
          </div>
          <div class="wizard-form-group">
            <label><input type="checkbox" id="setVirtualDesktop" /> 启用虚拟桌面</label>
          </div>
          <div class="wizard-form-group">
            <label><input type="checkbox" id="setWindowDecoration" checked /> 启用窗口装饰</label>
          </div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn-secondary" id="settingsCancel">取消</button>
          <button class="btn btn-primary" id="settingsApply">应用</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#settingsClose').onclick = close;
    overlay.querySelector('#settingsCancel').onclick = close;
    overlay.querySelector('#settingsApply').onclick = async () => {
      const calls = [
        api.setGraphicsBackend({ container_id: containerId, value: overlay.querySelector('#setGraphics').value }),
        api.setUiScale({ container_id: containerId, dpi: parseInt(overlay.querySelector('#setDpi').value, 10) }),
        api.setWindowMode({ container_id: containerId, value: overlay.querySelector('#setWindowMode').value }),
        api.setDisplaySystem({ container_id: containerId, value: overlay.querySelector('#setDisplay').value }),
        api.setVirtualDesktop({ container_id: containerId, enabled: overlay.querySelector('#setVirtualDesktop').checked ? 1 : 0 }),
        api.setWindowDecoration({ container_id: containerId, enabled: overlay.querySelector('#setWindowDecoration').checked ? 1 : 0 })
      ];
      const results = await Promise.all(calls);
      const failed = results.filter(r => !r.success);
      if (failed.length === 0) {
        this.showToast({ level: 'info', title: '已应用', message: '所有设置已更新' });
        close();
      } else {
        this.showToast({ level: 'error', title: '部分失败', message: failed.map(f => f.error).join('; ') });
      }
    };
  }

  // ============================================================
  //  工具
  // ============================================================

  updateProgress(data) {
    const fill = document.getElementById('installProgress');
    const status = document.getElementById('progressStatus');
    if (fill) {
      const pct = data.progress !== undefined ? data.progress : (data.percent || 0);
      fill.style.width = `${pct}%`;
    }
    if (status) {
      status.textContent = data.stage || data.message || '处理中';
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

module.exports = { Components };
