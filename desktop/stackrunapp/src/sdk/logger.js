const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logLevel = this.getLogLevel();
    this.environment = this.getEnvironment();
    this.logFilePath = this.getLogFilePath();
    this.logStream = null;
    
    if (this.logFilePath && typeof process !== 'undefined') {
      try {
        const logDir = path.dirname(this.logFilePath);
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        this.logStream = fs.createWriteStream(this.logFilePath, { 
          flags: 'a',
          encoding: 'utf8'
        });
      } catch (error) {
        console.error(`[LOG] Failed to open log file: ${error.message}`);
      }
    }
  }

  getLogFilePath() {
    if (process.env.LOG_FILE) {
      return process.env.LOG_FILE;
    }
    return null;
  }

  getEnvironment() {
    const env = process.env.NODE_ENV || 'development';
    return env.toLowerCase();
  }

  getLogLevel() {
    if (process.env.LOG_LEVEL) {
      return process.env.LOG_LEVEL.toLowerCase();
    }
    const env = this.getEnvironment();
    if (env === 'production') {
      return 'warn';
    } else {
      return 'debug';
    }
  }

  getLevelValue(level) {
    const levels = {
      trace: 0,
      debug: 1,
      info: 2,
      warn: 3,
      error: 4,
      fatal: 5,
      silent: 6
    };
    return levels[level] || levels.info;
  }

  shouldLog(level) {
    return this.getLevelValue(level) >= this.getLevelValue(this.logLevel);
  }

  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    const formattedArgs = args.length > 0 ? args.map(arg => {
      if (arg instanceof Error) {
        return {
          message: arg.message,
          stack: arg.stack,
          name: arg.name,
          ...(arg.code ? { code: arg.code } : {})
        };
      }
      return arg;
    }) : [];
    
    let formattedArgsStr = '';
    if (formattedArgs.length > 0) {
      try {
        formattedArgsStr = JSON.stringify(formattedArgs, null, 2);
      } catch (e) {
        formattedArgsStr = formattedArgs.map(arg => {
          if (arg && typeof arg === 'object') {
            return `[Object: ${Object.keys(arg).join(', ')}]`;
          }
          return String(arg);
        }).join(', ');
      }
    }
    
    return `${prefix} ${message} ${formattedArgsStr}`;
  }

  log(level, message, ...args) {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, ...args);

    if (typeof window !== 'undefined') {
      try {
        switch (level) {
          case 'error':
            console.error(formattedMessage);
            break;
          case 'warn':
            console.warn(formattedMessage);
            break;
          case 'info':
            console.info(formattedMessage);
            break;
          case 'debug':
          case 'trace':
            console.log(formattedMessage);
            break;
          default:
            console.log(formattedMessage);
        }
      } catch (e) {}
      
      if (window.ipcRenderer) {
        try {
          window.ipcRenderer.send('write-log', formattedMessage);
        } catch (e) {}
      }
      
      this.writeToFile(formattedMessage);
    } else if (typeof process !== 'undefined') {
      try {
        switch (level) {
          case 'error':
            console.error(formattedMessage);
            break;
          case 'warn':
            console.warn(formattedMessage);
            break;
          case 'info':
            console.info(formattedMessage);
            break;
          case 'debug':
          case 'trace':
            console.log(formattedMessage);
            break;
          default:
            console.log(formattedMessage);
        }
      } catch (e) {}
      
      this.writeToFile(formattedMessage);
    } else {
      try {
        console.log(formattedMessage);
      } catch (e) {}
    }
  }

  writeToFile(message) {
    if (!this.logStream) return;
    
    try {
      if (this.logStream.destroyed || this.logStream.closed) {
        return;
      }
      this.logStream.write(message + '\n');
    } catch (error) {
      if (error.code === 'EIO' || error.code === 'EPIPE') {
        return;
      }
      console.error(`[LOG] Failed to write to log file: ${error.message}`);
    }
  }

  close() {
    if (this.logStream) {
      this.logStream.end();
    }
  }

  trace(message, ...args) {
    this.log('trace', message, ...args);
  }

  debug(message, ...args) {
    this.log('debug', message, ...args);
  }

  info(message, ...args) {
    this.log('info', message, ...args);
  }

  warn(message, ...args) {
    this.log('warn', message, ...args);
  }

  error(message, ...args) {
    this.log('error', message, ...args);
  }

  fatal(message, ...args) {
    this.log('fatal', message, ...args);
  }

  setLevel(level) {
    this.logLevel = level.toLowerCase();
  }

  getLevel() {
    return this.logLevel;
  }

  getEnv() {
    return this.environment;
  }

  isDevelopment() {
    return this.environment === 'development';
  }

  isProduction() {
    return this.environment === 'production';
  }
}

module.exports = new Logger();