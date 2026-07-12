const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Store Verification Model - Store Verification Record
 * 
 * Tracks the verification process for merchant stores.
 * Includes document verification, identity checks, address
 * verification, and business legitimacy assessment.
 * 
 * TABLE: store_verifications
 */

class StoreVerification extends BaseModel {
  static tableName = 'store_verifications';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'merchant_id', 'store_id',
    'verification_number', 'verification_level',
    'verification_status', 'sub_status', 'status_history',
    'verification_type', 'verification_method',
    'requested_at', 'requested_by',
    'assigned_to', 'assigned_at', 'assigned_by',
    'started_at', 'completed_at', 'verified_at',
    'verified_by', 'verified_by_name', 'verified_by_role',
    'expires_at', 'renewal_required', 'renewal_days_before',
    'renewal_notification_sent', 'renewal_notification_date',
    'documents_verified', 'documents_checked',
    'documents_rejected', 'documents_pending',
    'business_verified', 'business_name_verified',
    'business_registration_verified', 'tax_registration_verified',
    'vat_registration_verified', 'business_license_verified',
    'business_address_verified', 'business_address_checked',
    'identity_verified', 'owner_identity_verified',
    'director_identity_verified', 'bank_account_verified',
    'phone_verified', 'email_verified', 'website_verified',
    'domain_verified', 'ssl_verified',
    'social_media_verified', 'physical_location_verified',
    'physical_location_checked_at', 'physical_location_check_by',
    'physical_location_check_notes',
    'background_check_status', 'background_check_date',
    'background_check_provider', 'background_check_ref',
    'credit_check_status', 'credit_check_date', 'credit_score',
    'aml_check_status', 'aml_check_date', 'aml_risk_level',
    'sanctions_check_status', 'sanctions_check_date',
    'pep_check_status', 'pep_check_date',
    'verification_score', 'verification_confidence',
    'verification_notes', 'rejection_reason',
    'appeal_status', 'appeal_reason', 'appeal_date',
    'appeal_reviewed_by', 'appeal_decision',
    'documents', 'required_documents',
    'checklist', 'checklist_completed',
    'audit_trail', 'reviewed_by_qa', 'qa_review_date',
    'qa_notes', 'qa_score',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    verification_level: 'integer', verification_score: 'float',
    verification_confidence: 'float', credit_score: 'float',
    qa_score: 'float', documents_verified: 'integer',
    documents_checked: 'integer', documents_rejected: 'integer',
    documents_pending: 'integer', renewal_days_before: 'integer',
    documents: 'json', required_documents: 'json',
    checklist: 'json', status_history: 'json',
    audit_trail: 'json', metadata: 'json', tags: 'json',
    business_verified: 'boolean', business_name_verified: 'boolean',
    business_registration_verified: 'boolean', tax_registration_verified: 'boolean',
    vat_registration_verified: 'boolean', business_license_verified: 'boolean',
    business_address_verified: 'boolean', identity_verified: 'boolean',
    owner_identity_verified: 'boolean', director_identity_verified: 'boolean',
    bank_account_verified: 'boolean', phone_verified: 'boolean',
    email_verified: 'boolean', website_verified: 'boolean',
    domain_verified: 'boolean', ssl_verified: 'boolean',
    social_media_verified: 'boolean', physical_location_verified: 'boolean',
    checklist_completed: 'boolean', renewal_required: 'boolean',
    renewal_notification_sent: 'boolean',
  };

  static relations = {
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
  };

  static verificationLevels = {
    BASIC: { level: 1, name: 'basic', description: 'Basic verification - email and phone' },
    VERIFIED: { level: 2, name: 'verified', description: 'Business documents verified' },
    ENHANCED: { level: 3, name: 'enhanced', description: 'Full verification including physical check' },
    PREMIUM: { level: 4, name: 'premium', description: 'Premium verification with credit check' },
  };

  static verificationStatuses = {
    UNVERIFIED: 'unverified', PENDING: 'pending',
    IN_REVIEW: 'in_review', APPROVED: 'approved',
    REJECTED: 'rejected', EXPIRED: 'expired',
    SUSPENDED: 'suspended', UNDER_APPEAL: 'under_appeal',
  };

  static generateVerificationNumber() { return `VER-${Date.now().toString(36).toUpperCase()}`; }

  /**
   * Initiate store verification
   */
  static async initiate(merchantId, storeId = null, options = {}) {
    const existing = await this.findOne({
      where: { merchant_id: merchantId, verification_status: [this.verificationStatuses.PENDING, this.verificationStatuses.IN_REVIEW, this.verificationStatuses.APPROVED] },
    });
    if (existing) throw new Error('Active verification already exists for this merchant');

    return this.create({
      merchant_id: merchantId, store_id: storeId,
      verification_number: this.generateVerificationNumber(),
      verification_level: this.verificationLevels.BASIC.level,
      verification_status: this.verificationStatuses.PENDING,
      verification_type: options.verificationType || 'standard',
      requested_at: new Date().toISOString(), requested_by: options.requestedBy,
      required_documents: options.requiredDocuments || [],
      checklist: options.checklist || [],
      status_history: [{ status: this.verificationStatuses.PENDING, timestamp: new Date().toISOString() }],
      metadata: options.metadata || {}, tenant_id: options.tenantId,
    });
  }

  /**
   * Approve verification
   */
  static async approve(verificationId, verifiedBy, level = 'verified', options = {}) {
    const levelConfig = this.verificationLevels[level.toUpperCase()] || this.verificationLevels.VERIFIED;
    return this.update({ id: verificationId }, {
      verification_status: this.verificationStatuses.APPROVED,
      verification_level: levelConfig.level, verified_at: new Date().toISOString(),
      verified_by: verifiedBy, verified_by_name: options.verifiedByName,
      verification_score: options.score || 100, verification_confidence: options.confidence || 1.0,
      verification_notes: options.notes, completed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
    });
  }

  /**
   * Reject verification
   */
  static async reject(verificationId, reason, rejectedBy) {
    return this.update({ id: verificationId }, {
      verification_status: this.verificationStatuses.REJECTED,
      rejection_reason: reason, verified_by: rejectedBy, completed_at: new Date().toISOString(),
    });
  }

  /**
   * Find verification by merchant
   */
  static async findByMerchant(merchantId) {
    return this.findOne({ where: { merchant_id: merchantId }, orderBy: { created_at: 'DESC' } });
  }

  /**
   * Get pending verifications
   */
  static async findPending() {
    return this.findAll({ where: { verification_status: [this.verificationStatuses.PENDING, this.verificationStatuses.IN_REVIEW] }, orderBy: { requested_at: 'ASC' } });
  }
}

module.exports = StoreVerification;