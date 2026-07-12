const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Corporate Document Model - Business Registration Documents
 * 
 * Stores compliance and registration documents for corporate entities.
 * Documents are verified during the KYB (Know Your Business) process.
 * 
 * TABLE: corporate_documents
 */

class CorporateDocument extends BaseModel {
  static tableName = 'corporate_documents';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'corporate_id',
    // Document info
    'document_type', 'document_subtype',
    'document_name', 'document_number',
    'document_url', 'document_format',
    'document_size_bytes', 'document_pages',
    // Issuing authority
    'issuing_authority', 'issuing_country',
    'issue_date', 'expiry_date', 'is_perpetual',
    // Verification
    'is_verified', 'verified_at', 'verified_by',
    'verification_method', 'verification_notes',
    'is_rejected', 'rejection_reason',
    // Compliance
    'compliance_notes', 'is_required',
    'is_expired', 'expiry_notification_sent',
    'expiry_notification_date',
    // Storage
    'storage_provider', 'storage_bucket',
    'storage_key', 'checksum',
    // Metadata
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    is_verified: 'boolean',
    is_rejected: 'boolean',
    is_required: 'boolean',
    is_perpetual: 'boolean',
    is_expired: 'boolean',
    expiry_notification_sent: 'boolean',
    document_size_bytes: 'integer',
    document_pages: 'integer',
    metadata: 'json',
    tags: 'json',
  };

  // Document types required for corporate verification
  static types = {
    CERTIFICATE_OF_INCORPORATION: 'certificate_of_incorporation',
    TAX_CLEARANCE: 'tax_clearance',
    VAT_REGISTRATION: 'vat_registration',
    BUSINESS_LICENSE: 'business_license',
    BANK_STATEMENT: 'bank_statement',
    PROOF_OF_ADDRESS: 'proof_of_address',
    SHAREHOLDER_REGISTER: 'shareholder_register',
    DIRECTOR_REGISTER: 'director_register',
    MEMORANDUM_OF_ASSOCIATION: 'memorandum_of_association',
    ARTICLES_OF_ASSOCIATION: 'articles_of_association',
    ANNUAL_RETURN: 'annual_return',
    AUDITED_ACCOUNTS: 'audited_accounts',
    BOARD_RESOLUTION: 'board_resolution',
    OTHER: 'other',
  };

  /**
   * Find documents by corporate entity
   */
  static async findByCorporate(corporateId) {
    return this.findAll({
      where: { corporate_id: corporateId },
      orderBy: { created_at: 'DESC' },
    });
  }

  /**
   * Find required documents that are missing
   */
  static async findMissingDocuments(corporateId, requiredTypes = []) {
    const existing = await this.findAll({
      where: { corporate_id: corporateId, is_verified: true },
    });

    const existingTypes = new Set(existing.map(d => d.document_type));
    return requiredTypes.filter(type => !existingTypes.has(type));
  }

  /**
   * Verify a document
   */
  static async verify(documentId, verifiedBy, notes = null) {
    return this.update({ id: documentId }, {
      is_verified: true,
      verified_at: new Date().toISOString(),
      verified_by: verifiedBy,
      verification_notes: notes,
      is_rejected: false,
      rejection_reason: null,
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
      verified_by: rejectedBy,
      verified_at: new Date().toISOString(),
    });
  }

  /**
   * Find expired documents
   */
  static async findExpired() {
    return this.findAll({
      where: {
        is_perpetual: false,
        expiry_date: { operator: '<', value: new Date().toISOString() },
        is_expired: false,
      },
    });
  }

  /**
   * Mark documents as expired
   */
  static async markExpired() {
    const text = `
      UPDATE ${this.tableName}
      SET is_expired = true, updated_at = NOW()
      WHERE is_perpetual = false
        AND expiry_date < NOW()
        AND is_expired = false
    `;
    const result = await require('@siamsiam/shared-utils').database.connectionPool.query(text);
    return result.rowCount;
  }
}

module.exports = CorporateDocument;