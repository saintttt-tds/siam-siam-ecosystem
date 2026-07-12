const logger = require('../logging/logger');

/**
 * USSD Menu Tree Construction Engine
 * 
 * Builds and manages USSD menu structures with:
 * - Dynamic menu generation
 * - Multi-level navigation
 * - Conditional menu items
 * - Input validation per menu
 * - Multi-language support
 * - Menu item actions (navigate, execute, external)
 * 
 * MENU STRUCTURE:
 * {
 *   id: 'main_menu',
 *   title: 'Welcome to SiamSiam',
 *   items: [
 *     { label: '1. Send Money', action: 'navigate', target: 'send_money' },
 *     { label: '2. Buy Airtime', action: 'navigate', target: 'buy_airtime' },
 *     { label: '3. Pay Bill', action: 'navigate', target: 'pay_bill' },
 *   ]
 * }
 * 
 * @example
 *   const menuBuilder = require('@siamsiam/shared-utils').ussd.menuBuilder;
 *   
 *   menuBuilder.addMenu('main_menu', {
 *     title: 'Welcome to SiamSiam',
 *     items: [...]
 *   });
 *   
 *   const menu = menuBuilder.render('main_menu', { language: 'en' });
 */

class MenuBuilder {
  constructor() {
    this.menus = new Map();
    this.defaultLanguage = 'en';
  }

  /**
   * Add a menu definition
   * @param {string} menuId - Unique menu identifier
   * @param {Object} config - Menu configuration
   */
  addMenu(menuId, config) {
    this.menus.set(menuId, {
      id: menuId,
      title: config.title || '',
      body: config.body || '',
      items: config.items || [],
      footer: config.footer || '',
      parent: config.parent || null,
      backAction: config.backAction || 'parent',
      timeout: config.timeout || 30,
      maxInputLength: config.maxInputLength || 100,
      inputType: config.inputType || 'selection', // selection, text, number, phone, amount, pin
      validator: config.validator || null,
      handler: config.handler || null,
      dynamicItems: config.dynamicItems || null,
      conditionalItems: config.conditionalItems || null,
    });

    logger.debug(`USSD menu added: ${menuId}`);
  }

  /**
   * Remove a menu
   */
  removeMenu(menuId) {
    this.menus.delete(menuId);
  }

  /**
   * Get a menu definition
   */
  getMenu(menuId) {
    return this.menus.get(menuId) || null;
  }

  /**
   * Check if menu exists
   */
  hasMenu(menuId) {
    return this.menus.has(menuId);
  }

  /**
   * Render a menu for display on USSD
   * @param {string} menuId - Menu to render
   * @param {Object} context - Session context (user data, language, etc.)
   * @returns {string} Formatted USSD menu string
   */
  async render(menuId, context = {}) {
    const menu = this.menus.get(menuId);
    if (!menu) {
      return this._renderError('Menu not found', context.language);
    }

    let output = '';

    // Title
    if (menu.title) {
      output += this._translate(menu.title, context.language) + '\n';
    }

    // Body
    if (menu.body) {
      output += this._translate(menu.body, context.language) + '\n';
    }

    // Dynamic items
    let items = [...menu.items];
    
    if (menu.dynamicItems && typeof menu.dynamicItems === 'function') {
      const dynamicItems = await menu.dynamicItems(context);
      items = [...items, ...dynamicItems];
    }

    // Conditional items
    if (menu.conditionalItems) {
      const conditionalItems = menu.conditionalItems
        .filter(item => item.condition(context))
        .map(item => item.item);
      items = [...items, ...conditionalItems];
    }

    // Render menu items
    for (const item of items) {
      if (item.visible === false) continue;
      
      const label = this._translate(item.label, context.language);
      
      if (item.number) {
        output += `${item.number}. ${label}\n`;
      } else {
        output += `${label}\n`;
      }
    }

    // Footer
    if (menu.footer) {
      output += '\n' + this._translate(menu.footer, context.language);
    }

    // Default footer with back option
    if (!menu.footer && menu.parent) {
      output += '\n0. Back';
    }

    return output.trim();
  }

