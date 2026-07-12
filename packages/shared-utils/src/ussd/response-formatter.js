/**
 * USSD Response XML/JSON Formatting
 * 
 * Formats USSD responses in the format required by different
 * USSD gateway providers (Africa's Talking, Twilio, Infobip).
 * 
 * RESPONSE TYPES:
 * - CON: Continue (show menu, wait for input)
 * - END: End session (final message)
 * 
 * PROVIDER FORMATS:
 * - Africa's Talking: text/plain (CON/END prefix)
 * - Twilio: application/xml
 * - Infobip: application/json
 * - Custom SMS-based: text/plain
 * 
 * IMPORTANT: USSD messages are typically limited to 182 characters.
 * Content must be concise and well-formatted for small screens.
 * 
 * @example
 *   const formatter = require('@siamsiam/shared-utils').ussd.responseFormatter;
 *   
 *   // Continue response (show menu)
 *   const response = formatter.con('Welcome to SiamSiam\n1. Send Money\n2. Buy Airtime');
 *   
 *   // End response (final message)
 *   const response = formatter.end('Payment successful. Ref: TXN123456');
 *   
 *   // Error response (continue with retry)
 *   const response = formatter.error('Invalid PIN. Please try again.');
 */

class USSDResponseFormatter {
  constructor() {
    // Default provider - CHANGE for production
    this.defaultProvider = process.env.USSD_PROVIDER || 'africastalking';
    
    // Maximum characters per USSD screen (varies by provider)
    this.maxLength = 182;
    
    // Common USSD response prefixes
    this.prefixes = {
      con: 'CON',
      end: 'END',
    };
  }

  /**
   * Format a USSD response
   * @param {string} message - Message to display
   * @param {string} type - Response type ('CON' or 'END')
   * @param {string} provider - Gateway provider name
   * @returns {string|Object} Formatted response based on provider
   */
  format(message, type = 'CON', provider = null) {
    const currentProvider = provider || this.defaultProvider;
    
    // Ensure message is within character limit
    const truncated = this.truncate(message);
    
    switch (currentProvider.toLowerCase()) {
      case 'africastalking':
        return this._formatAfricasTalking(truncated, type);
      case 'twilio':
        return this._formatTwilio(truncated, type);
      case 'infobip':
        return this._formatInfobip(truncated, type);
      case 'custom':
        return this._formatCustom(truncated, type);
      default:
        return this._formatAfricasTalking(truncated, type);
    }
  }

  /**
   * Format continue response (show menu, wait for user input)
   * @param {string} message - Menu text to display
   * @param {string} provider - Gateway provider (optional)
   * @returns {string|Object} Formatted CON response
   */
  con(message, provider = null) {
    return this.format(message, 'CON', provider);
  }

  /**
   * Format end response (final message, session terminates)
   * @param {string} message - Final message to display
   * @param {string} provider - Gateway provider (optional)
   * @returns {string|Object} Formatted END response
   */
  end(message, provider = null) {
    return this.format(message, 'END', provider);
  }

  /**
   * Format error response with retry option
   * @param {string} message - Error message
   * @param {Object} options - Error options
   * @param {boolean} options.retry - Allow retry (shows CON instead of END)
   * @param {string} options.provider - Gateway provider
   * @returns {string|Object} Formatted error response
   */
  error(message, options = {}) {
    const { retry = true, provider = null } = options;
    
    const errorMessage = `Error\n${message}\n\n${retry ? 'Please try again.' : 'Session ended.'}`;
    
    if (retry) {
      return this.format(errorMessage, 'CON', provider);
    }
    return this.format(errorMessage, 'END', provider);
  }

  /**
   * Format timeout response
   * @param {string} provider - Gateway provider
   * @returns {string|Object} Session timeout message
   */
  timeout(provider = null) {
    const message = 'Session timeout. Please dial *123# again to continue.';
    return this.format(message, 'END', provider);
  }

  /**
   * Format success response (final message with success)
   * @param {string} message - Success message
   * @param {string} provider - Gateway provider
   * @returns {string|Object} Formatted success response
   */
  success(message, provider = null) {
    const successMessage = `Success\n${message}`;
    return this.format(successMessage, 'END', provider);
  }

  /**
   * Format pending/processing response
   * Used for async operations where user needs to wait
   * @param {string} message - Processing message
   * @param {string} provider - Gateway provider
   * @returns {string|Object} Formatted pending response
   */
  pending(message, provider = null) {
    const pendingMessage = `Please wait...\n${message}`;
    return this.format(pendingMessage, 'CON', provider);
  }

