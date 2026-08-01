const fs = require('fs');
const path = require('path');
const { CACHE_CONFIG } = require('./config');

class CacheManager {
  constructor() {
    this.cacheDir = path.join(process.env.HOME || process.env.USERPROFILE, '.stackrun');
    this.cacheFilePath = path.join(this.cacheDir, CACHE_CONFIG.CONTAINER_CACHE_FILE);
    this.cache = null;
  }

  // 初始化缓存目录
  initialize() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  // 读取缓存
  readCache() {
    if (!CACHE_CONFIG.ENABLE_CACHE) {
      return null;
    }

    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const content = fs.readFileSync(this.cacheFilePath, 'utf8');
        this.cache = JSON.parse(content);
        
        // 检查缓存是否过期
        if (this.cache.timestamp && Date.now() - this.cache.timestamp < CACHE_CONFIG.CACHE_TTL) {
          console.log('[CACHE] Cache is valid, using cached data');
          return this.cache.data;
        } else {
          console.log('[CACHE] Cache expired, discarding');
          return null;
        }
      }
    } catch (error) {
      console.error('[CACHE] Error reading cache:', error);
    }
    return null;
  }

  // 写入缓存
  writeCache(data) {
    if (!CACHE_CONFIG.ENABLE_CACHE) {
      return;
    }

    try {
      this.initialize();
      this.cache = {
        timestamp: Date.now(),
        data: data
      };
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2));
      console.log('[CACHE] Cache written successfully');
    } catch (error) {
      console.error('[CACHE] Error writing cache:', error);
    }
  }

  // 清除缓存
  clearCache() {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        fs.unlinkSync(this.cacheFilePath);
        this.cache = null;
        console.log('[CACHE] Cache cleared');
      }
    } catch (error) {
      console.error('[CACHE] Error clearing cache:', error);
    }
  }

  // 检查缓存是否存在且有效
  hasValidCache() {
    return this.readCache() !== null;
  }
}

// 导出单例实例
module.exports = new CacheManager();