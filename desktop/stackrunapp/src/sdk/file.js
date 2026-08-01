const fs = require('fs');
const path = require('path');
const os = require('os');

class FileManager {
  constructor() {
    this.logger = require('./logger');
  }

  getHomeDirectory() {
    try {
      return os.homedir();
    } catch (error) {
      this.logger.error('Error getting home directory:', error);
      throw this._createError('获取主目录失败', error);
    }
  }

  async getDesktopPath() {
    try {
      const homeDir = this.getHomeDirectory();
      const possibleNames = ['桌面', 'Desktop', 'desktop'];
      
      for (const name of possibleNames) {
        const testPath = path.join(homeDir, name);
        try {
          await fs.promises.access(testPath, fs.constants.F_OK);
          this.logger.info(`Found desktop directory: ${testPath}`);
          return testPath;
        } catch (err) {}
      }
      
      const fallbackPath = path.join(homeDir, 'Desktop');
      this.logger.warn(`No desktop directory found, fallback to: ${fallbackPath}`);
      return fallbackPath;
    } catch (error) {
      this.logger.error('Error getting desktop path:', error);
      throw this._createError('获取桌面路径失败', error);
    }
  }

  getStartMenuPath() {
    try {
      const homeDir = this.getHomeDirectory();
      return path.join(homeDir, '.local', 'share', 'applications');
    } catch (error) {
      this.logger.error('Error getting start menu path:', error);
      throw this._createError('获取开始菜单路径失败', error);
    }
  }

  async makeExecutable(filePath) {
    try {
      await fs.promises.chmod(filePath, 0o755);
      return true;
    } catch (error) {
      this.logger.error('Error making file executable:', error);
      throw this._createError('设置文件可执行权限失败', error);
    }
  }

