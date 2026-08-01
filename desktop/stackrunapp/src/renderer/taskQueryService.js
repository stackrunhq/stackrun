class TaskQueryService {
  constructor(dserverClient) {
    this.client = dserverClient;
  }

  async listAllTasks() {
    return this.client.call('task.list');
  }

  async listByType(type) {
    return this.client.call('task.listByType', { type });
  }

  async listByStatus(status) {
    return this.client.call('task.listByStatus', { status });
  }

  async listByDomain(domain) {
    return this.client.call('task.listByDomain', { domain });
  }

  async listByContainer(containerId) {
    return this.client.call('task.listByContainer', { container_id: containerId });
  }

  async getTask(taskId) {
    return this.client.call('task.get', { task_id: taskId });
  }

  async getContainerCreatingTasks() {
    const tasks = await this.listByType('container_create');
    return tasks.filter(t => t.status === 'running' || t.status === 'initializing' || t.status === 'queued');
  }

  async getAppInstallingTasks() {
    const tasks = await this.listByType('app_install');
    return tasks.filter(t => t.status === 'running' || t.status === 'initializing' || t.status === 'queued');
  }

  async getWineInstallingTasks() {
    const tasks = await this.listByType('wine_install');
    return tasks.filter(t => t.status === 'running' || t.status === 'initializing' || t.status === 'queued');
  }

  async getRunningTasksByDomain(domain) {
    const tasks = await this.listByDomain(domain);
    return tasks.filter(t => ['running', 'initializing', 'queued', 'retrying'].includes(t.status));
  }

  async getContainerTasks(containerId) {
    return this.listByContainer(containerId);
  }

  async getActiveContainerTasks(containerId) {
    const tasks = await this.getContainerTasks(containerId);
    return tasks.filter(t => ['running', 'initializing', 'queued'].includes(t.status));
  }

  async getRunningTasks() {
    return this.listByStatus('running');
  }

  async getPendingTasks() {
    const queued = await this.listByStatus('queued');
    const initializing = await this.listByStatus('initializing');
    return [...queued, ...initializing];
  }

  async getFailedTasks() {
    return this.listByStatus('failed');
  }

  async getCompletedTasks() {
    return this.listByStatus('completed');
  }
}

export default TaskQueryService;