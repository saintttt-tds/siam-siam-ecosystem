const BaseModel = require('./base-model');
const { encryption } = require('@siamsiam/shared-utils').security;
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Corporate Director Model - Company Director Information
 * 
 * Stores director/shareholder information for corporate KYC/KYB compliance.
 * Directors must be verified as part of the corporate onboarding process.
 * 
 * TABLE: corporate_directors
 */

class CorporateDirector extends BaseModel {
  static tableName = 'corporate_directors';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'corporate_id',
    // Personal information
    'full_name', 'title', 'date_of_birth',
    'nationality', 'country_of_residence',
    'national_id_encrypted', 'national_id_type',
    'passport_number_encrypted', 'passport_country',
    'passport_expiry',
    // Contact
    'email', 'phone', 'address',
    // Corporate role
    'position', 'position_type',
    'appointment_date', 'resignation_date',
    'is_current', 'ownership_percentage',
    'voting_rights_percentage',
    // Verification
    'is_verified', 'verified_at', 'verified_by',
    'verification_method', 'verification_notes',
    'background_check_status', 'background_check_date',
    // PEP/Sanctions
    'is_pep', 'pep_details', 'is_sanctioned',
    'last_screening_date', 'screening_result',
    // Documents
    'id_document_url', 'proof_of_address_url',
    'signature_url',
    // Metadata
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    is_current: 'boolean',
    is_verified: 'boolean',
    is_pep: 'boolean',
    is_sanctioned: 'boolean',
    ownership_percentage: 'float',
    voting_rights_percentage: 'float',
    metadata: 'json',
    tags: 'json',
  };

  static hooks = {
    beforeCreate: [
      async (data) => {
        if (data.national_id_encrypted) {
          data.national_id_encrypted = encryption.encrypt(data.national_id_encrypted);
        }
        if (data.passport_number_encrypted) {
          data.passport_number_encrypted = encryption.encrypt(data.passport_number_encrypted);
        }
      },
    ],
  };

  /**
   * Find directors by corporate entity
   */
  static async findByCorporate(corporateId) {
    return this.findAll({
      where: { corporate_id: corporateId },
      orderBy: { is_current: 'DESC', appointment_date: 'DESC' },
    });
  }

  /**
   * Find current directors (not resigned)
   */
  static async findCurrentDirectors(corporateId) {
    return this.findAll({
      where: { corporate_id: corporateId, is_current: true },
    });
  }

  /**
   * Verify a director
   */
  static async verify(directorId, verifiedBy, method = 'document') {
    return this.update({ id: directorId }, {
      is_verified: true,
      verified_at: new Date().toISOString(),
      verified_by: verifiedBy,
      verification_method: method,
    });
  }

  /**
   * Record director resignation
   */
  static async recordResignation(directorId, resignationDate = new Date()) {
    return this.update({ id: directorId }, {
      is_current: false,
      resignation_date: resignationDate.toISOString(),
    });
  }

  /**
   * Update ownership percentage
   */
  static async updateOwnership(directorId, ownershipPercent) {
    if (ownershipPercent < 0 || ownershipPercent > 100) {
      throw new Error('Ownership percentage must be between 0 and 100');
    }
    return this.update({ id: directorId }, {
      ownership_percentage: ownershipPercent,
    });
  }
}

module.exports = CorporateDirector;