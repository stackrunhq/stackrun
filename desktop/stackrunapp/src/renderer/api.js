/**
 * 栈行平台 前端 API 封装层
 *
 * 架构定位：
 *   - 对应后端 Tool Runtime（统一 JSON-RPC 接口）
 *   - 所有菜单/UI 操作都通过这里调用
 *   - Tool = 后端的一个 C 函数
 *
 * 命名约定：
 *   - wine.*          Wine 容器控制类
 *   - system.*        Windows 工具类（wine regedit/cmd/explorer 等）
 *   - container.*     容器配置类
 *   - install.*       高危类（带 confirm_token）
 *
 * 返回约定：
 *   - 所有方法返回 { success, result?, error? }
 *   - success=false 表示请求失败（含网络错误、后端错误、policy 拒绝等）
 *   - success=true 表示请求被处理，result 是后端返回数据
 */

class API {
  constructor() {
    this.initialized = false;
  }

  /**
   * 通用调用
   */
  async call(method, params) {
    try {
      const timeoutMs = 120000;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`${method} 调用超时 (${timeoutMs / 1000}s)`)), timeoutMs);
      });
      const result = await Promise.race([
        window.stackrun.call(method, params || {}),
        timeoutPromise
      ]);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ============================================================
  //  Container 管理（保持原有）
  // ============================================================

  async containerList() {
    return this.call('container.list', {});
  }

  async containerCreate(params) {
    return this.call('container.create', params);
  }

  async containerDelete(params) {
    return this.call('container.delete', params);
  }

  async containerStop(params) {
    return this.call('container.stop', params);
  }

  async containerStart(params) {
    return this.call('container.start', params);
  }

  async containerClone(params) {
    return this.call('container.clone', params);
  }

  async containerExport(params) {
    return this.call('container.export', params);
  }

  async containerImport(params) {
    return this.call('container.import', params);
  }

  // ============================================================
  //  App 管理
  // ============================================================

  async appList(params) {
    return this.call('app.list', params);
  }

  async appInstall(params) {
    return this.call('app.install', params);
  }

  async appUninstall(params) {
    return this.call('app.uninstall', params);
  }

  async appRun(params) {
    return this.call('app.run', params);
  }

  async appDelete(params) {
    return this.call('app.delete', params);
  }

  async appUpdate(params) {
    return this.call('app.update', params);
  }

  /** 检查应用是否已安装（通过文件路径） */
  async appCheckInstalled(params) {
    return this.call('app.checkInstalled', params);
  }

  // ============================================================
  //  Wine 控制类 (基础操作 - 关闭工作区应用、运行EXE等)
  //  对应后端 tool_runtime 中的 wine.* 工具
  // ============================================================

  /** 关闭工作区应用 (wine.wineboot_kill) */
  async closeContainerApps(params) {
    return this.call('wine.wineboot_kill', params || {});
  }

  /** 打开系统 C 盘 (wine.explorer_cdrive) */
  async openSystemCDrive(params) {
    return this.call('wine.explorer_cdrive', params || {});
  }

  /** 注册表编辑器 (wine.regedit) */
  async openRegistry(params) {
    return this.call('wine.regedit', params || {});
  }

  /** 命令提示符 (wine.cmd) */
  async openCommandLine(params) {
    return this.call('wine.cmd', params || {});
  }

  /** Internet 选项 (wine.internet_options) */
  async openInternetOptions(params) {
    return this.call('wine.internet_options', params || {});
  }

  /** 游戏控制器 (wine.game_controller) */
  async openGameController(params) {
    return this.call('wine.game_controller', params || {});
  }

  /** 控制面板 (wine.control_panel) */
  async openControlPanel(params) {
    return this.call('wine.control_panel', params || {});
  }

  /** 任务管理器 (wine.task_manager) */
  async openTaskManager(params) {
    return this.call('wine.task_manager', params || {});
  }

  /** 运行 EXE (wine.run_exe) */
  async wineRunExe(params) {
    return this.call('wine.run_exe', params);
  }

  /** 安装 EXE (wine.install_exe) */
  async wineInstallExe(params) {
    return this.call('wine.install_exe', params);
  }

  /** 注册 MSI (wine.register_msi) */
  async wineRegisterMsi(params) {
    return this.call('wine.register_msi', params);
  }

  // ============================================================
  //  容器设置 (container.*)
  // ============================================================

  /** 虚拟桌面 */
  async setVirtualDesktop(params) {
    return this.call('container.set_virtual_desktop', params);
  }

  /** 获取工作区配置 */
  async getContainerConfig(params) {
    return this.call('container.get_config', params);
  }

  /** 显示系统 (x11/wayland) */
  async setDisplaySystem(params) {
    return this.call('container.set_display_system', params);
  }

  /** 界面缩放 (DPI) */
  async setUiScale(params) {
    return this.call('container.set_ui_scale', params);
  }

  /** 图形加速 (gl/vulkan/dxvk/...) */
  async setGraphicsBackend(params) {
    return this.call('container.set_graphics_backend', params);
  }

  /** 窗口模式 (fullscreen/windowed/borderless) */
  async setWindowMode(params) {
    return this.call('container.set_window_mode', params);
  }

  /** 窗口装饰 */
  async setWindowDecoration(params) {
    return this.call('container.set_window_decoration', params);
  }

  /** 刷新容器 (container.refresh) */
  async refreshContainer() {
    return this.call('container.refresh', {});
  }

  /** 列出已安装组件 (container.list_installed_components) */
  async listInstalledComponents(params) {
    return this.call('container.list_installed_components', params || {});
  }

  // ============================================================
  //  高危类 (DANGER=HIGH - 需要 confirm_token)
  //  对应后端 tool_runtime 中的 wine.* 高危工具
  // ============================================================

  /**
   * 安装组件（winetricks 组件）
   * @param {object} params
   * @param {string} params.container_id 容器 ID（必填）
   * @param {string} params.components 组件列表，空格分隔，如 "vcrun6sp6 dxvk"
   * @returns {Promise<{success, result, error}>}
   */
  async installComponents(params) {
    if (!params || !params.container_id) {
      return { success: false, error: 'container_id required' };
    }
    if (!params.components) {
      return { success: false, error: 'components required' };
    }
    return this.call('wine.install_components', params);
  }

  /**
   * 模拟重启（高危）
   * @param {object} params
   * @param {string} params.container_id 容器 ID
   */
  async simulateRestart(params) {
    return this.call('wine.simulate_restart', params || {});
  }

  // ============================================================
  //  任务管理
  // ============================================================

  async taskStatus(params) {
    return this.call('task.status', params);
  }

  async taskList() {
    return this.call('task.list', {});
  }

  async taskCancel(params) {
    return this.call('task.cancel', params);
  }

  // ============================================================
  //  系统/设备
  // ============================================================

  async systemInfo() {
    return this.call('system.info', {});
  }

  async systemHealth() {
    return this.call('ping', {});
  }

  async deviceInfo() {
    return this.call('device.info', {});
  }

  async deviceRefresh() {
    return this.call('device.refresh', {});
  }

  async dbQuery(params) {
    return this.call('db.query', params);
  }

  async dbExecute(params) {
    return this.call('db.execute', params);
  }

  async activationGet() {
    return this.call('activation.get', {});
  }

  async activationStatus() {
    return this.call('activation.status', {});
  }

  async activationActivate(params) {
    return this.call('activation.activate', params);
  }

  async systemVersion() {
    return this.call('system.version', {});
  }

  async exportMachineCode(params) {
    return this.call('device.exportMachineCode', params);
  }

  // ============================================================
  //  事件订阅
  // ============================================================

  subscribeLogs(callback) {
    return window.stackrun.onLog(callback);
  }

  subscribeProgress(callback) {
    return window.stackrun.onProgress(callback);
  }

  subscribeConnection(callback) {
    return window.stackrun.onDisconnected(callback);
  }

  /**
   * 工具发现：列出后端已注册的所有 Tool
   * 用于调试/帮助菜单
   */
  async listTools() {
    // 后端没有 listTools 这个 method，所以走自定义 discovery
    // 这里直接 ping 一遍（真实实现可后端添加 listTools）
    return this.call('system.listTools', {});
  }
}

const api = new API();
module.exports = api;
