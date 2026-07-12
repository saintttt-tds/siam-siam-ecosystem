const fs = require('fs').promises;
const path = require('path');
const { createReadStream, createWriteStream } = require('fs');
const { createGzip } = require('zlib');
const { pipeline } = require('stream/promises');
const logger = require('./logger');
const config = require('@siamsiam/shared-config');

/**
 * Log File Rotation and Archival
 * 
 * Manages log file lifecycle:
 * - Rotation based on size or time
 * - Compression of old logs (gzip)
 * - Archival to long-term storage
 * - Cleanup of expired logs
 * 
 * ROTATION STRATEGIES:
 * - Size-based: Rotate when file exceeds max size
 * - Time-based: Rotate daily/weekly/monthly
 * - Hybrid: Rotate based on size OR time, whichever comes first
 * 
 * PRODUCTION CONSIDERATIONS:
 * - Use logrotate on Linux instead for better performance
 * - Archive to S3/cloud storage for long-term retention
 * - Implement log shipping to ELK/Loki for centralized logging
 * - Set up monitoring for disk space usage
 * 
 * @example
 *   const rotator = new LogRotator('/var/log/siamsiam');
 *   rotator.on('rotate', (oldFile, newFile) => {
 *     console.log(`Rotated: ${oldFile} -> ${newFile}`);
 *   });
 *   rotator.start();
 */

class LogRotator {
  constructor(logDir = '/var/log/siamsiam') {
    this.logDir = logDir;
    this.checks = new Map();
    this.defaultMaxSize = 10 * 1024 * 1024; // 10MB
    this.defaultMaxFiles = 30; // Keep 30 rotated files
    this.defaultMaxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    this.compressArchived = true; // Compress old logs
    this.listeners = {};
    
    // Ensure log directory exists
    this._ensureLogDir();
  }

  /**
   * Add a log file to monitor and rotate
   * @param {string} filename - Log file name (without path)
   * @param {Object} options - Rotation options
   */
  addFile(filename, options = {}) {
    this.checks.set(filename, {
      maxSize: options.maxSize || this.defaultMaxSize,
      maxFiles: options.maxFiles || this.defaultMaxFiles,
      maxAge: options.maxAge || this.defaultMaxAge,
      compress: options.compress !== undefined ? options.compress : this.compressArchived,
      lastCheck: Date.now(),
      checkInterval: options.checkInterval || 3600000, // 1 hour
    });
  }

  /**
   * Start monitoring log files
   */
  start() {
    logger.info('Starting log rotation service', { logDir: this.logDir });
    
    // Initial check
    this._checkAllFiles();
    
    // Periodic checks
    this.interval = setInterval(() => {
      this._checkAllFiles();
    }, 60000); // Check every minute
    
    if (this.interval.unref) {
      this.interval.unref();
    }
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    logger.info('Log rotation service stopped');
  }

