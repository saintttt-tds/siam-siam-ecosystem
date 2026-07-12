const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * POS Permission Model - POS Permission Definitions
 * 
 * Defines granular permissions for POS system operations.
 * Permissions are organized into logical groups and assigned to POS roles.
 * Supports hierarchical permission inheritance and override capabilities.
 * 
 * TABLE: pos_permissions
 * 
 * PERMISSION GROUPS:
 * - sales: Sales transaction operations
 * - inventory: Product and stock management
 * - customers: Customer data management
 * - discounts: Discount application and overrides
 * - refunds: Return and refund processing
 * - voids: Transaction voiding
 * - cash_management: Cash drawer and float operations
 * - reports: Reporting and analytics
 * - settings: System configuration
 * - admin: User and role management
 * - offline: Offline mode operations
 */

class PosPermission extends BaseModel {
  static tableName = 'pos_permissions';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'name', 'slug', 'description',
    'group_name', 'group_slug', 'group_description',
    'group_icon', 'group_sort_order',
    'is_active', 'is_system', 'is_critical',
    'requires_approval', 'approval_threshold_amount',
    'requires_supervisor', 'requires_manager',
    'sort_order', 'display_order',
    'audit_logged', 'notification_on_use',
    'applicable_device_types', 'applicable_roles',
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    is_active: 'boolean', is_system: 'boolean',
    is_critical: 'boolean', requires_approval: 'boolean',
    requires_supervisor: 'boolean', requires_manager: 'boolean',
    audit_logged: 'boolean', notification_on_use: 'boolean',
    sort_order: 'integer', display_order: 'integer',
    group_sort_order: 'integer', approval_threshold_amount: 'float',
    applicable_device_types: 'json', applicable_roles: 'json',
    metadata: 'json', tags: 'json',
  };

  static relations = {
    roles: {
      type: 'hasMany',
      model: 'PosRole',
      foreignKey: 'permission_id',
      localKey: 'id',
      through: 'pos_role_permissions',
    },
  };

  // Permission groups with metadata
  static groups = {
    SALES: {
      slug: 'sales', name: 'Sales Operations',
      description: 'Sales transaction processing and management',
      icon: 'shopping-cart', sortOrder: 1,
    },
    INVENTORY: {
      slug: 'inventory', name: 'Inventory Management',
      description: 'Product catalog and stock management',
      icon: 'package', sortOrder: 2,
    },
    CUSTOMERS: {
      slug: 'customers', name: 'Customer Management',
      description: 'Customer data and relationship management',
      icon: 'users', sortOrder: 3,
    },
    DISCOUNTS: {
      slug: 'discounts', name: 'Discounts & Promotions',
      description: 'Discount application and override management',
      icon: 'tag', sortOrder: 4,
    },
    REFUNDS: {
      slug: 'refunds', name: 'Refunds & Returns',
      description: 'Customer refund and return processing',
      icon: 'refresh-cw', sortOrder: 5,
    },
    VOIDS: {
      slug: 'voids', name: 'Transaction Voids',
      description: 'Transaction voiding and cancellation',
      icon: 'x-circle', sortOrder: 6,
    },
    CASH_MANAGEMENT: {
      slug: 'cash_management', name: 'Cash Management',
      description: 'Cash drawer, float, and reconciliation operations',
      icon: 'dollar-sign', sortOrder: 7,
    },
    REPORTS: {
      slug: 'reports', name: 'Reports & Analytics',
      description: 'Sales reports, analytics, and data export',
      icon: 'bar-chart', sortOrder: 8,
    },
    SETTINGS: {
      slug: 'settings', name: 'System Settings',
      description: 'POS system configuration and preferences',
      icon: 'settings', sortOrder: 9,
    },
    ADMIN: {
      slug: 'admin', name: 'Administration',
      description: 'User, role, and device management',
      icon: 'shield', sortOrder: 10,
    },
    OFFLINE: {
      slug: 'offline', name: 'Offline Operations',
      description: 'Offline mode processing and synchronization',
      icon: 'cloud-off', sortOrder: 11,
    },
  };

  // All predefined permissions with full metadata
  static predefinedPermissions = [
    // Sales Group
    {
      name: 'Process Sales', slug: 'process_sale', group: 'sales',
      description: 'Create and complete sales transactions including product scanning, price lookups, and payment processing',
      isCritical: true, auditLogged: true, sortOrder: 1,
    },
    {
      name: 'Override Price', slug: 'override_price', group: 'sales',
      description: 'Override product prices during sale transactions, subject to approval thresholds',
      isCritical: true, auditLogged: true, requiresApproval: true, approvalThresholdAmount: 50,
      sortOrder: 2,
    },
    {
      name: 'Hold Transaction', slug: 'hold_transaction', group: 'sales',
      description: 'Place an active transaction on hold for later retrieval and completion',
      auditLogged: true, sortOrder: 3,
    },
    {
      name: 'Resume Transaction', slug: 'resume_transaction', group: 'sales',
      description: 'Retrieve and resume previously held transactions',
      auditLogged: true, sortOrder: 4,
    },
    {
      name: 'Cancel Transaction', slug: 'cancel_transaction', group: 'sales',
      description: 'Cancel an active transaction before completion',
      auditLogged: true, sortOrder: 5,
    },
    {
      name: 'Split Tender', slug: 'split_tender', group: 'sales',
      description: 'Accept multiple payment methods for a single transaction',
      sortOrder: 6,
    },
    {
      name: 'Process Layaway', slug: 'process_layaway', group: 'sales',
      description: 'Create and manage layaway payment plans',
      auditLogged: true, sortOrder: 7,
    },

    // Inventory Group
    {
      name: 'View Products', slug: 'view_products', group: 'inventory',
      description: 'View product catalog including prices, descriptions, and images',
      isCritical: true, sortOrder: 1,
    },
    {
      name: 'Search Products', slug: 'search_products', group: 'inventory',
      description: 'Search and filter products by name, SKU, barcode, or category',
      sortOrder: 2,
    },
    {
      name: 'View Inventory Levels', slug: 'view_inventory', group: 'inventory',
      description: 'View current stock levels and inventory status across locations',
      isCritical: true, sortOrder: 3,
    },
    {
      name: 'Adjust Inventory', slug: 'adjust_inventory', group: 'inventory',
      description: 'Manually adjust inventory quantities for stock corrections, damages, or write-offs',
      isCritical: true, auditLogged: true, requiresSupervisor: true, sortOrder: 4,
    },
    {
      name: 'Receive Stock', slug: 'receive_stock', group: 'inventory',
      description: 'Process incoming stock deliveries and update inventory',
      auditLogged: true, sortOrder: 5,
    },
    {
      name: 'Transfer Stock', slug: 'transfer_stock', group: 'inventory',
      description: 'Transfer inventory between locations or branches',
      auditLogged: true, requiresSupervisor: true, sortOrder: 6,
    },
    {
      name: 'Stock Count', slug: 'stock_count', group: 'inventory',
      description: 'Perform physical stock counts and reconcile with system',
      auditLogged: true, sortOrder: 7,
    },
    {
      name: 'Manage Purchase Orders', slug: 'manage_purchase_orders', group: 'inventory',
      description: 'Create, edit, and manage purchase orders for suppliers',
      requiresManager: true, sortOrder: 8,
    },

    // Customers Group
    {
      name: 'View Customers', slug: 'view_customers', group: 'customers',
      description: 'View customer profiles and purchase history',
      sortOrder: 1,
    },
    {
      name: 'Create Customer', slug: 'create_customer', group: 'customers',
      description: 'Create new customer records during or outside of transactions',
      sortOrder: 2,
    },
    {
      name: 'Edit Customer', slug: 'edit_customer', group: 'customers',
      description: 'Edit customer information including contact details and preferences',
      auditLogged: true, sortOrder: 3,
    },
    {
      name: 'View Customer Purchase History', slug: 'view_purchase_history', group: 'customers',
      description: 'Access detailed customer purchase history and transaction records',
      sortOrder: 4,
    },
    {
      name: 'Apply Store Credit', slug: 'apply_store_credit', group: 'customers',
      description: 'Apply store credit to customer accounts and transactions',
      auditLogged: true, sortOrder: 5,
    },

    // Discounts Group
    {
      name: 'Apply Standard Discounts', slug: 'apply_discounts', group: 'discounts',
      description: 'Apply predefined standard discounts to transactions',
      sortOrder: 1,
    },
    {
      name: 'Apply Custom Discount', slug: 'apply_custom_discount', group: 'discounts',
      description: 'Create and apply custom percentage or amount discounts',
      auditLogged: true, sortOrder: 2,
    },
    {
      name: 'Override Discount Limits', slug: 'override_discounts', group: 'discounts',
      description: 'Override maximum discount limits and restrictions',
      isCritical: true, auditLogged: true, requiresSupervisor: true, sortOrder: 3,
    },
    {
      name: 'Apply Promo Codes', slug: 'apply_promo_codes', group: 'discounts',
      description: 'Enter and validate promotional codes for discounts',
      sortOrder: 4,
    },
    {
      name: 'Price Match', slug: 'price_match', group: 'discounts',
      description: 'Match competitor pricing with manager approval',
      auditLogged: true, requiresManager: true, sortOrder: 5,
    },

    // Refunds Group
    {
      name: 'Process Refund', slug: 'process_refund', group: 'refunds',
      description: 'Process customer refunds for returned items',
      isCritical: true, auditLogged: true, sortOrder: 1,
    },
    {
      name: 'Refund Without Receipt', slug: 'refund_without_receipt', group: 'refunds',
      description: 'Process refunds when original receipt is not available',
      isCritical: true, auditLogged: true, requiresSupervisor: true, sortOrder: 2,
    },
    {
      name: 'Process Exchange', slug: 'process_exchange', group: 'refunds',
      description: 'Process product exchanges with price adjustments',
      auditLogged: true, sortOrder: 3,
    },
    {
      name: 'Override Refund Method', slug: 'override_refund_method', group: 'refunds',
      description: 'Override the original payment method for refunds',
      isCritical: true, auditLogged: true, requiresManager: true, sortOrder: 4,
    },

    // Voids Group
    {
      name: 'Void Current Transaction', slug: 'void_transaction', group: 'voids',
      description: 'Void an active transaction before payment completion',
      auditLogged: true, sortOrder: 1,
    },
    {
      name: 'Void Completed Transaction', slug: 'void_completed_transaction', group: 'voids',
      description: 'Void a transaction that has already been completed',
      isCritical: true, auditLogged: true, requiresSupervisor: true, sortOrder: 2,
    },
    {
      name: 'Void Line Item', slug: 'void_line_item', group: 'voids',
      description: 'Remove individual line items from an active transaction',
      auditLogged: true, sortOrder: 3,
    },

    // Cash Management Group
    {
      name: 'Open Cash Drawer', slug: 'open_cash_drawer', group: 'cash_management',
      description: 'Open cash drawer for transactions and cash handling',
      auditLogged: true, sortOrder: 1,
    },
    {
      name: 'No-Sale Open', slug: 'no_sale_open', group: 'cash_management',
      description: 'Open cash drawer without a transaction (change, etc.)',
      auditLogged: true, sortOrder: 2,
    },
    {
      name: 'Cash In', slug: 'cash_in', group: 'cash_management',
      description: 'Add cash to drawer (float replenishment, deposits)',
      auditLogged: true, sortOrder: 3,
    },
    {
      name: 'Cash Out', slug: 'cash_out', group: 'cash_management',
      description: 'Remove cash from drawer (banking, transfer)',
      auditLogged: true, requiresSupervisor: true, sortOrder: 4,
    },
    {
      name: 'Close Register', slug: 'close_register', group: 'cash_management',
      description: 'Close register and perform end-of-day cash count',
      isCritical: true, auditLogged: true, sortOrder: 5,
    },
    {
      name: 'Reconcile Register', slug: 'reconcile_register', group: 'cash_management',
      description: 'Reconcile cash drawer against expected totals',
      auditLogged: true, requiresManager: true, sortOrder: 6,
    },

    // Reports Group
    {
      name: 'View Daily Summary', slug: 'view_daily_summary', group: 'reports',
      description: 'View end-of-day sales summary reports',
      sortOrder: 1,
    },
    {
      name: 'View Sales Reports', slug: 'view_sales_reports', group: 'reports',
      description: 'Access detailed sales reports with filtering and date ranges',
      sortOrder: 2,
    },
    {
      name: 'View Inventory Reports', slug: 'view_inventory_reports', group: 'reports',
      description: 'Access inventory valuation, movement, and shortage reports',
      sortOrder: 3,
    },
    {
      name: 'View Employee Reports', slug: 'view_employee_reports', group: 'reports',
      description: 'Access employee sales performance and activity reports',
      requiresManager: true, sortOrder: 4,
    },
    {
      name: 'Export Reports', slug: 'export_reports', group: 'reports',
      description: 'Export reports to CSV, PDF, or Excel formats',
      sortOrder: 5,
    },

    // Settings Group
    {
      name: 'View Settings', slug: 'view_settings', group: 'settings',
      description: 'View POS system settings and configuration',
      sortOrder: 1,
    },
    {
      name: 'Edit Settings', slug: 'edit_settings', group: 'settings',
      description: 'Modify POS system settings and preferences',
      requiresManager: true, sortOrder: 2,
    },
    {
      name: 'Manage Receipt Templates', slug: 'manage_receipt_templates', group: 'settings',
      description: 'Customize receipt layouts and templates',
      requiresManager: true, sortOrder: 3,
    },
    {
      name: 'Manage Tax Rates', slug: 'manage_tax_rates', group: 'settings',
      description: 'Configure tax rates and tax categories',
      requiresManager: true, sortOrder: 4,
    },

    // Admin Group
    {
      name: 'Manage POS Users', slug: 'manage_pos_users', group: 'admin',
      description: 'Create, edit, and deactivate POS user accounts',
      isCritical: true, auditLogged: true, requiresManager: true, sortOrder: 1,
    },
    {
      name: 'Manage POS Roles', slug: 'manage_pos_roles', group: 'admin',
      description: 'Create, edit, and assign POS roles and permissions',
      isCritical: true, auditLogged: true, requiresManager: true, sortOrder: 2,
    },
    {
      name: 'Manage Devices', slug: 'manage_devices', group: 'admin',
      description: 'Register, configure, and deactivate POS devices',
      requiresManager: true, sortOrder: 3,
    },
    {
      name: 'View Audit Logs', slug: 'view_audit_logs', group: 'admin',
      description: 'Access POS audit logs and activity history',
      requiresManager: true, sortOrder: 4,
    },

    // Offline Group
    {
      name: 'Enable Offline Mode', slug: 'enable_offline_mode', group: 'offline',
      description: 'Switch POS to offline mode when connectivity is lost',
      isCritical: true, sortOrder: 1,
    },
    {
      name: 'Sync Offline Transactions', slug: 'sync_offline_data', group: 'offline',
      description: 'Sync queued offline transactions when connectivity is restored',
      isCritical: true, auditLogged: true, sortOrder: 2,
    },
    {
      name: 'View Offline Queue', slug: 'view_offline_queue', group: 'offline',
      description: 'View pending offline transactions awaiting sync',
      sortOrder: 3,
    },
    {
      name: 'Clear Offline Queue', slug: 'clear_offline_queue', group: 'offline',
      description: 'Clear stuck or failed offline transactions',
      auditLogged: true, requiresSupervisor: true, sortOrder: 4,
    },
  ];

  /**
   * Seed default permissions into database
   * @param {string} tenantId - Optional tenant ID for multi-tenant setups
   * @returns {Promise<Array>} Created permission records
   */
  static async seedDefaults(tenantId = null) {
    const created = [];
    const skipped = [];

    for (const perm of this.predefinedPermissions) {
      const existing = await this.findOne({
        where: { slug: perm.slug, tenant_id: tenantId },
      });

      if (!existing) {
        const groupConfig = this.groups[perm.group.toUpperCase()] || {};
        const record = await this.create({
          name: perm.name,
          slug: perm.slug,
          description: perm.description,
          group_name: groupConfig.name || perm.group,
          group_slug: perm.group,
          group_description: groupConfig.description,
          group_icon: groupConfig.icon,
          group_sort_order: groupConfig.sortOrder || 99,
          is_active: true,
          is_system: true,
          is_critical: perm.isCritical || false,
          requires_approval: perm.requiresApproval || false,
          approval_threshold_amount: perm.approvalThresholdAmount || null,
          requires_supervisor: perm.requiresSupervisor || false,
          requires_manager: perm.requiresManager || false,
          sort_order: perm.sortOrder || 99,
          display_order: perm.sortOrder || 99,
          audit_logged: perm.auditLogged || false,
          notification_on_use: perm.notificationOnUse || false,
          metadata: { seeded: true, seededAt: new Date().toISOString() },
          tenant_id: tenantId,
          created_by: 'system_seed',
        });
        created.push(record);
      } else {
        skipped.push(existing.slug);
      }
    }

    if (created.length > 0) {
      logger.info('POS permissions seeded', { created: created.length, skipped: skipped.length });
    }

    return { created, skipped };
  }

  /**
   * Get permissions grouped by group
   * @param {boolean} activeOnly - Return only active permissions
   * @returns {Promise<Object>} Permissions organized by group
   */
  static async getGrouped(activeOnly = true) {
    const criteria = {};
    if (activeOnly) criteria.is_active = true;

    const permissions = await this.findAll({
      where: criteria,
      orderBy: { group_sort_order: 'ASC', sort_order: 'ASC' },
    });

    const grouped = {};
    for (const perm of permissions) {
      const group = perm.group_slug || 'other';
      if (!grouped[group]) {
        grouped[group] = {
          name: perm.group_name || group,
          slug: group,
          description: perm.group_description,
          icon: perm.group_icon,
          permissions: [],
        };
      }
      grouped[group].permissions.push(perm);
    }

    return grouped;
  }

  /**
   * Get permission by slug
   * @param {string} slug - Permission slug
   * @returns {Promise<Object|null>} Permission or null
   */
  static async findBySlug(slug) {
    return this.findOne({ where: { slug, is_active: true } });
  }

  /**
   * Get permissions by group slug
   * @param {string} groupSlug - Group identifier
   * @returns {Promise<Array>} Permissions in the group
   */
  static async findByGroup(groupSlug) {
    return this.findAll({
      where: { group_slug: groupSlug, is_active: true },
      orderBy: { sort_order: 'ASC' },
    });
  }

  /**
   * Get critical permissions (audit-logged, high-risk operations)
   * @returns {Promise<Array>} Critical permissions
   */
  static async getCritical() {
    return this.findAll({
      where: { is_critical: true, is_active: true },
      orderBy: { group_sort_order: 'ASC', sort_order: 'ASC' },
    });
  }

  /**
   * Get permissions that require supervisor approval
   * @returns {Promise<Array>} Supervisor-required permissions
   */
  static async getSupervisorRequired() {
    return this.findAll({
      where: { requires_supervisor: true, is_active: true },
      orderBy: { group_sort_order: 'ASC' },
    });
  }

  /**
   * Get permissions that require manager approval
   * @returns {Promise<Array>} Manager-required permissions
   */
  static async getManagerRequired() {
    return this.findAll({
      where: { requires_manager: true, is_active: true },
      orderBy: { group_sort_order: 'ASC' },
    });
  }

  /**
   * Check if a permission slug is valid
   * @param {string} slug - Permission slug to validate
   * @returns {Promise<boolean>} True if valid
   */
  static async isValidSlug(slug) {
    const count = await this.count({ where: { slug, is_active: true } });
    return count > 0;
  }

  /**
   * Create a custom permission (non-system)
   * @param {Object} permData - Permission data
   * @returns {Promise<Object>} Created permission
   */
  static async createCustom(permData) {
    if (!permData.slug) throw new Error('Permission slug is required');
    if (!permData.name) throw new Error('Permission name is required');

    const existing = await this.findOne({ where: { slug: permData.slug } });
    if (existing) throw new Error(`Permission with slug "${permData.slug}" already exists`);

    return this.create({
      name: permData.name,
      slug: permData.slug,
      description: permData.description || null,
      group_name: permData.groupName || 'Custom',
      group_slug: permData.groupSlug || 'custom',
      group_description: permData.groupDescription || 'Custom permissions',
      is_active: true,
      is_system: false,
      is_critical: permData.isCritical || false,
      requires_approval: permData.requiresApproval || false,
      approval_threshold_amount: permData.approvalThresholdAmount || null,
      requires_supervisor: permData.requiresSupervisor || false,
      requires_manager: permData.requiresManager || false,
      sort_order: permData.sortOrder || 999,
      audit_logged: permData.auditLogged || false,
      metadata: permData.metadata || {},
      tenant_id: permData.tenantId || null,
      created_by: permData.createdBy || 'system',
    });
  }

  /**
   * Disable a permission
   * @param {string} permissionId - Permission ID
   * @returns {Promise<Object>} Updated permission
   */
  static async disable(permissionId) {
    const perm = await this.findById(permissionId);
    if (!perm) throw new Error('Permission not found');
    if (perm.is_system) throw new Error('Cannot disable system permissions');

    return this.update({ id: permissionId }, {
      is_active: false,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Get permissions with usage counts (how many roles use each permission)
   * @returns {Promise<Array>} Permissions with usage statistics
   */
  static async getWithUsageStats() {
    const text = `
      SELECT 
        p.*,
        COUNT(prp.role_id) as role_count
      FROM ${this.tableName} p
      LEFT JOIN pos_role_permissions prp ON p.id = prp.permission_id
      WHERE p.is_active = true
      GROUP BY p.id
      ORDER BY p.group_sort_order ASC, p.sort_order ASC
    `;
    const result = await connectionPool.query(text);
    return result.rows;
  }
}

module.exports = PosPermission;