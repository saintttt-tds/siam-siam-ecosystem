const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * School Term Model - Academic Term/Semester Definition
 * 
 * Defines academic terms for schools including dates, fee structures,
 * and payment deadlines. Supports multiple term systems.
 * 
 * TABLE: school_terms
 */

class SchoolTerm extends BaseModel {
  static tableName = 'school_terms';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'school_id', 'term_name', 'term_number',
    'term_slug', 'academic_year', 'term_description',
    'start_date', 'end_date', 'registration_start_date',
    'registration_end_date', 'late_registration_start_date',
    'late_registration_end_date', 'classes_start_date',
    'classes_end_date', 'exams_start_date', 'exams_end_date',
    'break_start_date', 'break_end_date', 'reporting_date',
    'fee_amount', 'fee_currency', 'early_payment_discount',
    'early_payment_discount_percent', 'early_payment_deadline',
    'late_payment_fee', 'late_payment_fee_amount',
    'late_payment_fee_percent', 'late_payment_starts',
    'installment_allowed', 'installment_count',
    'installment_amounts', 'installment_due_dates',
    'minimum_payment_amount', 'minimum_payment_percent',
    'full_payment_deadline', 'is_current', 'is_active',
    'is_registration_open', 'enrollment_count',
    'max_enrollment', 'total_fees_billed',
    'total_fees_collected', 'collection_rate',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    term_number: 'integer', fee_amount: 'float',
    early_payment_discount_percent: 'float', late_payment_fee_amount: 'float',
    late_payment_fee_percent: 'float', installment_count: 'integer',
    minimum_payment_amount: 'float', minimum_payment_percent: 'float',
    enrollment_count: 'integer', max_enrollment: 'integer',
    total_fees_billed: 'float', total_fees_collected: 'float',
    collection_rate: 'float', installment_allowed: 'boolean',
    is_current: 'boolean', is_active: 'boolean',
    is_registration_open: 'boolean', early_payment_discount: 'boolean',
    late_payment_fee: 'boolean', installment_amounts: 'json',
    installment_due_dates: 'json', metadata: 'json', tags: 'json',
  };

  static relations = {
    school: { type: 'belongsTo', model: 'School', foreignKey: 'school_id', ownerKey: 'id' },
    payments: { type: 'hasMany', model: 'SchoolFeesPayment', foreignKey: 'term_id', localKey: 'id' },
  };

  /**
   * Find terms by school
   */
  static async findBySchool(schoolId) {
    return this.findAll({ where: { school_id: schoolId, is_active: true }, orderBy: { start_date: 'DESC' } });
  }

  /**
   * Get current term for a school
   */
  static async getCurrentTerm(schoolId) {
    const now = new Date().toISOString();
    return this.findOne({
      where: { school_id: schoolId, is_current: true, is_active: true },
      orderBy: { start_date: 'DESC' },
    });
  }

  /**
   * Set a term as current (and unset others)
   */
  static async setCurrent(schoolId, termId) {
    await connectionPool.query(
      `UPDATE ${this.tableName} SET is_current = false WHERE school_id = $1`,
      [schoolId]
    );
    return this.update({ id: termId }, { is_current: true });
  }

  /**
   * Check if registration is open
   */
  static async isRegistrationOpen(termId) {
    const term = await this.findById(termId);
    if (!term) return false;
    const now = new Date();
    if (term.registration_start_date && term.registration_end_date) {
      return now >= new Date(term.registration_start_date) && now <= new Date(term.registration_end_date);
    }
    return false;
  }
}

module.exports = SchoolTerm;