const api = require('./api');
const { Components } = require('./components');

class Wizard {
  constructor(app) {
    this.app = app;
    this.currentStep = 0;
    this.formData = {};
    this.container = null;
    this.taskId = null;
    this.taskPollTimer = null;
  }

  show() {
    this.createWizardUI();
    this.showStep(0);
  }

  createWizardUI() {
    this.container = document.createElement('div');
    this.container.className = 'wizard-overlay';
    this.container.innerHTML = this.getWizardTemplate();
    document.body.appendChild(this.container);
    this.bindWizardEvents();
  }

  getWizardTemplate() {
    return `
      <div class="wizard">
        <div class="wizard-header">
          <h3>添加应用</h3>
          <button class="wizard-close">&times;</button>
        </div>
        <div class="wizard-progress">
          <div class="wizard-step active" data-step="0">选择工作区</div>
          <div class="wizard-step" data-step="1">选择程序</div>
          <div class="wizard-step" data-step="2">确认安装</div>
        </div>
        <div class="wizard-content"></div>
        <div class="wizard-footer">
          <button class="btn btn-secondary prev-btn hidden">上一步</button>
          <button class="btn btn-primary next-btn">下一步</button>
        </div>
      </div>
    `;
  }

  bindWizardEvents() {
    const closeBtn = this.container.querySelector('.wizard-close');
    const prevBtn = this.container.querySelector('.prev-btn');
    const nextBtn = this.container.querySelector('.next-btn');

    closeBtn.addEventListener('click', () => this.close());
    prevBtn.addEventListener('click', () => this.prevStep());
    nextBtn.addEventListener('click', () => this.nextStep());

    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });
  }

  showStep(step) {
    this.currentStep = step;
    const steps = this.container.querySelectorAll('.wizard-step');
    const prevBtn = this.container.querySelector('.prev-btn');
    const nextBtn = this.container.querySelector('.next-btn');

    steps.forEach((s, i) => {
      s.classList.toggle('active', i === step);
      s.classList.toggle('completed', i < step);
    });

    prevBtn.classList.toggle('hidden', step === 0);
    nextBtn.textContent = step === 2 ? '安装' : '下一步';

    const content = this.container.querySelector('.wizard-content');
    content.innerHTML = this.getStepContent(step);
    this.bindStepEvents(step);
  }

  getStepContent(step) {
    switch (step) {
      case 0:
        return this.getStep0Content();
      case 1:
        return this.getStep1Content();
      case 2:
        return this.getStep2Content();
      default:
        return '';
    }
  }

  getStep0Content() {
    const containers = this.app.stateManager.get('containers') || [];
    const normalContainers = containers.filter(c => c.status !== 3);
    return `
      <div class="wizard-form-group">
        <label>选择工作区</label>
        <select class="wizard-select" id="wizardContainer">
          <option value="">-- 选择工作区 --</option>
          ${normalContainers.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-secondary" id="createContainerBtn">+ 创建新工作区</button>
    `;
  }

  getStep1Content() {
    return `
      <div class="wizard-form-group">
        <label>选择要安装/运行的程序</label>
        <input type="text" id="wizardExePath" class="wizard-input" placeholder="输入 .exe 文件路径">
        <button class="btn btn-secondary" id="browseExeBtn">浏览...</button>
      </div>
      <div class="wizard-form-group">
        <label>应用名称</label>
        <input type="text" id="wizardAppName" class="wizard-input" placeholder="输入应用名称">
      </div>
    `;
  }

  getStep2Content() {
    const { container, exePath, appName } = this.formData;
    return `
      <div class="wizard-summary">
        <h4>安装信息</h4>
        <div class="summary-item">
          <span class="summary-label">工作区:</span>
          <span class="summary-value">${this.escapeHtml(container)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">程序:</span>
          <span class="summary-value">${this.escapeHtml(exePath)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">名称:</span>
          <span class="summary-value">${this.escapeHtml(appName)}</span>
        </div>
      </div>
    `;
  }

  bindStepEvents(step) {
    if (step === 0) {
      const select = document.getElementById('wizardContainer');
      const createBtn = document.getElementById('createContainerBtn');
      if (select) {
        select.addEventListener('change', (e) => {
          this.formData.container = e.target.value;
        });
      }
      if (createBtn) {
        createBtn.addEventListener('click', () => this.createNewContainer());
      }
    } else if (step === 1) {
      const exeInput = document.getElementById('wizardExePath');
      const nameInput = document.getElementById('wizardAppName');
      if (exeInput) {
        exeInput.addEventListener('input', (e) => {
          this.formData.exePath = e.target.value;
          if (!this.formData.appName) {
            const name = e.target.value.split('/').pop().replace('.exe', '');
            nameInput.value = name;
            this.formData.appName = name;
          }
        });
      }
      if (nameInput) {
        nameInput.addEventListener('input', (e) => {
          this.formData.appName = e.target.value;
        });
      }
    }
  }

  async createNewContainer() {
    const name = prompt('请输入新工作区名称:');
    if (!name) return;

    try {
      const result = await api.containerCreate({ name });
      if (result.success) {
        this.app.log('INFO', `工作区 "${name}" 创建成功`);
        await this.app.refreshContainers();
        const containers = this.app.stateManager.get('containers') || [];
        const normalContainers = containers.filter(c => c.status !== 3);
        const select = document.getElementById('wizardContainer');
        if (select) {
          select.innerHTML = normalContainers.map(c =>
            `<option value="${c.id}">${c.name}</option>`
          ).join('');
          const newContainer = normalContainers.find(c => c.name === name);
          select.value = newContainer?.id || '';
          this.formData.container = select.value;
        }
      }
    } catch (err) {
      this.app.log('ERROR', `创建工作区失败: ${err.message}`);
    }
  }

  prevStep() {
    if (this.currentStep > 0) {
      this.showStep(this.currentStep - 1);
    }
  }

  async nextStep() {
    if (this.currentStep === 2) {
      await this.performInstall();
    } else if (this.currentStep < 2) {
      if (this.validateStep(this.currentStep)) {
        this.showStep(this.currentStep + 1);
      }
    }
  }

  validateStep(step) {
    if (step === 0 && !this.formData.container) {
      alert('请选择工作区');
      return false;
    }
    if (step === 1 && !this.formData.exePath) {
      alert('请输入程序路径');
      return false;
    }
    return true;
  }

  async performInstall(forceInstall = false) {
    try {
      this.showProgress();
      
      const result = await api.appInstall({
        containerId: this.formData.container,
        installerPath: this.formData.exePath,
        appType: this.formData.appType || 1,
        forceInstall: !!forceInstall
      });
      
      const taskId = (result && result.taskId) || (result && result.result && result.result.taskId);
      if (taskId) {
        this.taskId = taskId;
        this.startTaskPolling();
      } else if ((result && result.appExists) || (result?.result && result.result.appExists)) {
        const dup = result.appExists ? result : result.result;
        if (typeof this.hideProgress === 'function') this.hideProgress();
        await this.handleDuplicateApp(dup);
      } else {
        this.app.log('ERROR', `安装失败: ${result?.error || result?.message || (result?.result && result.result.message) || '未知错误'}`);
        this.close();
      }
    } catch (err) {
      this.app.log('ERROR', `安装失败: ${err.message}`);
      this.close();
    }
  }

  async handleDuplicateApp(errorResult) {
    const existingApp = errorResult.existingApp || {};
    const existingName = existingApp.name || existingApp.alias_name || '该应用';
    const confirmed = await new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
      const dialog = document.createElement('div');
      dialog.style.cssText = 'background:#fff;padding:24px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.2);max-width:420px;width:90%;';
      dialog.innerHTML = `
        <h4 style="margin:0 0 12px;font-size:16px;">应用已存在</h4>
        <p style="margin:0 0 8px;color:#444;font-size:14px;">${existingName} 已经安装，确认是否重复添加？</p>
        <p style="margin:0 0 20px;color:#888;font-size:13px;">应用路径: ${this.escapeHtml(this.formData.exePath)}</p>
        <div style="display:flex;justify-content:flex-end;gap:12px;">
          <button class="btn btn-secondary cancel-btn" type="button">取消</button>
          <button class="btn btn-primary confirm-btn" type="button">确认添加</button>
        </div>
      `;
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      dialog.querySelector('.cancel-btn').addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(false);
      });
      dialog.querySelector('.confirm-btn').addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(true);
      });
    });
    
    if (confirmed) {
      this.taskId = null;
      this.stopTaskPolling();
      await this.performInstall(true);
    } else {
      this.close();
    }
  }

  startTaskPolling() {
    this.taskPollTimer = setInterval(async () => {
      try {
        const result = await api.taskStatus({ taskId: this.taskId });
        if (result.success && result.result) {
          const task = result.result;
          this.updateProgress(task);
          
          const globalTaskManager = window.taskManager;
          if (globalTaskManager && this.taskId) {
            const updates = {
              progress: typeof task.progress === 'number' ? task.progress : 0,
              stage: task.stage || task.task_stage || '',
              message_key: task.message_key || task.task_message_key || '',
              message: task.message || task.task_message || ''
            };
            if (task.status) updates.status = task.status;
            if (task.error_message) updates.error_message = task.error_message;
            if (task.result) updates.result = task.result;
            if (task.container_id) updates.container_id = String(task.container_id);
            if (task.app_id) updates.app_id = String(task.app_id);
            globalTaskManager.updateTask(this.taskId, updates);
          }
          
          if (task.status === 'completed') {
            this.app.log('INFO', '安装成功');
            this.stopTaskPolling();
            if (globalTaskManager && this.taskId) {
              globalTaskManager.updateTask(this.taskId, { status: 'completed', progress: 100 });
              try { globalTaskManager.onTaskTerminal(this.taskId); } catch (e) {}
            }
            this.close();
            await this.app.refreshContainers();
          } else if (task.status === 'failed') {
            let errorResult = null;
            try {
              if (task.result && typeof task.result === 'string') {
                errorResult = JSON.parse(task.result);
              } else if (task.result && typeof task.result === 'object') {
                errorResult = task.result;
              }
            } catch (e) { errorResult = null; }

            if (errorResult && errorResult.appExists) {
              this.stopTaskPolling();
              await this.handleDuplicateApp(errorResult);
            } else {
              this.app.log('ERROR', `安装失败: ${task.error || task.error_message || task.message || '未知错误'}`);
              this.stopTaskPolling();
              if (globalTaskManager && this.taskId) {
                globalTaskManager.updateTask(this.taskId, { 
                  status: 'failed', 
                  error_message: task.error || task.error_message || task.message || '' 
                });
                try { globalTaskManager.onTaskTerminal(this.taskId); } catch (e) {}
              }
              this.close();
            }
          } else if (task.status === 'cancelled') {
            this.app.log('INFO', '安装已取消');
            this.stopTaskPolling();
            if (globalTaskManager && this.taskId) {
              globalTaskManager.updateTask(this.taskId, { status: 'cancelled' });
              try { globalTaskManager.onTaskTerminal(this.taskId); } catch (e) {}
            }
            this.close();
          }
        }
      } catch (err) {
        console.error('任务轮询失败:', err);
      }
    }, 2000);
  }

  stopTaskPolling() {
    if (this.taskPollTimer) {
      clearInterval(this.taskPollTimer);
      this.taskPollTimer = null;
    }
  }

  updateProgress(task) {
    const fill = document.getElementById('installProgress');
    const status = document.getElementById('progressStatus');
    if (fill) {
      fill.style.width = `${task.progress || 0}%`;
    }
    if (status) {
      status.textContent = task.message || '处理中';
    }
  }

  showProgress() {
    const content = this.container.querySelector('.wizard-content');
    content.innerHTML = `
      <div class="wizard-progress-view">
        <div class="progress-text">正在安装...</div>
        <div class="progress-bar">
          <div class="progress-bar-fill" id="installProgress" style="width: 0%"></div>
        </div>
        <div class="progress-status" id="progressStatus">准备中</div>
      </div>
    `;
  }

  close() {
    this.stopTaskPolling();
    if (this.container) {
      document.body.removeChild(this.container);
      this.container = null;
    }
    this.currentStep = 0;
    this.formData = {};
    this.taskId = null;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

module.exports = { Wizard };
