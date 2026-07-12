const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Refund Reason Model - Refund Reason Categories
 * 
 * Standardized refund reason codes for consistent reporting,
 * analytics, and policy enforcement. Maps reasons to required
 * evidence, return requirements, and restocking fee applicability.
 * 
 * TABLE: refund_reasons
 */

class RefundReason extends BaseModel {
  static tableName = 'refund_reasons';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'reason_code', 'reason_name', 'reason_description',
    'reason_category', 'reason_group',
    'requires_evidence', 'evidence_types', 'evidence_description',
    'requires_return', 'return_required_reason',
    'restocking_fee_applies', 'restocking_fee_percent',
    'refund_shipping', 'seller_fault', 'buyer_fault',
    'is_active', 'is_system', 'sort_order',
    'applicable_categories', 'excluded_categories',
    'auto_approve', 'requires_approval',
    'approval_level', 'max_occurrences_per_user',
    'max_occurrences_period_days',
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    requires_evidence: 'boolean', requires_return: 'boolean',
    restocking_fee_applies: 'boolean', refund_shipping: 'boolean',
    seller_fault: 'boolean', buyer_fault: 'boolean',
    is_active: 'boolean', is_system: 'boolean',
    auto_approve: 'boolean', requires_approval: 'boolean',
    sort_order: 'integer', restocking_fee_percent: 'float',
    approval_level: 'integer', max_occurrences_per_user: 'integer',
    max_occurrences_period_days: 'integer',
    evidence_types: 'json', applicable_categories: 'json',
    excluded_categories: 'json', metadata: 'json', tags: 'json',
  };

  static reasonCategories = {
    DEFECTIVE: 'defective', DAMAGED: 'damaged',
    NOT_AS_DESCRIBED: 'not_as_described', WRONG_ITEM: 'wrong_item',
    MISSING_PARTS: 'missing_parts', LATE_DELIVERY: 'late_delivery',
    NEVER_RECEIVED: 'never_received', CHANGED_MIND: 'changed_mind',
    DUPLICATE_ORDER: 'duplicate_order', FRAUDULENT: 'fraudulent',
    PRICE_DROP: 'price_drop', SIZE_FIT: 'size_fit',
    QUALITY: 'quality', OTHER: 'other',
  };

  // Predefined reasons
  static predefinedReasons = [
    { code: 'DEFECTIVE_ITEM', name: 'Defective Item', category: 'defective', sellerFault: true, requiresReturn: true, requiresEvidence: true, evidenceTypes: ['photo', 'video'], autoApprove: true },
    { code: 'DAMAGED_IN_TRANSIT', name: 'Damaged in Transit', category: 'damaged', sellerFault: false, requiresReturn: true, requiresEvidence: true, evidenceTypes: ['photo'], refundShipping: true },
    { code: 'NOT_AS_DESCRIBED', name: 'Not as Described', category: 'not_as_described', sellerFault: true, requiresReturn: true, requiresEvidence: true, evidenceTypes: ['photo'], autoApprove: true },
    { code: 'WRONG_ITEM_SENT', name: 'Wrong Item Sent', category: 'wrong_item', sellerFault: true, requiresReturn: true, refundShipping: true, autoApprove: true },
    { code: 'MISSING_PARTS', name: 'Missing Parts/Accessories', category: 'missing_parts', sellerFault: true, requiresEvidence: true, evidenceTypes: ['photo'] },
    { code: 'LATE_DELIVERY', name: 'Late Delivery', category: 'late_delivery', sellerFault: false, refundShipping: true },
    { code: 'NEVER_RECEIVED', name: 'Never Received', category: 'never_received', sellerFault: false, requiresEvidence: true },
    { code: 'CHANGED_MIND', name: 'Changed Mind', category: 'changed_mind', buyerFault: true, requiresReturn: true, restockingFeeApplies: true, restockingFeePercent: 10 },
    { code: 'DUPLICATE_ORDER', name: 'Duplicate Order', category: 'duplicate_order', buyerFault: true },
    { code: 'PRICE_DROP', name: 'Price Drop After Purchase', category: 'price_drop', sellerFault: false },
    { code: 'SIZE_TOO_SMALL', name: 'Size Too Small', category: 'size_fit', buyerFault: true, requiresReturn: true },
    { code: 'SIZE_TOO_LARGE', name: 'Size Too Large', category: 'size_fit', buyerFault: true, requiresReturn: true },
    { code: 'POOR_QUALITY', name: 'Poor Quality', category: 'quality', sellerFault: true, requiresReturn: true, requiresEvidence: true },
    { code: 'OTHER', name: 'Other Reason', category: 'other', requiresApproval: true },
  ];

  /**
   * Seed default refund reasons
   */
  static async seedDefaults(tenantId = null) {
    const created = [];
    for (const reason of this.predefinedReasons) {
      const existing = await this.findOne({ where: { reason_code: reason.code, tenant_id: tenantId } });
      if (!existing) {
        const record = await this.create({
          reason_code: reason.code, reason_name: reason.name,
          reason_description: reason.description || reason.name,
          reason_category: reason.category, reason_group: reason.category,
          requires_evidence: reason.requiresEvidence || false,
          evidence_types: reason.evidenceTypes || [],
          requires_return: reason.requiresReturn || false,
          restocking_fee_applies: reason.restockingFeeApplies || false,
          restocking_fee_percent: reason.restockingFeePercent || 0,
          refund_shipping: reason.refundShipping || false,
          seller_fault: reason.sellerFault || false,
          buyer_fault: reason.buyerFault || false,
          is_active: true, is_system: true, sort_order: created.length + 1,
          auto_approve: reason.autoApprove || false,
          requires_approval: reason.requiresApproval || false,
          metadata: { seeded: true }, tenant_id: tenantId, created_by: 'system_seed',
        });
        created.push(record);
      }
    }
    return created;
  }

  /**
   * Find reason by code
   */
  static async findByCode(code) {
    return this.findOne({ where: { reason_code: code, is_active: true } });
  }

  /**
   * Get reasons by category
   */
  static async getByCategory(category) {
    return this.findAll({ where: { reason_category: category, is_active: true }, orderBy: { sort_order: 'ASC' } });
  }
}

module.exports = RefundReason;