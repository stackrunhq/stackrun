const os = require('os');
const crypto = require('crypto');

class DeviceManager {
  constructor() {
    this.logger = require('./logger');
  }

  // 获取设备基本信息
  getDeviceInfo() {
    try {
      return {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        release: os.release(),
        type: os.type(),
        uptime: os.uptime(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpus: os.cpus().length,
        networkInterfaces: this._getNetworkInterfaces()
      };
    } catch (error) {
      this.logger.error('Error getting device info:', error);
      return null;
    }
  }

  // 获取网络接口信息（简化版）
  _getNetworkInterfaces() {
    try {
      const interfaces = os.networkInterfaces();
      const result = {};
      
      for (const [name, ifaces] of Object.entries(interfaces)) {
        result[name] = ifaces.map(iface => ({
          address: iface.address,
          family: iface.family,
          internal: iface.internal
        }));
      }
      
      return result;
    } catch (error) {
      this.logger.error('Error getting network interfaces:', error);
      return {};
    }
  }

  // 获取设备唯一标识
  getDeviceId() {
    try {
      // 尝试获取MAC地址作为唯一标识
      const interfaces = os.networkInterfaces();
      let macAddress = '';
      
      for (const [name, ifaces] of Object.entries(interfaces)) {
        for (const iface of ifaces) {
          if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
            macAddress = iface.mac;
            break;
          }
        }
        if (macAddress) break;
      }
      
      // 如果没有MAC地址，使用其他信息生成唯一标识
      let uniqueInfo = macAddress || `${os.hostname()}-${os.platform()}-${os.arch()}-${os.totalmem()}`;
      
      // 使用MD5生成固定长度的唯一标识
      return crypto.createHash('md5').update(uniqueInfo).digest('hex');
    } catch (error) {
      this.logger.error('Error getting device ID:', error);
      // 出错时返回一个基于时间戳的临时ID
      return crypto.createHash('md5').update(Date.now().toString()).digest('hex');
    }
  }

  // 获取系统类型
  getSystemType() {
    try {
      const platform = os.platform();
      const release = os.release();
      
      if (platform === 'win32') {
        // 简单的Windows版本判断
        if (release.startsWith('10.')) {
          return 'Windows 10';
        } else if (release.startsWith('6.3')) {
          return 'Windows 8.1';
        } else if (release.startsWith('6.2')) {
          return 'Windows 8';
        } else if (release.startsWith('6.1')) {
          return 'Windows 7';
        } else if (release.startsWith('6.0')) {
          return 'Windows Vista';
        } else if (release.startsWith('5.1')) {
          return 'Windows XP';
        } else {
          return `Windows (${release})`;
        }
      } else if (platform === 'darwin') {
        return `macOS (${release})`;
      } else if (platform === 'linux') {
        return `Linux (${release})`;
      } else {
        return `${platform} (${release})`;
      }
    } catch (error) {
      this.logger.error('Error getting system type:', error);
      return 'Unknown';
    }
  }

  // 获取CPU信息
  getCpuInfo() {
    try {
      const cpus = os.cpus();
      return {
        count: cpus.length,
        model: cpus[0].model,
        speed: cpus[0].speed
      };
    } catch (error) {
      this.logger.error('Error getting CPU info:', error);
      return null;
    }
  }

  // 获取内存信息
  getMemoryInfo() {
    try {
      const total = os.totalmem();
      const free = os.freemem();
      const used = total - free;
      
      return {
        total: this._formatBytes(total),
        used: this._formatBytes(used),
        free: this._formatBytes(free),
        usagePercent: Math.round((used / total) * 100)
      };
    } catch (error) {
      this.logger.error('Error getting memory info:', error);
      return null;
    }
  }

  // 格式化字节数
  _formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = new DeviceManager();