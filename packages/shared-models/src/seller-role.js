const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Seller Role Model - Marketplace Seller Role
 * 
 * Defines roles for marketplace sellers with associated permissions.
 * Supports B2B2C model where store owners can create sub-accounts
 * with granular permissions for their staff.
 * 
 * TABLE: seller_roles
 */

class SellerRole extends BaseModel {
  static tableName = 'seller_roles';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'merchant_id', 'store_id',
    'name', 'slug', 'description', 'role_type',
    'level', 'parent_role_id', 'is_active', 'is_system',
    'is_default', 'can_be_deleted', 'can_be_modified',
    'permissions', 'inherited_permissions',
    'max_discount_percent', 'max_price_change_percent',
    'can_manage_products', 'can_manage_orders',
    'can_manage_inventory', 'can_manage_customers',
    'can_view_reports', 'can_export_data',
    'can_manage_staff', 'can_manage_settings',
    'can_process_refunds', 'max_refund_amount',
    'can_manage_shipping', 'can_manage_payments',
    'requires_approval_for', 'approval_threshold',
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    level: 'integer', max_discount_percent: 'float',
    max_price_change_percent: 'float', max_refund_amount: 'float',
    approval_threshold: 'float',
    is_active: 'boolean', is_system: 'boolean', is_default: 'boolean',
    can_be_deleted: 'boolean', can_be_modified: 'boolean',
    can_manage_products: 'boolean', can_manage_orders: 'boolean',
    can_manage_inventory: 'boolean', can_manage_customers: 'boolean',
    can_view_reports: 'boolean', can_export_data: 'boolean',
    can_manage_staff: 'boolean', can_manage_settings: 'boolean',
    can_process_refunds: 'boolean', can_manage_shipping: 'boolean',
    can_manage_payments: 'boolean',
    permissions: 'json', inherited_permissions: 'json',
    requires_approval_for: 'json', metadata: 'json', tags: 'json',
  };

  static roleTypes = {
    SHOP_OWNER: 'shop_owner', SHOP_MANAGER: 'shop_manager',
    PRODUCT_MANAGER: 'product_manager', ORDER_FULFILLER: 'order_fulfiller',
    CUSTOMER_SUPPORT: 'customer_support', VIEWER_ANALYST: 'viewer_analyst',
    INVENTORY_MANAGER: 'inventory_manager', MARKETING: 'marketing',
    FINANCE: 'finance', CUSTOM: 'custom',
  };

  // Predefined roles
  static predefinedRoles = [
    {
      name: 'Shop Owner', slug: 'shop_owner', type: 'shop_owner', level: 5,
      description: 'Full store control with all permissions',
      permissions: ['*'],
    },
    {
      name: 'Shop Manager', slug: 'shop_manager', type: 'shop_manager', level: 4,
      description: 'Day-to-day store management',
      permissions: ['manage_products', 'manage_orders', 'manage_inventory', 'manage_customers', 'view_reports', 'export_data', 'manage_shipping', 'process_refunds'],
    },
    {
      name: 'Product Manager', slug: 'product_manager', type: 'product_manager', level: 2,
      description: 'Product catalog management only',
      permissions: ['manage_products', 'manage_inventory', 'view_reports'],
    },
    {
      name: 'Order Fulfiller', slug: 'order_fulfiller', type: 'order_fulfiller', level: 1,
      description: 'Order processing and fulfillment only',
      permissions: ['manage_orders', 'manage_shipping', 'view_reports'],
    },
    {
      name: 'Customer Support', slug: 'customer_support', type: 'customer_support', level: 1,
      description: 'Handle customer inquiries and basic operations',
      permissions: ['manage_orders', 'manage_customers', 'process_refunds'],
    },
    {
      name: 'Viewer Analyst', slug: 'viewer_analyst', type: 'viewer_analyst', level: 0,
      description: 'Read-only access to reports and data',
      permissions: ['view_reports'],
    },
  ];

  /**
   * Seed default roles for a merchant
   */
  static async seedDefaults(merchantId, tenantId = null) {
    const created = [];
    for (const roleDef of this.predefinedRoles) {
      const existing = await this.findOne({ where: { slug: roleDef.slug, merchant_id: merchantId } });
      if (!existing) {
        const role = await this.create({
          merchant_id: merchantId, name: roleDef.name, slug: roleDef.slug,
          description: roleDef.description, role_type: roleDef.type, level: roleDef.level,
          permissions: roleDef.permissions, is_active: true, is_system: true,
          can_be_deleted: false, can_be_modified: true,
          metadata: { seeded: true }, tenant_id: tenantId, created_by: 'system_seed',
        });
        created.push(role);
      }
    }
    return created;
  }

  /**
   * Get roles by merchant
   */
  static async findByMerchant(merchantId) {
    return this.findAll({ where: { merchant_id: merchantId, is_active: true }, orderBy: { level: 'DESC' } });
  }

  /**
   * Check if role has permission
   */
  static async hasPermission(roleId, permission) {
    const role = await this.findById(roleId);
    if (!role) return false;
    const permissions = role.permissions || [];
    return permissions.includes('*') || permissions.includes(permission);
  }
}

module.exports = SellerRole;