const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Store Refund Policy Model - Store-Specific Refund Policy
 * 
 * Allows merchants to define custom refund policies that override
 * platform defaults. Policies can vary by product category and include
 * custom return windows, restocking fees, and conditions.
 * 
 * TABLE: store_refund_policies
 */

class StoreRefundPolicy extends BaseModel {
  static tableName = 'store_refund_policies';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'merchant_id', 'store_id',
    'policy_name', 'policy_slug', 'description',
    'policy_type', 'policy_scope', 'category',
    'sub_category', 'product_id',
    'return_window_days', 'return_window_type',
    'condition_required', 'condition_description',
    'restocking_fee_percent', 'restocking_fee_maximum',
    'restocking_fee_description',
    'requires_original_packaging', 'requires_tags',
    'requires_accessories', 'requires_manuals',
    'allowed_refund_methods', 'default_refund_method',
    'partial_refunds_allowed', 'max_partial_refunds',
    'requires_approval', 'approval_threshold',
    'auto_approve_under', 'auto_approve_conditions',
    'shipping_refundable', 'shipping_refund_conditions',
    'return_shipping_paid_by', 'return_label_provided',
    'exchange_allowed', 'exchange_window_days',
    'store_credit_offered', 'store_credit_bonus_percent',
    'digital_product_policy', 'service_policy',
    'exceptions', 'exception_conditions',
    'is_active', 'is_default', 'priority',
    'effective_from', 'effective_until',
    'terms_and_conditions', 'legal_disclaimer',
    'approved_by', 'approved_at',
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    return_window_days: 'integer', exchange_window_days: 'integer',
    max_partial_refunds: 'integer', priority: 'integer',
    restocking_fee_percent: 'float', restocking_fee_maximum: 'float',
    approval_threshold: 'float', auto_approve_under: 'float',
    store_credit_bonus_percent: 'float',
    requires_original_packaging: 'boolean', requires_tags: 'boolean',
    requires_accessories: 'boolean', requires_manuals: 'boolean',
    partial_refunds_allowed: 'boolean', requires_approval: 'boolean',
    shipping_refundable: 'boolean', return_label_provided: 'boolean',
    exchange_allowed: 'boolean', store_credit_offered: 'boolean',
    is_active: 'boolean', is_default: 'boolean',
    allowed_refund_methods: 'json', auto_approve_conditions: 'json',
    exceptions: 'json', exception_conditions: 'json',
    metadata: 'json', tags: 'json',
  };

  static relations = {
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
  };

  static policyScopes = {
    STORE_WIDE: 'store_wide', CATEGORY: 'category',
    PRODUCT: 'product', COLLECTION: 'collection',
  };

  /**
   * Create a store refund policy
   */
  static async createPolicy(merchantId, policyData) {
    if (policyData.isDefault) {
      await require('@siamsiam/shared-utils').database.connectionPool.query(
        `UPDATE ${this.tableName} SET is_default = false WHERE merchant_id = $1 AND policy_scope = $2`,
        [merchantId, policyData.policyScope || this.policyScopes.STORE_WIDE]
      );
    }

    return this.create({
      merchant_id: merchantId, store_id: policyData.storeId,
      policy_name: policyData.policyName, policy_slug: policyData.policySlug || policyData.policyName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: policyData.description?.substring(0, 2000),
      policy_type: policyData.policyType || 'merchant',
      policy_scope: policyData.policyScope || this.policyScopes.STORE_WIDE,
      category: policyData.category, sub_category: policyData.subCategory,
      product_id: policyData.productId,
      return_window_days: policyData.returnWindowDays || 14,
      return_window_type: policyData.returnWindowType || 'days_from_delivery',
      condition_required: policyData.conditionRequired || 'good_condition',
      restocking_fee_percent: policyData.restockingFeePercent || 0,
      restocking_fee_maximum: policyData.restockingFeeMaximum,
      requires_original_packaging: policyData.requiresOriginalPackaging !== false,
      requires_tags: policyData.requiresTags || false,
      allowed_refund_methods: policyData.allowedRefundMethods || ['original_payment', 'wallet', 'store_credit'],
      partial_refunds_allowed: policyData.partialRefundsAllowed !== false,
      requires_approval: policyData.requiresApproval || false,
      approval_threshold: policyData.approvalThreshold,
      auto_approve_under: policyData.autoApproveUnder || 50,
      shipping_refundable: policyData.shippingRefundable !== false,
      exchange_allowed: policyData.exchangeAllowed !== false,
      store_credit_offered: policyData.storeCreditOffered || false,
      store_credit_bonus_percent: policyData.storeCreditBonusPercent || 0,
      is_active: true, is_default: policyData.isDefault || false,
      priority: policyData.priority || 10,
      exceptions: policyData.exceptions || [],
      terms_and_conditions: policyData.termsAndConditions?.substring(0, 5000),
      metadata: policyData.metadata || {}, tenant_id: policyData.tenantId,
    });
  }

  /**
   * Get applicable policy for a product
   */
  static async getApplicablePolicy(merchantId, category = null, productId = null) {
    if (productId) {
      const productPolicy = await this.findOne({
        where: { merchant_id: merchantId, policy_scope: this.policyScopes.PRODUCT, product_id: productId, is_active: true },
      });
      if (productPolicy) return productPolicy;
    }
    if (category) {
      const categoryPolicy = await this.findOne({
        where: { merchant_id: merchantId, policy_scope: this.policyScopes.CATEGORY, category, is_active: true },
      });
      if (categoryPolicy) return categoryPolicy;
    }
    return this.findOne({
      where: { merchant_id: merchantId, policy_scope: this.policyScopes.STORE_WIDE, is_default: true, is_active: true },
    });
  }

  /**
   * Find policies by merchant
   */
  static async findByMerchant(merchantId) {
    return this.findAll({ where: { merchant_id: merchantId, is_active: true }, orderBy: { priority: 'ASC' } });
  }
}

module.exports = StoreRefundPolicy;