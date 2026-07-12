const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Business Document Model - Business Registration Documents
 * 
 * Stores business registration and compliance documents
 * for merchant/store verification. Required for KYC/KYB.
 * 
 * TABLE: business_documents
 */

class BusinessDocument extends BaseModel {
  static tableName = 'business_documents';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'merchant_id', 'store_id', 'user_id',
    // Document info
    'document_type', 'document_subtype',
    'document_name', 'document_number',
    'document_url', 'document_format',
    'document_size_bytes', 'document_pages',
    // Issuing authority
    'issuing_authority', 'issuing_country', 'issuing_state',
    'issue_date', 'expiry_date', 'is_perpetual',
    'registration_number', 'tax_number',
    // Verification
    'is_verified', 'verified_at', 'verified_by',
    'verification_method', 'verification_notes',
    'is_rejected', 'rejection_reason', 'rejected_at',
    // Business details from document
    'business_name_on_document', 'business_address_on_document',
    'business_type_on_document',
    // Storage
    'storage_provider', 'storage_bucket', 'storage_key',
    'checksum', 'checksum_algorithm',
    // Expiry tracking
    'is_expired', 'expiry_notification_sent',
    'expiry_notification_date', 'days_until_expiry',
    // Compliance
    'is_required', 'compliance_notes', 'document_tags',
    // Metadata
    'metadata', 'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    is_verified: 'boolean',
    is_rejected: 'boolean',
    is_perpetual: 'boolean',
    is_expired: 'boolean',
    is_required: 'boolean',
    expiry_notification_sent: 'boolean',
    document_size_bytes: 'integer',
    document_pages: 'integer',
    days_until_expiry: 'integer',
    document_tags: 'json',
    metadata: 'json',
  };

  static relations = {
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
  };

  // Required document types for merchant verification
  static requiredDocuments = [
    'business_registration_certificate',
    'tax_registration_certificate',
    'vat_registration_certificate',
    'business_license',
    'proof_of_business_address',
  ];

  static documentTypes = {
    BUSINESS_REGISTRATION: 'business_registration_certificate',
    TAX_REGISTRATION: 'tax_registration_certificate',
    VAT_REGISTRATION: 'vat_registration_certificate',
    BUSINESS_LICENSE: 'business_license',
    PROOF_OF_ADDRESS: 'proof_of_business_address',
    BANK_STATEMENT: 'bank_statement',
    BANK_CONFIRMATION_LETTER: 'bank_confirmation_letter',
    SHAREHOLDER_CERTIFICATE: 'shareholder_certificate',
    DIRECTOR_LIST: 'director_list',
    MEMORANDUM_OF_ASSOCIATION: 'memorandum_of_association',
    ARTICLES_OF_ASSOCIATION: 'articles_of_association',
    ANNUAL_RETURN: 'annual_return',
    AUDITED_ACCOUNTS: 'audited_accounts',
    INSURANCE_CERTIFICATE: 'insurance_certificate',
    HEALTH_PERMIT: 'health_permit',
    FIRE_CERTIFICATE: 'fire_certificate',
    ENVIRONMENTAL_PERMIT: 'environmental_permit',
    OTHER: 'other',
  };

  /**
   * Find documents by merchant
   */
  static async findByMerchant(merchantId) {
    return this.findAll({
      where: { merchant_id: merchantId },
      orderBy: { document_type: 'ASC', created_at: 'DESC' },
    });
  }

  /**
   * Find verified documents by merchant
   */
  static async findVerifiedByMerchant(merchantId) {
    return this.findAll({
      where: { merchant_id: merchantId, is_verified: true },
    });
  }

  /**
   * Check which required documents are missing
   */
  static async findMissingRequired(merchantId) {
    const existing = await this.findVerifiedByMerchant(merchantId);
    const existingTypes = new Set(existing.map(d => d.document_type));
    
    return this.requiredDocuments
      .filter(type => !existingTypes.has(type))
      .map(type => ({
        documentType: type,
        documentName: this._getDocumentTypeName(type),
        isRequired: true,
      }));
  }

  /**
   * Verify a document
   */
  static async verify(documentId, verifiedBy, options = {}) {
    return this.update({ id: documentId }, {
      is_verified: true,
      verified_at: new Date().toISOString(),
      verified_by: verifiedBy,
      verification_method: options.method || 'manual',
      verification_notes: options.notes || null,
      is_rejected: false,
      rejection_reason: null,
      rejected_at: null,
    });
  }

  /**
   * Reject a document
   */
  static async reject(documentId, reason, rejectedBy) {
    return this.update({ id: documentId }, {
      is_verified: false,
      is_rejected: true,
      rejection_reason: reason,
      rejected_at: new Date().toISOString(),
      verified_by: rejectedBy,
    });
  }

  /**
   * Find documents approaching expiry
   */
  static async findExpiring(daysThreshold = 30) {
    return this.findAll({
      where: {
        is_perpetual: false,
        is_expired: false,
        is_verified: true,
      },
    });
  }

  /**
   * Get document type display name
   * @private
   */
  static _getDocumentTypeName(type) {
    const names = {
      business_registration_certificate: 'Business Registration Certificate',
      tax_registration_certificate: 'Tax Registration Certificate',
      vat_registration_certificate: 'VAT Registration Certificate',
      business_license: 'Business License',
      proof_of_business_address: 'Proof of Business Address',
      bank_statement: 'Bank Statement',
      bank_confirmation_letter: 'Bank Confirmation Letter',
      shareholder_certificate: 'Shareholder Certificate',
      director_list: 'Director List',
    };
    return names[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

module.exports = BusinessDocument;