  /**
   * Handle user input for a menu
   * @param {string} menuId - Current menu
   * @param {string} input - User input
   * @param {Object} context - Session context
   * @returns {Object} Action to take
   */
  async handleInput(menuId, input, context = {}) {
    const menu = this.menus.get(menuId);
    if (!menu) {
      return { action: 'error', message: 'Menu not found' };
    }

    // Handle back navigation
    if (input === '0' || input.toLowerCase() === 'back') {
      return this._handleBack(menu, context);
    }

    // Handle main menu shortcut
    if (input === '00' || input.toLowerCase() === 'home') {
      return { action: 'navigate', target: 'main_menu' };
    }

    // Validate input
    if (menu.validator) {
      const validationResult = await menu.validator(input, context);
      if (!validationResult.valid) {
        return {
          action: 'error',
          message: validationResult.error || 'Invalid input',
          retry: true,
        };
      }
    }

    // Find selected menu item
    if (menu.inputType === 'selection') {
      const selectedItem = menu.items.find(item => 
        item.number === input || item.number === parseInt(input)
      );

      if (!selectedItem) {
        // Check dynamic items
        if (menu.dynamicItems) {
          const dynamicItems = await menu.dynamicItems(context);
          const dynamicItem = dynamicItems.find(item => 
            item.number === input || item.number === parseInt(input)
          );
          if (dynamicItem) {
            return this._processAction(dynamicItem.action, dynamicItem.target, input, context);
          }
        }
        
        return {
          action: 'error',
          message: 'Invalid selection. Please try again.',
          retry: true,
        };
      }

      return this._processAction(selectedItem.action, selectedItem.target, input, context);
    }

    // For non-selection menus, pass input to handler
    if (menu.handler) {
      return await menu.handler(input, context);
    }

    return { action: 'continue', input };
  }

  /**
   * Build a complete USSD application menu tree
   * @param {Object} config - Application configuration
   */
  buildApplication(config) {
    const { appName, mainMenu, subMenus } = config;

    // Add main menu
    this.addMenu('main_menu', {
      title: appName || 'Welcome',
      ...mainMenu,
      parent: null,
    });

    // Add sub menus
    for (const [menuId, menuConfig] of Object.entries(subMenus || {})) {
      this.addMenu(menuId, menuConfig);
    }

    logger.info(`USSD application built: ${appName}`);
  }

  /**
   * Export menu structure (for documentation)
   */
  exportStructure() {
    const structure = {};
    
    for (const [menuId, menu] of this.menus) {
      structure[menuId] = {
        title: menu.title,
        items: menu.items.map(item => ({
          label: item.label,
          action: item.action,
          target: item.target,
        })),
        parent: menu.parent,
        inputType: menu.inputType,
      };
    }
    
    return structure;
  }

  /**
   * Get navigation path from main menu to a specific menu
   */
  getNavigationPath(targetMenuId) {
    const path = [targetMenuId];
    let current = this.menus.get(targetMenuId);

    while (current && current.parent) {
      path.unshift(current.parent);
      current = this.menus.get(current.parent);
    }

    return path;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Process menu item action
   * @private
   */
  _processAction(action, target, input, context) {
    switch (action) {
      case 'navigate':
        return { action: 'navigate', target };
      
      case 'execute':
        return { action: 'execute', function: target, input };
      
      case 'external':
        return { action: 'external', url: target, input };
      
      case 'input':
        return { action: 'input', target, input };
      
      case 'confirm':
        return { action: 'confirm', target, input };
      
      case 'end':
        return { action: 'end', message: target };
      
      default:
        return { action: 'navigate', target: action };
    }
  }

  /**
   * Handle back navigation
   * @private
   */
  _handleBack(menu, context) {
    if (menu.backAction === 'parent' && menu.parent) {
      return { action: 'navigate', target: menu.parent };
    } else if (menu.backAction === 'main') {
      return { action: 'navigate', target: 'main_menu' };
    } else if (menu.backAction === 'end') {
      return { action: 'end', message: 'Thank you for using SiamSiam' };
    }
    
    return { action: 'navigate', target: menu.parent || 'main_menu' };
  }

  /**
   * Translate text (placeholder - implement i18n)
   * @private
   */
  _translate(text, language) {
    if (!language || language === this.defaultLanguage) return text;
    
    // PRODUCTION TODO: Implement proper i18n
    // return i18n.translate(text, language);
    return text;
  }

  /**
   * Render error message
   * @private
   */
  _renderError(message, language) {
    return `Error\n${this._translate(message, language)}\n\n0. Back`;
  }
}

module.exports = new MenuBuilder();