  getAppDataDirectory(appName) {
    try {
      const homeDir = this.getHomeDirectory();
      
      if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), appName);
      } else if (process.platform === 'darwin') {
        return path.join(homeDir, 'Library', 'Application Support', appName);
      } else {
        return path.join(homeDir, '.config', appName);
      }
    } catch (error) {
      this.logger.error('Error getting app data directory:', error);
      throw this._createError('获取应用数据目录失败', error);
    }
  }

  async fileExists(filePath) {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      this.logger.error('Error checking if file exists:', error);
      throw this._createError('检查文件存在性失败', error);
    }
  }

  async isFileReadable(filePath) {
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      this.logger.error('Error checking if file is readable:', error);
      throw this._createError('检查文件可读性失败', error);
    }
  }

  async isFileWritable(filePath) {
    try {
      await fs.promises.access(filePath, fs.constants.W_OK);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      this.logger.error('Error checking if file is writable:', error);
      throw this._createError('检查文件可写性失败', error);
    }
  }

  async isDirectory(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.isDirectory();
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      this.logger.error('Error checking if path is directory:', error);
      throw this._createError('检查路径类型失败', error);
    }
  }

  async isFile(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.isFile();
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      this.logger.error('Error checking if path is file:', error);
      throw this._createError('检查路径类型失败', error);
    }
  }

  isShortcut(filePath) {
    try {
      if (process.platform === 'win32') {
        return path.extname(filePath).toLowerCase() === '.lnk';
      } else if (process.platform === 'darwin') {
        return path.extname(filePath).toLowerCase() === '.app';
      } else {
        return path.extname(filePath).toLowerCase() === '.desktop';
      }
    } catch (error) {
      this.logger.error('Error checking if file is shortcut:', error);
      throw this._createError('检查快捷方式失败', error);
    }
  }

  async readFile(filePath, encoding = 'utf8') {
    try {
      return await fs.promises.readFile(filePath, encoding);
    } catch (error) {
      this.logger.error('Error reading file:', error);
      throw this._createError('读取文件失败', error);
    }
  }

  async writeFile(filePath, data, encoding = 'utf8') {
    try {
      await this.ensureDirectory(path.dirname(filePath));
      return await fs.promises.writeFile(filePath, data, encoding);
    } catch (error) {
      this.logger.error('Error writing file:', error);
      throw this._createError('写入文件失败', error);
    }
  }

  async ensureDirectory(dirPath) {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
      return true;
    } catch (error) {
      this.logger.error('Error ensuring directory exists:', error);
      throw this._createError('创建目录失败', error);
    }
  }

  async copyFile(src, dest) {
    try {
      await this.ensureDirectory(path.dirname(dest));
      await fs.promises.copyFile(src, dest);
      return true;
    } catch (error) {
      this.logger.error('Error copying file:', error);
      throw this._createError('复制文件失败', error);
    }
  }

  async moveFile(src, dest) {
    try {
      await this.ensureDirectory(path.dirname(dest));
      await fs.promises.rename(src, dest);
      return true;
    } catch (error) {
      this.logger.error('Error moving file:', error);
      throw this._createError('移动文件失败', error);
    }
  }

  async renameFile(src, dest) {
    return await this.moveFile(src, dest);
  }

  async deleteFile(filePath) {
    try {
      await fs.promises.unlink(filePath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      this.logger.error('Error deleting file:', error);
      throw this._createError('删除文件失败', error);
    }
  }

  async listDirectory(dirPath) {
    try {
      return await fs.promises.readdir(dirPath);
    } catch (error) {
      this.logger.error('Error listing directory:', error);
      throw this._createError('列出目录内容失败', error);
    }
  }

  async getFileInfo(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      return {
        size: stats.size,
        atime: stats.atime,
        mtime: stats.mtime,
        ctime: stats.ctime,
        birthtime: stats.birthtime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        isSymbolicLink: stats.isSymbolicLink()
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      this.logger.error('Error getting file info:', error);
      throw this._createError('获取文件信息失败', error);
    }
  }

  resolvePath(...pathSegments) {
    try {
      return path.resolve(...pathSegments);
    } catch (error) {
      this.logger.error('Error resolving path:', error);
      throw this._createError('解析路径失败', error);
    }
  }

  normalizePath(filePath) {
    try {
      return path.normalize(filePath);
    } catch (error) {
      this.logger.error('Error normalizing path:', error);
      throw this._createError('规范化路径失败', error);
    }
  }

  getRelativePath(from, to) {
    try {
      return path.relative(from, to);
    } catch (error) {
      this.logger.error('Error getting relative path:', error);
      throw this._createError('获取相对路径失败', error);
    }
  }

  _createError(message, originalError) {
    const error = new Error(message);
    error.originalError = originalError;
    error.code = originalError ? originalError.code : 'UNKNOWN';
    return error;
  }

  async isFreeSpaceGreaterThan3GB(path) {
    try {
      const { exec } = require('child_process');
      
      let diskPath;
      if (process.platform === 'win32') {
        diskPath = path.split(':')[0] + ':';
      } else {
        diskPath = '/';
      }
      
      return new Promise((resolve, reject) => {
        let command;
        if (process.platform === 'win32') {
          command = `wmic logicaldisk where "DeviceID='${diskPath}'" get FreeSpace`;
        } else if (process.platform === 'darwin') {
          command = `df -k "${diskPath}" | tail -n 1 | awk '{print $4}'`;
        } else {
          command = `df -k "${diskPath}" | tail -n 1 | awk '{print $4}'`;
        }
        
        exec(command, (error, stdout, stderr) => {
          if (error) {
            reject(error);
            return;
          }
          
          let freeSpace;
          if (process.platform === 'win32') {
            const lines = stdout.trim().split('\n');
            if (lines.length >= 2) {
              freeSpace = parseInt(lines[1].trim());
            }
          } else {
            freeSpace = parseInt(stdout.trim()) * 1024;
          }
          
          if (isNaN(freeSpace)) {
            reject(new Error('无法获取磁盘空间'));
            return;
          }
          
          const threeGB = 3 * 1024 * 1024 * 1024;
          resolve(freeSpace > threeGB);
        });
      });
    } catch (error) {
      this.logger.error('Error checking free space:', error);
      throw this._createError('检查磁盘空间失败', error);
    }
  }

  async getLnkFiles(dirPath) {
    try {
      const lnkFiles = [];
      
      async function traverse(currentPath) {
        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          
          if (entry.isDirectory()) {
            await traverse(fullPath);
          } else if (entry.isFile() && path.extname(fullPath).toLowerCase() === '.lnk') {
            lnkFiles.push(fullPath);
          }
        }
      }
      
      await traverse(dirPath);
      return lnkFiles;
    } catch (error) {
      this.logger.error('Error getting lnk files:', error);
      throw this._createError('获取lnk文件失败', error);
    }
  }

  getExeName(exePath) {
    try {
      const fileName = path.basename(exePath);
      const exeName = path.parse(fileName).name;
      return exeName;
    } catch (error) {
      this.logger.error('Error getting exe name:', error);
      throw this._createError('获取exe名称失败', error);
    }
  }

  async calculateMD5(filePath) {
    try {
      const crypto = require('crypto');
      const stream = fs.createReadStream(filePath);
      const hash = crypto.createHash('md5');
      
      return new Promise((resolve, reject) => {
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (error) => reject(this._createError('计算MD5失败', error)));
      });
    } catch (error) {
      this.logger.error('Error calculating MD5:', error);
      throw this._createError('计算MD5失败', error);
    }
  }

  async deleteDirectory(dirPath) {
    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      this.logger.error('Error deleting directory:', error);
      throw this._createError('删除目录失败', error);
    }
  }

  convertWindowPathToUnixDirect(winePrefix, windowsPath) {
    try {
      if (!windowsPath) {
        return '';
      }
      
      let unixPath = windowsPath;
      
      unixPath = unixPath.trim();
      
      if ((unixPath.startsWith('"') && unixPath.endsWith('"')) ||
          (unixPath.startsWith("'") && unixPath.endsWith("'"))) {
        unixPath = unixPath.slice(1, -1);
      }
      
      if (unixPath.startsWith('\\\\?\\Z:')) {
        unixPath = unixPath.replace('\\\\?\\Z:', '');
        unixPath = unixPath.replace(/\\/g, '/');
        return unixPath;
      }
      
      if (unixPath.match(/^[A-Za-z]:\\/)) {
        const relativePath = unixPath.substring(2);
        let normalizedPath = relativePath.replace(/\\/g, '/');
        normalizedPath = normalizedPath.replace(/^\/program files(\s*\(x86\))?\//i, '/Program Files$1/');
        unixPath = `${winePrefix}/drive_c${normalizedPath}`;
        return unixPath;
      }
      
      unixPath = unixPath.replace(/\\/g, '/');
      return unixPath;
    } catch (error) {
      this.logger.error('Error in direct path conversion:', error);
      return '';
    }
  }
}

module.exports = new FileManager();