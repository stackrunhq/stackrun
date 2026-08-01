const api = require('./api');

class AppItem {
  constructor(container, app) {
    this.container = container;
    this.appData = app;
  }

  render() {
    const el = document.createElement('div');
    el.className = 'app-item-component';
    el.innerHTML = this.getTemplate();
    this.bindEvents(el);
    return el;
  }

  getTemplate() {
    const { name, id, running, exe_path } = this.appData;
    return `
      <div class="app-item-header">
        <span class="app-item-name">${this.escapeHtml(name)}</span>
        <span class="app-item-badge ${running ? 'running' : 'stopped'}">
          ${running ? '运行中' : '已停止'}
        </span>
      </div>
      <div class="app-item-path">${this.escapeHtml(exe_path || '未设置')}</div>
      <div class="app-item-actions">
        <button class="btn btn-primary run-btn" ${running ? 'disabled' : ''}>运行</button>
        <button class="btn btn-secondary stop-btn" ${!running ? 'disabled' : ''}>停止</button>
        <button class="btn btn-secondary uninstall-btn">卸载</button>
      </div>
    `;
  }

  bindEvents(el) {
    const runBtn = el.querySelector('.run-btn');
    const stopBtn = el.querySelector('.stop-btn');
    const uninstallBtn = el.querySelector('.uninstall-btn');

    runBtn.addEventListener('click', () => this.handleRun());
    stopBtn.addEventListener('click', () => this.handleStop());
    uninstallBtn.addEventListener('click', () => this.handleUninstall());
  }

  async handleRun() {
    try {
      const result = await api.wineRunExe({
        container: this.appData.id,
        exe: this.appData.exe_path
      });
      if (result.success) {
        this.appData.running = true;
        this.refresh();
      }
    } catch (err) {
      console.error('Run failed:', err);
    }
  }

  async handleStop() {
    try {
      const result = await api.containerStop({ container: this.appData.id });
      if (result.success) {
        this.appData.running = false;
        this.refresh();
      }
    } catch (err) {
      console.error('Stop failed:', err);
    }
  }

  async handleUninstall() {
    if (confirm(`确定要卸载应用 "${this.appData.name}" 吗？`)) {
      try {
        const result = await api.containerDelete({ container: this.appData.id });
        if (result.success) {
          window.stackrunApp.refreshContainers();
        }
      } catch (err) {
        console.error('Uninstall failed:', err);
      }
    }
  }

  refresh() {
    const parent = this.container.parentElement;
    const newItem = this.render();
    parent.replaceChild(newItem, this.container);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

module.exports = { AppItem };
