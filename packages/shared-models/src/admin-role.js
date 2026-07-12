const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Admin Role Model - Role Definitions and Permissions
 * 
 * Defines administrative roles with granular permission sets.
 * Supports role hierarchy, inheritance, and scoped permissions.
 * 
 * TABLE: admin_roles
 * 
 * ROLE HIERARCHY:
 * - super_admin: Full system access
 * - admin: Platform administration
 * - manager: Team/department management
 * - support_lead: Support team lead
 * - support_agent: Customer support
 * - finance: Financial operations
 * - content: Content management
 * - viewer: Read-only access
 * 
 * PERMISSION SCOPES:
 * - global: Access to everything
 * - tenant: Limited to specific tenant
 * - store: Limited to specific store
 * - self: Only own resources
 */

class AdminRole extends BaseModel {
  static tableName = 'admin_roles';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'name', 'slug', 'description',
    'permissions', 'scope', 'level',
    'is_system', 'is_active', 'is_editable',
    'parent_role_id', 'inherits_from',
    'max_sessions', 'requires_mfa',
    'allowed_ip_ranges', 'time_restrictions',
    'metadata', 'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    permissions: 'json',
    scope: 'json',
    inherits_from: 'json',
    allowed_ip_ranges: 'json',
    time_restrictions: 'json',
    metadata: 'json',
    is_system: 'boolean',
    is_active: 'boolean',
    is_editable: 'boolean',
    requires_mfa: 'boolean',
    max_sessions: 'integer',
    level: 'integer',
  };

  // Predefined permission groups
  static permissionGroups = {
    DASHBOARD: ['dashboard.view', 'dashboard.export'],
    USER_MANAGEMENT: [
      'users.view', 'users.create', 'users.edit', 'users.delete',
      'users.verify_kyc', 'users.suspend', 'users.export',
    ],
    MERCHANT_MANAGEMENT: [
      'merchants.view', 'merchants.create', 'merchants.edit', 'merchants.delete',
      'merchants.verify', 'merchants.suspend', 'merchants.export',
    ],
    ORDER_MANAGEMENT: [
      'orders.view', 'orders.edit', 'orders.cancel', 'orders.refund',
      'orders.export',
    ],
    PAYMENT_MANAGEMENT: [
      'payments.view', 'payments.refund', 'payments.reconcile',
      'payments.export',
    ],
    DELIVERY_MANAGEMENT: [
      'deliveries.view', 'deliveries.assign', 'deliveries.cancel',
      'deliveries.track', 'drivers.manage',
    ],
    FINANCIAL: [
      'finance.view_reports', 'finance.manage_settlements',
      'finance.fx_trading', 'finance.export',
    ],
    COMPLAINT_MANAGEMENT: [
      'complaints.view', 'complaints.respond', 'complaints.escalate',
      'complaints.resolve', 'complaints.export',
    ],
    SYSTEM_CONFIG: [
      'system.config_view', 'system.config_edit', 'system.feature_flags',
      'system.maintenance_mode',
    ],
    SECURITY: [
      'security.view_logs', 'security.manage_roles', 'security.manage_api_keys',
      'security.view_audit_logs', 'security.incident_response',
    ],
    DEVELOPER_PORTAL: [
      'developers.view', 'developers.approve', 'developers.revoke',
      'developers.manage_api_keys',
    ],
    CONTENT: [
      'content.view', 'content.create', 'content.edit', 'content.delete',
      'content.publish',
    ],
    REFUND_MANAGEMENT: [
      'refunds.view', 'refunds.approve', 'refunds.deny',
      'refunds.process', 'refunds.export',
    ],
    REFERRAL_MANAGEMENT: [
      'referrals.view', 'referrals.configure', 'referrals.export',
    ],
    ANALYTICS: [
      'analytics.view', 'analytics.export', 'analytics.custom_reports',
    ],
  };

  // System roles that cannot be modified
  static systemRoles = [
    'super_admin', 'admin', 'manager', 'support_lead',
    'support_agent', 'finance', 'content_manager', 'viewer',
  ];

  /**
   * Find role by slug
   * @param {string} slug - Role slug
   */
  static async findBySlug(slug) {
    return this.findOne({
      where: { slug, is_active: true },
    });
  }

  /**
   * Get all permissions for a role (including inherited)
   * @param {string} roleId - Role ID
   * @returns {Promise<string[]>} Array of permission strings
   */
  static async getAllPermissions(roleId) {
    const role = await this.findById(roleId);
    if (!role) return [];

    let permissions = [...(role.permissions || [])];

    // Include inherited permissions
    if (role.inherits_from && role.inherits_from.length > 0) {
      for (const parentRoleId of role.inherits_from) {
        const parentPermissions = await this.getAllPermissions(parentRoleId);
        permissions = [...new Set([...permissions, ...parentPermissions])];
      }
    }

    // Super admin has all permissions
    if (permissions.includes('*')) {
      return ['*'];
    }

    return permissions;
  }

  /**
   * Check if role has a specific permission
   * @param {string} roleId - Role ID
   * @param {string} permission - Permission to check
   * @returns {Promise<boolean>} True if role has permission
   */
  static async hasPermission(roleId, permission) {
    const permissions = await this.getAllPermissions(roleId);
    
    // Wildcard grants everything
    if (permissions.includes('*')) return true;
    
    // Check for exact permission or wildcard match
    return permissions.some(p => {
      if (p === permission) return true;
      // Check for group wildcards (e.g., "users.*" matches "users.create")
      if (p.endsWith('.*')) {
        const group = p.replace('.*', '');
        return permission.startsWith(group + '.');
      }
      return false;
    });
  }

  /**
   * Get roles by level (hierarchical)
   * @param {number} minLevel - Minimum level (inclusive)
   * @param {number} maxLevel - Maximum level (inclusive)
   */
  static async findByLevel(minLevel, maxLevel = null) {
    const criteria = { is_active: true };
    
    return this.findAll({
      where: criteria,
      orderBy: { level: 'ASC' },
    });
  }

  /**
   * Create a system role (immutable)
   * @param {Object} roleData - Role configuration
   */
  static async createSystemRole(roleData) {
    return this.create({
      ...roleData,
      is_system: true,
      is_editable: false,
    });
  }

  /**
   * Get role hierarchy tree
   */
  static async getHierarchy() {
    const roles = await this.findAll({
      where: { is_active: true },
      orderBy: { level: 'ASC' },
    });

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

module.exports = AdminRole;