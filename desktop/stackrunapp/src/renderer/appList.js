const api = require('./api');

class AppList {
  constructor(app) {
    this.app = app;
    this.container = document.getElementById('appList');
    this.selectedId = null;
  }

  render(containers) {
    this.container.innerHTML = '';
    containers.forEach(item => {
      const itemEl = this.createItem(item);
      this.container.appendChild(itemEl);
    });
  }

  createItem(item) {
    const el = document.createElement('div');
    el.className = 'app-item';
    const itemId = item.id;
    el.dataset.id = itemId;

    const iconEl = document.createElement('div');
    iconEl.className = 'app-item-icon';
    this.setIcon(iconEl, item);

    const infoEl = document.createElement('div');
    infoEl.className = 'app-item-info';
    infoEl.innerHTML = `
      <div class="app-item-name">${this.escapeHtml(item.name)}</div>
      <div class="app-item-status">${this.getStatusText(item)}</div>
    `;

    const badgeEl = document.createElement('span');
    badgeEl.className = `app-item-badge ${this.getStatusClass(item)}`;
    badgeEl.textContent = this.getStatusText(item);

    el.appendChild(iconEl);
    el.appendChild(infoEl);
    el.appendChild(badgeEl);

    el.addEventListener('click', () => {
      this.setSelected(itemId);
      this.app.selectApp(itemId);
    });

    el.addEventListener('dblclick', () => {
      this.handleRun(item);
    });

    return el;
  }

  handleRun(item) {
    const appId = item.guid || item.id;
    const containerId = item.container_id || item.id_cont;
    
    if (typeof window.launchApp === 'function') {
      window.launchApp(appId, containerId);
    } else if (typeof window.dserverCall === 'function') {
      if (typeof window.showToast === 'function') {
        window.showToast('正在启动应用...', 'info');
      }
      
      window.dserverCall('app.run', { appId }).then(async (result) => {
        const taskId = result && result.taskId;
        if (!taskId) {
          console.error('No taskId in app.run response');
          return;
        }
        
        const maxWaitMs = 15000;
        const pollInterval = 500;
        let waitedMs = 0;
        
        while (waitedMs < maxWaitMs) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          waitedMs += pollInterval;
          
          try {
            const statusResult = await window.dserverCall('task.status', { taskId });
            const task = statusResult && (statusResult.status ? statusResult : null);
            
            if (task) {
              if (task.status === 'completed') {
                console.log('App launched successfully');
                if (typeof window.showToast === 'function') {
                  window.showToast('应用已启动', 'success');
                }
                return;
              } else if (task.status === 'failed' || task.status === 'cancelled') {
                console.error('App launch failed:', task.error_message || task.message);
                if (typeof window.showToast === 'function') {
                  window.showToast(task.error_message || '应用启动失败', 'error');
                }
                return;
              }
            }
          } catch (err) {}
        }
        
        console.log('App launch timeout');
        if (typeof window.showToast === 'function') {
          window.showToast('应用启动超时', 'warning');
        }
      }).catch(err => {
        console.error('Failed to launch app:', err);
        if (typeof window.showToast === 'function') {
          window.showToast('应用启动失败', 'error');
        }
      });
    } else {
      console.error('launchApp function not available');
    }
  }

  setIcon(iconEl, item) {
    if (item.icon_path && item.icon_path.length > 0) {
      iconEl.style.backgroundImage = `url('${item.icon_path}')`;
      iconEl.style.backgroundSize = 'cover';
      iconEl.style.backgroundPosition = 'center';
      iconEl.textContent = '';
    } else {
      iconEl.textContent = '📦';
    }
  }

  getStatusClass(item) {
    if (item.status === 'running' || item.running) {
      return 'running';
    }
    return 'stopped';
  }

  getStatusText(item) {
    if (item.status === 'running' || item.running) {
      return '运行中';
    }
    return '已停止';
  }

  setSelected(id) {
    const items = this.container.querySelectorAll('.app-item');
    items.forEach(item => {
      if (item.dataset.id === id) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
    this.selectedId = id;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

module.exports = { AppList };
