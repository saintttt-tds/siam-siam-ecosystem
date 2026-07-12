const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * POS Role Model - POS Role Definitions
 * 
 * Defines roles for POS system users with associated permissions.
 * Supports role hierarchy, inheritance, and scoped permissions.
 * Each role is assigned a set of permissions that determine
 * what operations a user can perform on the POS system.
 * 
 * TABLE: pos_roles
 * 
 * PREDEFINED ROLES:
 * - till_operator: Basic sales processing
 * - senior_operator: Sales with some overrides
 * - supervisor: Shift management and approvals
 * - branch_manager: Branch-level administration
 * - store_owner: Full store control
 * - inventory_clerk: Inventory management focus
 * - finance_officer: Financial operations access
 * - viewer: Read-only access to reports
 */

class PosRole extends BaseModel {
  static tableName = 'pos_roles';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'name', 'slug', 'description',
    'role_type', 'level', 'parent_role_id',
    'is_active', 'is_system', 'is_default',
    'can_be_deleted', 'can_be_modified',
    'max_discount_percent', 'max_discount_amount',
    'max_refund_amount', 'max_void_amount',
    'max_cash_out_amount', 'max_price_override_percent',
    'requires_supervisor_for_overrides',
    'allowed_tender_types', 'restricted_tender_types',
    'allowed_device_types', 'allowed_branches',
    'shift_required', 'cash_drawer_required',
    'can_process_offline', 'max_offline_transactions',
    'time_restrictions', 'day_restrictions',
    'permissions', 'inherited_permissions',
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    is_active: 'boolean', is_system: 'boolean',
    is_default: 'boolean', can_be_deleted: 'boolean',
    can_be_modified: 'boolean',
    requires_supervisor_for_overrides: 'boolean',
    shift_required: 'boolean', cash_drawer_required: 'boolean',
    can_process_offline: 'boolean',
    level: 'integer', max_discount_percent: 'float',
    max_discount_amount: 'float', max_refund_amount: 'float',
    max_void_amount: 'float', max_cash_out_amount: 'float',
    max_price_override_percent: 'float',
    max_offline_transactions: 'integer',
    allowed_tender_types: 'json', restricted_tender_types: 'json',
    allowed_device_types: 'json', allowed_branches: 'json',
    time_restrictions: 'json', day_restrictions: 'json',
    permissions: 'json', inherited_permissions: 'json',
    metadata: 'json', tags: 'json',
  };

  static relations = {
    parentRole: { type: 'belongsTo', model: 'PosRole', foreignKey: 'parent_role_id', ownerKey: 'id' },
    childRoles: { type: 'hasMany', model: 'PosRole', foreignKey: 'parent_role_id', localKey: 'id' },
  };

  static roleTypes = {
    TILL_OPERATOR: 'till_operator',
    SENIOR_OPERATOR: 'senior_operator',
    SUPERVISOR: 'supervisor',
    BRANCH_MANAGER: 'branch_manager',
    STORE_OWNER: 'store_owner',
    INVENTORY_CLERK: 'inventory_clerk',
    FINANCE_OFFICER: 'finance_officer',
    VIEWER: 'viewer',
    CUSTOM: 'custom',
  };

  // Predefined roles with their default permissions
  static predefinedRoles = [
    {
      name: 'Till Operator', slug: 'till_operator', type: 'till_operator', level: 1,
      description: 'Basic POS operator for processing standard sales transactions',
      isDefault: true, canBeDeleted: false, canBeModified: true,
      maxDiscountPercent: 10, maxDiscountAmount: 50, maxRefundAmount: 100,
      maxVoidAmount: 50, maxPriceOverridePercent: 5,
      permissions: [
        'process_sale', 'view_products', 'search_products', 'view_inventory',
        'view_customers', 'create_customer', 'apply_discounts',
        'process_refund', 'void_transaction', 'void_line_item',
        'open_cash_drawer', 'cash_in', 'close_register',
        'view_daily_summary', 'view_sales_reports',
        'split_tender', 'hold_transaction', 'resume_transaction',
        'enable_offline_mode', 'sync_offline_data', 'view_offline_queue',
      ],
    },
    {
      name: 'Senior Operator', slug: 'senior_operator', type: 'senior_operator', level: 2,
      parentRoleSlug: 'till_operator',
      description: 'Experienced operator with additional override capabilities',
      maxDiscountPercent: 20, maxDiscountAmount: 100, maxRefundAmount: 250,
      maxVoidAmount: 100, maxPriceOverridePercent: 10,
      permissions: [
        'apply_custom_discount', 'override_price', 'cancel_transaction',
        'refund_without_receipt', 'process_exchange', 'apply_promo_codes',
        'adjust_inventory', 'receive_stock', 'stock_count',
        'edit_customer', 'apply_store_credit',
        'export_reports', 'view_settings',
      ],
    },
    {
      name: 'Supervisor', slug: 'supervisor', type: 'supervisor', level: 3,
      parentRoleSlug: 'senior_operator',
      description: 'Shift supervisor with approval authority and staff management',
      maxDiscountPercent: 30, maxDiscountAmount: 250, maxRefundAmount: 500,
      maxVoidAmount: 250, maxPriceOverridePercent: 15, maxCashOutAmount: 500,
      permissions: [
        'override_discounts', 'override_refund_method',
        'void_completed_transaction', 'cash_out', 'reconcile_register',
        'transfer_stock', 'clear_offline_queue', 'view_employee_reports',
        'manage_receipt_templates',
      ],
    },
    {
      name: 'Branch Manager', slug: 'branch_manager', type: 'branch_manager', level: 4,
      parentRoleSlug: 'supervisor',
      description: 'Full branch management including user administration',
      maxDiscountPercent: 50, maxDiscountAmount: 500, maxRefundAmount: 1000,
      maxVoidAmount: 500, maxPriceOverridePercent: 25, maxCashOutAmount: 1000,
      permissions: [
        'manage_pos_users', 'manage_pos_roles', 'manage_devices',
        'manage_purchase_orders', 'edit_settings', 'manage_tax_rates',
        'view_audit_logs', 'price_match',
      ],
    },
    {
      name: 'Store Owner', slug: 'store_owner', type: 'store_owner', level: 5,
      description: 'Complete store access with all permissions',
      maxDiscountPercent: 100, maxDiscountAmount: null, maxRefundAmount: null,
      maxVoidAmount: null, maxPriceOverridePercent: 100, maxCashOutAmount: null,
      permissions: ['*'], // Wildcard - all permissions
    },
    {
      name: 'Inventory Clerk', slug: 'inventory_clerk', type: 'inventory_clerk', level: 1,
      description: 'Focused on inventory management without sales processing',
      permissions: [
        'view_products', 'search_products', 'view_inventory',
        'adjust_inventory', 'receive_stock', 'transfer_stock',
        'stock_count', 'manage_purchase_orders',
        'view_inventory_reports', 'export_reports',
      ],
    },
    {
      name: 'Finance Officer', slug: 'finance_officer', type: 'finance_officer', level: 3,
      description: 'Financial operations and reconciliation access',
      permissions: [
        'view_sales_reports', 'view_inventory_reports', 'view_employee_reports',
        'export_reports', 'reconcile_register', 'cash_in', 'cash_out',
        'view_daily_summary', 'view_audit_logs',
        'view_settings', 'manage_tax_rates',
      ],
    },
    {
      name: 'Viewer', slug: 'viewer', type: 'viewer', level: 0,
      description: 'Read-only access to reports and product information',
      maxDiscountPercent: 0, maxRefundAmount: 0, maxVoidAmount: 0,
      permissions: [
        'view_products', 'search_products', 'view_inventory',
        'view_customers', 'view_purchase_history',
        'view_daily_summary', 'view_sales_reports',
        'view_inventory_reports', 'view_settings',
      ],
    },
  ];

  static hooks = {
    beforeCreate: [
      async (data) => {
        // If parent role specified, inherit its permissions
        if (data.parent_role_id) {
          const parentRole = await PosRole.findById(data.parent_role_id);
          if (parentRole) {
            const parentPermissions = parentRole.permissions || [];
            const ownPermissions = data.permissions || [];
            const allPermissions = [...new Set([...parentPermissions, ...ownPermissions])];
            data.inherited_permissions = parentPermissions;
            data.permissions = allPermissions;
          }
        }
      },
    ],
  };

  /**
   * Seed default POS roles
   */
  static async seedDefaults(tenantId = null) {
    const created = [];
    
    for (const roleDef of this.predefinedRoles) {
      const existing = await this.findOne({ where: { slug: roleDef.slug, tenant_id: tenantId } });
      if (!existing) {
        let parentRoleId = null;
        if (roleDef.parentRoleSlug) {
          const parent = await this.findOne({ where: { slug: roleDef.parentRoleSlug, tenant_id: tenantId } });
          if (parent) parentRoleId = parent.id;
        }

        const role = await this.create({
          name: roleDef.name, slug: roleDef.slug,
          description: roleDef.description,
          role_type: roleDef.type, level: roleDef.level,
          parent_role_id: parentRoleId,
          is_active: true, is_system: true,
          is_default: roleDef.isDefault || false,
          can_be_deleted: roleDef.canBeDeleted !== false,
          can_be_modified: roleDef.canBeModified !== false,
          max_discount_percent: roleDef.maxDiscountPercent ?? 10,
          max_discount_amount: roleDef.maxDiscountAmount ?? null,
          max_refund_amount: roleDef.maxRefundAmount ?? null,
          max_void_amount: roleDef.maxVoidAmount ?? null,
          max_cash_out_amount: roleDef.maxCashOutAmount ?? null,
          max_price_override_percent: roleDef.maxPriceOverridePercent ?? 0,
          permissions: roleDef.permissions || [],
          metadata: { seeded: true, seededAt: new Date().toISOString() },
          tenant_id: tenantId,
          created_by: 'system_seed',
        });
        created.push(role);
      }
    }

    logger.info('POS roles seeded', { created: created.length });
    return created;
  }

  /**
   * Get all permissions for a role (including inherited)
   */
  static async getAllPermissions(roleId) {
    const role = await this.findById(roleId);
    if (!role) return [];

    let permissions = [...(role.permissions || [])];

    // Super admin wildcard
    if (permissions.includes('*')) return ['*'];

    // Include inherited permissions from parent roles
    let parentId = role.parent_role_id;
    const visited = new Set([roleId]);
    
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = await this.findById(parentId);
      if (parent) {
        const parentPerms = parent.permissions || [];
        if (parentPerms.includes('*')) return ['*'];
        permissions = [...new Set([...permissions, ...parentPerms])];
        parentId = parent.parent_role_id;
      } else {
        break;
      }
    }

    return permissions;
  }

  /**
   * Check if a role has a specific permission
   */
  static async hasPermission(roleId, permission) {
    const permissions = await this.getAllPermissions(roleId);
    return permissions.includes('*') || permissions.includes(permission);
  }

  /**
   * Find role by slug
   */
  static async findBySlug(slug, tenantId = null) {
    const criteria = { slug };
    if (tenantId) criteria.tenant_id = tenantId;
    return this.findOne({ where: criteria });
  }

  /**
   * Get role hierarchy tree
   */
  static async getHierarchy(tenantId = null) {
    const criteria = { is_active: true };
    if (tenantId) criteria.tenant_id = tenantId;

    const roles = await this.findAll({ where: criteria, orderBy: { level: 'ASC' } });

    const buildTree = (parentId = null) => {
      return roles
        .filter(r => r.parent_role_id === parentId)
        .map(role => ({
          ...role,
          children: buildTree(role.id),
        }));
    };

    return buildTree(null);
  }
}

module.exports = PosRole;