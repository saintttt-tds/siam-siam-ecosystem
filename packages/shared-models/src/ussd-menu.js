const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * USSD Menu Model - USSD Menu Configuration
 * 
 * Stores USSD menu structures and configurations.
 * Menus can be hierarchical with parent-child relationships
 * and support dynamic content, translations, and conditional logic.
 * 
 * TABLE: ussd_menus
 */

class UssdMenu extends BaseModel {
  static tableName = 'ussd_menus';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'menu_id', 'parent_id', 'root_menu_id',
    'title', 'title_translations', 'body', 'body_translations',
    'menu_type', 'menu_category',
    'items', 'dynamic_items_source', 'dynamic_items_config',
    'input_type', 'input_label', 'input_label_translations',
    'input_validation', 'input_max_length', 'input_min_length',
    'input_pattern', 'input_error_message', 'input_error_translations',
    'handler', 'handler_config', 'validator', 'validator_config',
    'timeout_seconds', 'max_retries', 'retry_message',
    'back_action', 'back_target', 'home_action',
    'footer', 'footer_translations',
    'language', 'fallback_language',
    'condition', 'condition_config', 'visibility_rule',
    'is_active', 'is_system', 'is_protected',
    'sort_order', 'display_order', 'priority',
    'access_roles', 'requires_auth', 'requires_pin',
    'requires_kyc', 'kyc_level_required',
    'allowed_networks', 'blocked_networks',
    'allowed_countries', 'blocked_countries',
    'rate_limit_per_minute', 'rate_limit_per_hour',
    'session_persist', 'session_ttl_seconds',
    'analytics_enabled', 'audit_log_enabled',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    title_translations: 'json', body_translations: 'json',
    items: 'json', dynamic_items_config: 'json',
    input_validation: 'json', handler_config: 'json',
    validator_config: 'json', condition_config: 'json',
    access_roles: 'json', allowed_networks: 'json',
    blocked_networks: 'json', allowed_countries: 'json',
    blocked_countries: 'json', footer_translations: 'json',
    input_label_translations: 'json', input_error_translations: 'json',
    metadata: 'json', tags: 'json',
    timeout_seconds: 'integer', max_retries: 'integer',
    input_max_length: 'integer', input_min_length: 'integer',
    sort_order: 'integer', display_order: 'integer', priority: 'integer',
    kyc_level_required: 'integer', rate_limit_per_minute: 'integer',
    rate_limit_per_hour: 'integer', session_ttl_seconds: 'integer',
    is_active: 'boolean', is_system: 'boolean', is_protected: 'boolean',
    requires_auth: 'boolean', requires_pin: 'boolean',
    requires_kyc: 'boolean', session_persist: 'boolean',
    analytics_enabled: 'boolean', audit_log_enabled: 'boolean',
  };

  static menuTypes = {
    MENU: 'menu', INPUT: 'input', CONFIRMATION: 'confirmation',
    DISPLAY: 'display', END: 'end', EXTERNAL: 'external',
    DYNAMIC: 'dynamic', CONDITIONAL: 'conditional',
  };

  static inputTypes = {
    SELECTION: 'selection', TEXT: 'text', NUMBER: 'number',
    PHONE: 'phone', AMOUNT: 'amount', PIN: 'pin',
    ACCOUNT: 'account', REFERENCE: 'reference',
    METER_NUMBER: 'meter_number', DATE: 'date',
    CONFIRMATION: 'confirmation',
  };

  /**
   * Find menu by menu_id
   */
  static async findByMenuId(menuId) {
    return this.findOne({ where: { menu_id: menuId, is_active: true } });
  }

  /**
   * Get menu tree starting from root
   */
  static async getMenuTree(rootMenuId = 'main_menu') {
    const menus = await this.findAll({ where: { is_active: true }, orderBy: { sort_order: 'ASC' } });
    const buildTree = (parentId) => {
      return menus.filter(m => m.parent_id === parentId).map(menu => ({
        ...menu.toJSON(),
        children: buildTree(menu.menu_id),
      }));
    };
    return buildTree(rootMenuId);
  }

  /**
   * Get children of a menu
   */
  static async getChildren(parentId) {
    return this.findAll({ where: { parent_id: parentId, is_active: true }, orderBy: { sort_order: 'ASC' } });
  }

  /**
   * Get all menus in a flat list
   */
  static async getAllMenus() {
    return this.findAll({ where: { is_active: true }, orderBy: { sort_order: 'ASC' } });
  }
}

module.exports = UssdMenu;