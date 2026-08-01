/**
 * 栈行平台 SDK - 前端 SDK 层
 * 
 * 注意：容器、应用、Wine 命令、数据库操作、网络请求等都已下沉到 stackrunserver 中处理
 * 前端 SDK 只保留必要的工具模块
 */

const config = require('./config');

const DEEP_OS_TYPE = config.OS_TYPE;
const DEEP_OS_TYPE_NAMES = config.OS_TYPE_NAMES;

class SDK {
  constructor() {
    this.config = config;
    this.DEEP_OS_TYPE = DEEP_OS_TYPE;
    
    this._logger = null;
    this._file = null;
    this._cache = null;
    this._device = null;
  }

  getLogger() {
    if (!this._logger) {
      this._logger = require('./logger');
    }
    return this._logger;
  }

  getFile() {
    if (!this._file) {
      this._file = require('./file');
    }
    return this._file;
  }

  getCache() {
    if (!this._cache) {
      this._cache = require('./cache');
    }
    return this._cache;
  }

  getDevice() {
    if (!this._device) {
      this._device = require('./device');
    }
    return this._device;
  }

  handleError(error, context) {
    this.getLogger().error(`Error in ${context}:`, error);
    throw error;
  }

  handleSuccess(data, context) {
    this.getLogger().info(`Success in ${context}:`, data);
    return data;
  }

  getOsTypes() {
    return this.DEEP_OS_TYPE;
  }

  getOsTypeName(type) {
    return DEEP_OS_TYPE_NAMES[type] || "Unknown";
  }

  getOsTypeNames() {
    return DEEP_OS_TYPE_NAMES;
  }
}

const sdkInstance = new SDK();

module.exports = sdkInstance;
module.exports.DEEP_OS_TYPE = DEEP_OS_TYPE;
module.exports.DEEP_OS_TYPE_NAMES = DEEP_OS_TYPE_NAMES;
module.exports.cache = require('./cache');
module.exports.device = require('./device');