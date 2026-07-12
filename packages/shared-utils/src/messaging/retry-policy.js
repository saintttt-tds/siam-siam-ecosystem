/**
 * Retry Policy with Exponential Backoff
 * 
 * Configurable retry logic for message processing, API calls,
 * and other transient failure scenarios.
 * 
 * STRATEGIES:
 * - Exponential Backoff: Delay = baseDelay * 2^attempt
 * - Fixed Delay: Same delay for each retry
 * - Linear Backoff: Delay = baseDelay * attempt
 * - Decorrelated Jitter: Random delay within a range
 * 
 * ERROR CLASSIFICATION:
 * - Transient: Network timeouts, rate limits, temporary failures → RETRY
 * - Permanent: Validation errors, authentication failures → DON'T RETRY
 * - Unknown: Unexpected errors → RETRY with caution
 * 
 * @example
 *   const policy = new RetryPolicy({
 *     maxRetries: 5,
 *     baseDelay: 1000,
 *     maxDelay: 60000,
 *     strategy: 'exponential',
 *     useJitter: true,
 *   });
 *   
 *   const delay = policy.getDelay(3); // Delay for 4th attempt
 *   const shouldRetry = policy.shouldRetry(error, 3);
 */

class RetryPolicy {
  /**
   * @param {Object} options - Retry configuration
   * @param {number} options.maxRetries - Maximum retry attempts (default: 5)
   * @param {number} options.baseDelay - Base delay in milliseconds (default: 1000)
   * @param {number} options.maxDelay - Maximum delay in milliseconds (default: 60000)
   * @param {string} options.strategy - Backoff strategy: 'exponential', 'fixed', 'linear', 'decorrelated' (default: 'exponential')
   * @param {boolean} options.useJitter - Add random jitter to prevent thundering herd (default: true)
   * @param {number} options.jitterFactor - Jitter percentage (0-1, default: 0.25)
   * @param {Function} options.shouldRetry - Custom retry decision function
   */
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 5;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 60000;
    this.strategy = options.strategy || 'exponential';
    this.useJitter = options.useJitter !== false;
    this.jitterFactor = options.jitterFactor || 0.25;
    this.customShouldRetry = options.shouldRetry || null;
    
    // Transient error types that should be retried
    this.transientErrors = new Set([
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      'EPIPE',
      'ESOCKETTIMEDOUT',
      'EHOSTUNREACH',
      '429', // Rate limit
      '503', // Service unavailable
      '504', // Gateway timeout
    ]);

    // Permanent error types that should NOT be retried
    this.permanentErrors = new Set([
      '400', // Bad request
      '401', // Unauthorized
      '403', // Forbidden
      '404', // Not found
      '409', // Conflict
      '422', // Unprocessable entity
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'NotFoundError',
      'ConflictError',
    ]);
  }

  /**
   * Calculate delay for a given retry attempt
   * @param {number} attempt - Current attempt number (0-indexed)
   * @returns {number} Delay in milliseconds, or -1 if max retries exceeded
   */
  getDelay(attempt) {
    if (attempt >= this.maxRetries) {
      return -1; // No more retries
    }

    let delay;

    switch (this.strategy) {
      case 'fixed':
        delay = this.baseDelay;
        break;
      
      case 'linear':
        delay = this.baseDelay * (attempt + 1);
        break;
      
      case 'decorrelated':
        // Random delay between baseDelay and baseDelay * 2^attempt
        const minDelay = this.baseDelay;
        const maxDelay = Math.min(this.baseDelay * Math.pow(2, attempt), this.maxDelay);
        delay = minDelay + Math.random() * (maxDelay - minDelay);
        break;
      
      case 'exponential':
      default:
        // Exponential backoff: baseDelay * 2^attempt
        delay = this.baseDelay * Math.pow(2, attempt);
        break;
    }

    // Cap at maximum delay
    delay = Math.min(delay, this.maxDelay);

    // Add jitter to prevent thundering herd
    if (this.useJitter) {
      const jitter = delay * this.jitterFactor * (Math.random() * 2 - 1);
      delay = delay + jitter;
    }

    return Math.round(delay);
  }

  /**
   * Determine if an error should be retried
   * @param {Error|Object} error - The error that occurred
   * @param {number} attempt - Current attempt number
   * @returns {boolean} Whether to retry
   */
  shouldRetry(error, attempt) {
    // Max retries check
    if (attempt >= this.maxRetries) {
      return false;
    }

    // Custom retry logic
    if (this.customShouldRetry) {
      return this.customShouldRetry(error, attempt);
    }

    // No error info - retry by default
    if (!error) {
      return true;
    }

    const errorCode = error.code || error.statusCode || error.status;
    const errorType = error.name || error.type;

    // Check permanent errors first
    if (this.permanentErrors.has(errorCode) || this.permanentErrors.has(errorType)) {
      return false;
    }

    // Check transient errors
    if (this.transientErrors.has(errorCode) || this.transientErrors.has(errorType)) {
      return true;
    }

    // Network errors are usually transient
    if (error.code && error.code.startsWith('E')) {
      return true;
    }

    // HTTP 5xx errors are transient
    if (errorCode && errorCode >= 500 && errorCode < 600) {
      return true;
    }

    // Default: retry unknown errors (with caution)
    return true;
  }

  /**
   * Execute a function with retry logic
   * @param {Function} fn - Async function to execute
   * @param {Object} options - Execution options
   * @returns {Promise<any>} Function result
   * 
   * @example
   *   const result = await retryPolicy.execute(
   *     async () => await fetchFromExternalAPI(),
   *     { context: 'fetchUserData' }
   *   );
   */
  async execute(fn, options = {}) {
    const context = options.context || 'unknown';
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await fn();
        return result;
      } catch (error) {
        lastError = error;
        
        if (!this.shouldRetry(error, attempt)) {
          throw error;
        }

        const delay = this.getDelay(attempt);
        
        if (delay < 0) {
          throw new Error(`Max retries (${this.maxRetries}) exceeded for ${context}: ${error.message}`);
        }

        // PRODUCTION: Log retry attempt
        // logger.debug(`Retry ${attempt + 1}/${this.maxRetries} for ${context}`, {
        //   delayMs: delay,
        //   error: error.message,
        // });

        await this._sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Sleep for specified milliseconds
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get retry configuration summary
   */
  getConfig() {
    return {
      maxRetries: this.maxRetries,
      baseDelay: this.baseDelay,
      maxDelay: this.maxDelay,
      strategy: this.strategy,
      useJitter: this.useJitter,
      jitterFactor: this.jitterFactor,
    };
  }
}

module.exports = RetryPolicy;