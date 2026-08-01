class StateManager {
  constructor() {
    this.state = {
      containers: [],
      selectedContainer: null,
      progress: null,
      isLoading: false,
      error: null
    };
    this.listeners = new Map();
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    const oldValue = this.state[key];
    this.state[key] = value;
    this.notify(key, value, oldValue);
  }

  update(key, updater) {
    const oldValue = this.state[key];
    const newValue = updater(oldValue);
    this.state[key] = newValue;
    this.notify(key, newValue, oldValue);
  }

  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    return () => {
      this.listeners.get(key).delete(callback);
    };
  }

  notify(key, newValue, oldValue) {
    if (this.listeners.has(key)) {
      this.listeners.get(key).forEach(callback => {
        try {
          callback(newValue, oldValue);
        } catch (e) {
          console.error('State listener error:', e);
        }
      });
    }
  }

  getAll() {
    return { ...this.state };
  }

  reset() {
    const keys = Object.keys(this.state);
    this.state = {
      containers: [],
      selectedContainer: null,
      progress: null,
      isLoading: false,
      error: null
    };
    keys.forEach(key => {
      this.notify(key, this.state[key], null);
    });
  }
}

module.exports = { StateManager };