  /**
   * Build a numbered menu from items array
   * @param {string} title - Menu title/header
   * @param {Array} items - Menu items [{ label: 'Send Money', number: '1' }]
   * @param {Object} options - Menu options
   * @param {boolean} options.showBack - Show back option (default: true)
   * @param {boolean} options.showHome - Show home option (default: false)
   * @param {string} options.footer - Footer text
   * @returns {string} Formatted menu text
   */
  buildMenu(title, items, options = {}) {
    const { showBack = true, showHome = false, footer = null } = options;
    
    let message = '';
    
    // Title
    if (title) {
      message += title + '\n';
    }
    
    // Menu items
    for (const item of items) {
      if (item.number) {
        message += `${item.number}. ${item.label}\n`;
      } else {
        message += `${item.label}\n`;
      }
    }
    
    // Navigation options
    if (showBack || showHome) {
      message += '\n';
      if (showBack) message += '0. Back\n';
      if (showHome) message += '00. Main Menu\n';
    }
    
    // Footer
    if (footer) {
      message += '\n' + footer;
    }
    
    return message.trim();
  }

  /**
   * Build a confirmation prompt
   * @param {string} message - Confirmation message
   * @param {Object} options - Options
   * @param {boolean} options.showDetails - Show transaction details
   * @param {Object} options.details - Transaction details to display
   * @returns {string} Formatted confirmation text
   */
  buildConfirmation(message, options = {}) {
    const { showDetails = false, details = {} } = options;
    
    let text = message + '\n\n';
    
    // Show transaction details if requested
    if (showDetails && Object.keys(details).length > 0) {
      for (const [key, value] of Object.entries(details)) {
        text += `${key}: ${value}\n`;
      }
      text += '\n';
    }
    
    text += '1. Confirm\n';
    text += '2. Cancel\n';
    text += '\n0. Back';
    
    return text.trim();
  }

  /**
   * Build an input prompt
   * @param {string} prompt - Input instruction
   * @param {Object} options - Input options
   * @param {string} options.example - Example input
   * @param {string} options.hint - Additional hint text
   * @param {boolean} options.showBack - Show back option
   * @returns {string} Formatted input prompt
   */
  buildInputPrompt(prompt, options = {}) {
    const { example = null, hint = null, showBack = true } = options;
    
    let text = prompt + '\n\n';
    
    if (example) {
      text += `e.g. ${example}\n`;
    }
    
    if (hint) {
      text += `${hint}\n`;
    }
    
    if (showBack) {
      text += '\n0. Back';
    }
    
    return text.trim();
  }

  /**
   * Format a payment receipt
   * @param {Object} details - Receipt details
   * @param {string} details.reference - Transaction reference
   * @param {string} details.date - Transaction date
   * @param {string} details.amount - Transaction amount
   * @param {string} details.from - Sender (account/phone)
   * @param {string} details.to - Recipient
   * @param {string} details.description - Transaction description
   * @returns {string} Formatted receipt
   */
  buildReceipt(details) {
    let receipt = 'RECEIPT\n';
    receipt += '-------------------\n';
    
    if (details.reference) receipt += `Ref: ${details.reference}\n`;
    if (details.date) receipt += `Date: ${details.date}\n`;
    if (details.amount) receipt += `Amount: ${details.amount}\n`;
    if (details.from) receipt += `From: ${details.from}\n`;
    if (details.to) receipt += `To: ${details.to}\n`;
    if (details.description) receipt += `Desc: ${details.description}\n`;
    
    receipt += '-------------------\n';
    receipt += 'Thank you for using\nSiamSiam';
    
    return receipt;
  }

  /**
   * Build a transaction status response
   * @param {Object} status - Transaction status
   * @param {string} status.reference - Transaction reference
   * @param {string} status.status - Status (pending, completed, failed)
   * @param {string} status.amount - Amount
   * @param {string} status.date - Date
   * @returns {string} Formatted status
   */
  buildTransactionStatus(status) {
    let message = 'Transaction Status\n';
    message += '-------------------\n';
    
    if (status.reference) message += `Ref: ${status.reference}\n`;
    if (status.status) message += `Status: ${status.status}\n`;
    if (status.amount) message += `Amount: ${status.amount}\n`;
    if (status.date) message += `Date: ${status.date}\n`;
    if (status.message) message += `\n${status.message}\n`;
    
    message += '-------------------\n';
    message += '0. Back';
    
    return message.trim();
  }

  /**
   * Build an account balance response
   * @param {Object} balances - Account balances
   * @param {string} balances.main - Main balance
   * @param {string} balances.currency - Currency
   * @param {Array} balances.wallets - Additional wallets
   * @returns {string} Formatted balance
   */
  buildBalance(balances) {
    let message = 'Balance\n';
    message += '-------------------\n';
    
    if (balances.main) {
      message += `Main: ${balances.main}\n`;
    }
    
    if (balances.wallets && balances.wallets.length > 0) {
      for (const wallet of balances.wallets) {
        message += `${wallet.name}: ${wallet.balance}\n`;
      }
    }
    
    message += '-------------------\n';
    message += '0. Back';
    
    return message.trim();
  }

