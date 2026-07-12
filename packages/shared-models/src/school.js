const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * School Model - Registered School Institution
 * 
 * Stores registered educational institutions for school fees payments.
 * Schools can be registered by administrators or self-registered
 * through an onboarding process with verification.
 * 
 * TABLE: schools
 * 
 * SCHOOL TYPES:
 * - primary: Primary/elementary school
 * - secondary: Secondary/high school
 * - high_school: Senior high school
 * - combined: Combined primary and secondary
 * - tertiary: College, polytechnic, university
 * - vocational: Trade/vocational school
 * - international: International curriculum school
 * - private: Private institution
 * - government: Government/public school
 * - other: Other educational institution
 */

class School extends BaseModel {
  static tableName = 'schools';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'school_code', 'school_name', 'slug',
    'school_type', 'school_category', 'curriculum',
    'description', 'motto', 'established_year',
    // Accreditation
    'accreditation_body', 'accreditation_number',
    'accreditation_expiry', 'registration_number',
    'ministry_registration', 'examination_center_number',
    // Contact
    'email', 'phone', 'alternative_phone', 'website',
    'fax', 'postal_address', 'physical_address',
    'city', 'state', 'province', 'country', 'postal_code',
    'latitude', 'longitude',
    // Administration
    'principal_name', 'principal_email', 'principal_phone',
    'bursar_name', 'bursar_email', 'bursar_phone',
    'accounts_email', 'admissions_email',
    // Banking
    'bank_name', 'bank_account_name', 'bank_account_number',
    'bank_branch', 'bank_branch_code', 'bank_swift',
    'currency', 'accepts_partial_payments',
    'minimum_payment_percent', 'late_fee_amount',
    'late_fee_after_days', 'payment_methods',
    // Terms
    'term_system', 'number_of_terms', 'current_term_id',
    'next_term_start_date', 'academic_year_start',
    'academic_year_end',
    // Fees
    'fee_structure_type', 'fee_currency',
    'accepts_uniform_payment', 'accepts_books_payment',
    'accepts_boarding_payment', 'accepts_transport_payment',
    'accepts_exam_fees', 'accepts_activity_fees',
    // Status
    'is_active', 'is_verified', 'is_featured',
    'verified_at', 'verified_by', 'verification_method',
    'verification_notes', 'onboarding_completed',
    'onboarding_completed_at',
    // Branding
    'logo_url', 'banner_url', 'badge_url',
    'primary_color', 'secondary_color',
    // Statistics
    'total_students', 'total_teachers',
    'payment_count', 'total_fees_collected',
    'average_fee_amount', 'last_payment_at',
    // Social
    'social_media', 'reviews_enabled',
    'average_rating', 'review_count',
    // Search
    'search_keywords', 'popularity_score',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    established_year: 'integer', number_of_terms: 'integer',
    minimum_payment_percent: 'float', late_fee_amount: 'float',
    late_fee_after_days: 'integer', total_students: 'integer',
    total_teachers: 'integer', payment_count: 'integer',
    total_fees_collected: 'float', average_fee_amount: 'float',
    average_rating: 'float', review_count: 'integer',
    popularity_score: 'float', latitude: 'float', longitude: 'float',
    accepts_partial_payments: 'boolean', accepts_uniform_payment: 'boolean',
    accepts_books_payment: 'boolean', accepts_boarding_payment: 'boolean',
    accepts_transport_payment: 'boolean', accepts_exam_fees: 'boolean',
    accepts_activity_fees: 'boolean', is_active: 'boolean',
    is_verified: 'boolean', is_featured: 'boolean',
    onboarding_completed: 'boolean', reviews_enabled: 'boolean',
    payment_methods: 'json', social_media: 'json',
    search_keywords: 'json', metadata: 'json', tags: 'json',
  };

  static relations = {
    students: { type: 'hasMany', model: 'Student', foreignKey: 'school_id', localKey: 'id' },
    terms: { type: 'hasMany', model: 'SchoolTerm', foreignKey: 'school_id', localKey: 'id' },
    payments: { type: 'hasMany', model: 'SchoolFeesPayment', foreignKey: 'school_id', localKey: 'id' },
  };

  static schoolTypes = {
    PRIMARY: 'primary', SECONDARY: 'secondary', HIGH_SCHOOL: 'high_school',
    COMBINED: 'combined', TERTIARY: 'tertiary', VOCATIONAL: 'vocational',
    INTERNATIONAL: 'international', PRIVATE: 'private',
    GOVERNMENT: 'government', OTHER: 'other',
  };

  static termSystems = {
    SEMESTER: 'semester', TRIMESTER: 'trimester', QUARTER: 'quarter',
    TERM: 'term', ANNUAL: 'annual',
  };

  static generateSchoolCode() {
    const prefix = 'SCH';
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${random}`;
  }

  /**
   * Register a new school
   */
  static async register(schoolData) {
    const schoolCode = this.generateSchoolCode();
    const slug = schoolData.slug || schoolData.schoolName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const existing = await this.findOne({ where: { slug } });
    if (existing) throw new Error(`School with slug "${slug}" already exists`);

    return this.create({
      school_code: schoolCode, school_name: schoolData.schoolName, slug,
      school_type: schoolData.schoolType || this.schoolTypes.OTHER,
      school_category: schoolData.schoolCategory, curriculum: schoolData.curriculum,
      description: schoolData.description?.substring(0, 2000),
      motto: schoolData.motto, established_year: schoolData.establishedYear,
      accreditation_body: schoolData.accreditationBody,
      accreditation_number: schoolData.accreditationNumber,
      registration_number: schoolData.registrationNumber,
      ministry_registration: schoolData.ministryRegistration,
      email: schoolData.email?.toLowerCase(), phone: schoolData.phone,
      alternative_phone: schoolData.alternativePhone,
      website: schoolData.website, physical_address: schoolData.physicalAddress,
      city: schoolData.city, state: schoolData.state,
      country: schoolData.country, postal_code: schoolData.postalCode,
      latitude: schoolData.latitude, longitude: schoolData.longitude,
      principal_name: schoolData.principalName,
      principal_email: schoolData.principalEmail?.toLowerCase(),
      principal_phone: schoolData.principalPhone,
      bursar_name: schoolData.bursarName,
      bursar_email: schoolData.bursarEmail?.toLowerCase(),
      bursar_phone: schoolData.bursarPhone,
      accounts_email: schoolData.accountsEmail || schoolData.bursarEmail,
      bank_name: schoolData.bankName, bank_account_name: schoolData.bankAccountName,
      bank_account_number: schoolData.bankAccountNumber,
      bank_branch: schoolData.bankBranch, bank_branch_code: schoolData.bankBranchCode,
      bank_swift: schoolData.bankSwift, currency: schoolData.currency || 'USD',
      accepts_partial_payments: schoolData.acceptsPartialPayments || false,
      minimum_payment_percent: schoolData.minimumPaymentPercent || 50,
      late_fee_amount: schoolData.lateFeeAmount || 0,
      late_fee_after_days: schoolData.lateFeeAfterDays || 14,
      payment_methods: schoolData.paymentMethods || ['bank_transfer', 'mobile_money', 'card'],
      term_system: schoolData.termSystem || this.termSystems.TERM,
      number_of_terms: schoolData.numberOfTerms || 3,
      fee_structure_type: schoolData.feeStructureType || 'per_term',
      fee_currency: schoolData.feeCurrency || schoolData.currency || 'USD',
      accepts_uniform_payment: schoolData.acceptsUniformPayment !== false,
      accepts_books_payment: schoolData.acceptsBooksPayment !== false,
      accepts_boarding_payment: schoolData.acceptsBoardingPayment || false,
      accepts_exam_fees: schoolData.acceptsExamFees !== false,
      accepts_activity_fees: schoolData.acceptsActivityFees || false,
      is_active: true, is_verified: false,
      onboarding_completed: false, search_keywords: schoolData.searchKeywords || [],
      metadata: schoolData.metadata || {}, tenant_id: schoolData.tenantId,
    });
  }

  /**
   * Search schools by name or code
   */
  static async search(query, options = {}) {
    const text = `
      SELECT * FROM ${this.tableName}
      WHERE is_active = true AND is_verified = true
        AND (school_name ILIKE $1 OR school_code ILIKE $1
             OR city ILIKE $1 OR search_keywords::text ILIKE $1)
      ORDER BY popularity_score DESC, school_name ASC
      LIMIT $2 OFFSET $3
    `;
    const result = await connectionPool.query(text, [`%${query}%`, options.limit || 20, options.offset || 0]);
    return result.rows;
  }

  /**
   * Find school by code
   */
  static async findByCode(schoolCode) {
    return this.findOne({ where: { school_code: schoolCode, is_active: true } });
  }

  /**
   * Verify a school
   */
  static async verify(schoolId, verifiedBy, method = 'document_review') {
    return this.update({ id: schoolId }, {
      is_verified: true, verified_at: new Date().toISOString(),
      verified_by: verifiedBy, verification_method: method,
      onboarding_completed: true, onboarding_completed_at: new Date().toISOString(),
    });
  }

  /**
   * Get featured schools
   */
  static async getFeatured(limit = 10) {
    return this.findAll({
      where: { is_active: true, is_verified: true, is_featured: true },
      orderBy: { popularity_score: 'DESC' }, limit,
    });
  }

  /**
   * Update school payment statistics
   */
  static async updatePaymentStats(schoolId, amount) {
    await connectionPool.query(
      `UPDATE ${this.tableName} SET payment_count = payment_count + 1, total_fees_collected = total_fees_collected + $2, last_payment_at = NOW(), average_fee_amount = CASE WHEN payment_count > 0 THEN (total_fees_collected + $2) / (payment_count + 1) ELSE $2 END WHERE id = $1`,
      [schoolId, amount]
    );
  }
}

module.exports = School;