  /**
   * Force rotation of a specific log file
   */
  async rotateFile(filename) {
    const filePath = path.join(this.logDir, filename);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedName = `${filename}.${timestamp}`;
    const rotatedPath = path.join(this.logDir, rotatedName);
    
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Rename current log to rotated name
      await fs.rename(filePath, rotatedPath);
      
      // Create new empty log file
      await fs.writeFile(filePath, '');
      
      // Compress rotated file if configured
      if (this.checks.get(filename)?.compress) {
        await this._compressFile(rotatedPath);
      }
      
      // Emit event
      this._emit('rotate', filename, rotatedName);
      
      logger.info('Log file rotated', {
        file: filename,
        rotatedAs: rotatedName,
      });
      
      // Cleanup old files
      await this._cleanupOldFiles(filename);
      
      return { oldFile: rotatedName, newFile: filename };
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create it
        await fs.writeFile(filePath, '');
        return null;
      }
      logger.error('Log rotation failed', {
        file: filename,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Manually trigger cleanup of old log files
   */
  async cleanup(filename = null) {
    if (filename) {
      await this._cleanupOldFiles(filename);
    } else {
      for (const [file] of this.checks) {
        await this._cleanupOldFiles(file);
      }
    }
  }

  /**
   * Get statistics about log files
   */
  async getStats() {
    const stats = {};
    
    for (const [filename] of this.checks) {
      const filePath = path.join(this.logDir, filename);
      
      try {
        const fileStats = await fs.stat(filePath);
        const rotatedFiles = await this._getRotatedFiles(filename);
        
        stats[filename] = {
          current: {
            size: fileStats.size,
            sizeFormatted: this._formatSize(fileStats.size),
            lastModified: fileStats.mtime,
          },
          rotated: {
            count: rotatedFiles.length,
            files: rotatedFiles.slice(0, 5), // Show last 5
            totalSize: rotatedFiles.reduce((sum, f) => sum + f.size, 0),
          },
          config: this.checks.get(filename),
        };
      } catch (error) {
        stats[filename] = { error: error.message };
      }
    }
    
    return stats;
  }

  /**
   * Subscribe to events
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Ensure log directory exists
   * @private
   */
  async _ensureLogDir() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create log directory', {
        dir: this.logDir,
        error: error.message,
      });
    }
  }

  /**
   * Check all monitored files
   * @private
   */
  async _checkAllFiles() {
    for (const [filename, options] of this.checks) {
      try {
        await this._checkFile(filename, options);
      } catch (error) {
        logger.error('Log check failed', {
          file: filename,
          error: error.message,
        });
      }
    }
  }

  /**
   * Check a single file for rotation needs
   * @private
   */
  async _checkFile(filename, options) {
    const filePath = path.join(this.logDir, filename);
    
    try {
      const stats = await fs.stat(filePath);
      
      // Check if file exceeds max size
      if (stats.size > options.maxSize) {
        logger.info('Log file exceeds max size, rotating', {
          file: filename,
          size: this._formatSize(stats.size),
          maxSize: this._formatSize(options.maxSize),
        });
        await this.rotateFile(filename);
      }
      
      // Check if it's time for periodic rotation (daily)
      const timeSinceLastCheck = Date.now() - options.lastCheck;
      if (timeSinceLastCheck > options.checkInterval) {
        this.checks.get(filename).lastCheck = Date.now();
        // Daily rotation check
        const lastModified = new Date(stats.mtime);
        const now = new Date();
        if (lastModified.getDate() !== now.getDate()) {
          logger.info('Daily log rotation', { file: filename });
          await this.rotateFile(filename);
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Create file if it doesn't exist
        await fs.writeFile(filePath, '');
        logger.info('Created new log file', { file: filename });
      } else {
        throw error;
      }
    }
  }

  /**
   * Compress a file using gzip
   * @private
   */
  async _compressFile(filePath) {
    const gzipPath = `${filePath}.gz`;
    
    try {
      const readStream = createReadStream(filePath);
      const writeStream = createWriteStream(gzipPath);
      const gzip = createGzip();
      
      await pipeline(readStream, gzip, writeStream);
      
      // Remove original file after compression
      await fs.unlink(filePath);
      
      logger.debug('Log file compressed', {
        file: path.basename(filePath),
        compressed: path.basename(gzipPath),
      });
    } catch (error) {
      logger.error('Log compression failed', {
        file: path.basename(filePath),
        error: error.message,
      });
    }
  }

  /**
   * Cleanup old rotated files
   * @private
   */
  async _cleanupOldFiles(baseFilename) {
    const options = this.checks.get(baseFilename);
    if (!options) return;
    
    try {
      const rotatedFiles = await this._getRotatedFiles(baseFilename);
      
      // Sort by modification time (oldest first)
      rotatedFiles.sort((a, b) => a.mtime - b.mtime);
      
      // Remove files exceeding max count
      if (rotatedFiles.length > options.maxFiles) {
        const toDelete = rotatedFiles.slice(0, rotatedFiles.length - options.maxFiles);
        for (const file of toDelete) {
          await fs.unlink(path.join(this.logDir, file.name));
          logger.debug('Deleted old log file', { file: file.name });
        }
      }
      
      // Remove files exceeding max age
      const now = Date.now();
      const toDelete = rotatedFiles.filter(f => (now - f.mtime.getTime()) > options.maxAge);
      for (const file of toDelete) {
        await fs.unlink(path.join(this.logDir, file.name));
        logger.debug('Deleted expired log file', {
          file: file.name,
          age: Math.floor((now - file.mtime.getTime()) / 86400000) + ' days',
        });
      }
    } catch (error) {
      logger.error('Log cleanup failed', {
        file: baseFilename,
        error: error.message,
      });
    }
  }

  /**
   * Get list of rotated files for a base filename
   * @private
   */
  async _getRotatedFiles(baseFilename) {
    try {
      const files = await fs.readdir(this.logDir);
      
      return await Promise.all(
        files
          .filter(f => f.startsWith(baseFilename + '.') || f.startsWith(baseFilename + '.gz'))
          .map(async (f) => {
            const stats = await fs.stat(path.join(this.logDir, f));
            return {
              name: f,
              size: stats.size,
              mtime: stats.mtime,
            };
          })
      );
    } catch (error) {
      return [];
    }
  }

  /**
   * Emit event
   * @private
   */
  _emit(event, ...args) {
    if (this.listeners[event]) {
      for (const callback of this.listeners[event]) {
        try {
          callback(...args);
        } catch (error) {
          logger.error('Event handler error', { event, error: error.message });
        }
      }
    }
  }

  /**
   * Format file size to human-readable format
   * @private
   */
  _formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Export singleton instance
module.exports = new LogRotator();