  /**
   * Build a list response (search results, etc.)
   * @param {string} title - List title
   * @param {Array} items - List items
   * @param {Object} options - List options
   * @param {boolean} options.numbered - Number items
   * @param {number} options.maxItems - Max items to show
   * @returns {string} Formatted list
   */
  buildList(title, items, options = {}) {
    const { numbered = true, maxItems = 8 } = options;
    
    let message = title + '\n';
    message += '-------------------\n';
    
    const displayItems = items.slice(0, maxItems);
    
    for (let i = 0; i < displayItems.length; i++) {
      if (numbered) {
        message += `${i + 1}. ${displayItems[i]}\n`;
      } else {
        message += `${displayItems[i]}\n`;
      }
    }
    
    if (items.length > maxItems) {
      message += `\nShowing ${maxItems} of ${items.length}`;
    }
    
    message += '\n-------------------\n';
    message += '0. Back';
    
    return message.trim();
  }

  /**
   * Truncate message to fit USSD character limits
   * @param {string} message - Message to truncate
   * @param {number} maxLength - Maximum length (default: 182)
   * @returns {string} Truncated message
   */
  truncate(message, maxLength = 182) {
    if (!message || message.length <= maxLength) return message;
    
    // Try to truncate at a newline or space
    const truncated = message.substring(0, maxLength - 3);
    const lastNewline = truncated.lastIndexOf('\n');
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastNewline > maxLength * 0.8) {
      return truncated.substring(0, lastNewline) + '...';
    }
    
    if (lastSpace > maxLength * 0.9) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }

  /**
   * Paginate long messages for multi-screen USSD
   * @param {string} message - Full message
   * @param {number} pageSize - Characters per page
   * @returns {Array} Array of page objects
   */
  paginate(message, pageSize = 160) {
    const lines = message.split('\n');
    const pages = [];
    let currentPage = '';
    
    for (const line of lines) {
      if ((currentPage + line + '\n').length > pageSize && currentPage) {
        pages.push({
          content: currentPage.trim(),
          hasMore: true,
        });
        currentPage = line + '\n';
      } else {
        currentPage += line + '\n';
      }
    }
    
    if (currentPage.trim()) {
      pages.push({
        content: currentPage.trim(),
        hasMore: false,
      });
    }
    
    // Add page numbers and navigation
    return pages.map((page, index) => ({
      ...page,
      pageNumber: index + 1,
      totalPages: pages.length,
      content: pages.length > 1
        ? `${page.content}\n\nPage ${index + 1}/${pages.length}\n${index < pages.length - 1 ? '1. Next\n' : ''}0. Back`
        : page.content,
    }));
  }

  /**
   * Clean and sanitize USSD message
   * Removes characters that may cause display issues on basic phones
   * @param {string} message - Raw message
   * @returns {string} Cleaned message
   */
  clean(message) {
    if (!message) return '';
    
    return message
      // Remove special Unicode characters that basic phones can't display
      .replace(/[\u0080-\uFFFF]/g, '')
      // Replace tabs with spaces
      .replace(/\t/g, ' ')
      // Remove carriage returns
      .replace(/\r/g, '')
      // Limit consecutive newlines
      .replace(/\n{3,}/g, '\n\n')
      // Remove trailing whitespace from lines
      .split('\n').map(line => line.trimRight()).join('\n')
      .trim();
  }

  /**
   * Format a service unavailable message
   * @param {string} service - Service name
   * @param {string} provider - Gateway provider
   * @returns {string|Object} Formatted message
   */
  serviceUnavailable(service = '', provider = null) {
    const message = service 
      ? `${service} is temporarily unavailable.\nPlease try again later.`
      : 'Service temporarily unavailable.\nPlease try again later.';
    
    return this.format(message, 'END', provider);
  }

  /**
   * Format a KYC/verification pending message
   * @param {string} provider - Gateway provider
   * @returns {string|Object} Formatted message
   */
  kycPending(provider = null) {
    const message = 'Your account verification\nis in progress.\n\nYou will receive an SMS\nwhen verification is complete.';
    return this.format(message, 'END', provider);
  }

  // ==================== PRIVATE PROVIDER FORMATTERS ====================

  /**
   * Africa's Talking format
   * Uses simple text/plain with CON/END prefix
   * @private
   */
  _formatAfricasTalking(message, type) {
    // Africa's Talking expects: "CON message" or "END message"
    const prefix = type === 'CON' ? 'CON' : 'END';
    return `${prefix} ${message}`;
  }

  /**
   * Twilio format
   * Uses XML response format
   * @private
   */
  _formatTwilio(message, type) {
    const action = type === 'CON' ? 'continue' : 'stop';
    
    // Twilio expects XML with <Ussd> element
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Ussd action="${action}">
    ${this._escapeXml(message)}
  </Ussd>
</Response>`;
  }

  /**
   * Infobip format
   * Uses JSON response format
   * @private
   */
  _formatInfobip(message, type) {
    // Infobip expects JSON with type and message fields
    return JSON.stringify({
      type: type === 'CON' ? 'continue' : 'end',
      message: message,
    });
  }

  /**
   * Custom/generic format
   * Returns structured object for custom implementations
   * @private
   */
  _formatCustom(message, type) {
    return {
      action: type === 'CON' ? 'continue' : 'end',
      message: message,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Escape XML special characters for Twilio format
   * @private
   */
  _escapeXml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

// Export singleton instance
module.exports = new USSDResponseFormatter();