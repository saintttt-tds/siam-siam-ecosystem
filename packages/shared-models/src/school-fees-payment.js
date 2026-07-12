const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * School Fees Payment Model - School Fees Payment Record
 * 
 * Records payments made for school fees including tuition,
 * uniforms, books, boarding, transport, and other school-related expenses.
 * 
 * TABLE: school_fees_payments
 */

class SchoolFeesPayment extends BaseModel {
  static tableName = 'school_fees_payments';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id', 'school_id', 'student_id',
    'term_id', 'payment_number', 'payment_reference',
    'payment_type', 'payment_category',
    'amount', 'currency', 'convenience_fee', 'total_amount',
    'transaction_id', 'payment_method', 'payment_status',
    'tuition_amount', 'uniform_amount', 'books_amount',
    'boarding_amount', 'transport_amount', 'exam_fee_amount',
    'activity_fee_amount', 'other_amount', 'other_description',
    'is_partial_payment', 'partial_percent',
    'remaining_balance', 'total_fees_due',
    'payment_date', 'payment_period', 'academic_year',
    'term_name', 'student_name', 'student_number',
    'grade', 'class_name', 'parent_name', 'parent_phone',
    'receipt_url', 'receipt_number', 'receipt_sent',
    'status', 'status_message', 'external_reference',
    'verified_by_school', 'verified_at', 'verification_notes',
    'refunded_amount', 'refunded_at', 'refund_reason',
    'notes', 'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    amount: 'float', convenience_fee: 'float', total_amount: 'float',
    tuition_amount: 'float', uniform_amount: 'float',
    books_amount: 'float', boarding_amount: 'float',
    transport_amount: 'float', exam_fee_amount: 'float',
    activity_fee_amount: 'float', other_amount: 'float',
    partial_percent: 'float', remaining_balance: 'float',
    total_fees_due: 'float', refunded_amount: 'float',
    is_partial_payment: 'boolean', receipt_sent: 'boolean',
    verified_by_school: 'boolean', metadata: 'json', tags: 'json',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    school: { type: 'belongsTo', model: 'School', foreignKey: 'school_id', ownerKey: 'id' },
    student: { type: 'belongsTo', model: 'Student', foreignKey: 'student_id', ownerKey: 'id' },
    term: { type: 'belongsTo', model: 'SchoolTerm', foreignKey: 'term_id', ownerKey: 'id' },
  };

  static paymentCategories = {
    TUITION: 'tuition', UNIFORM: 'uniform', BOOKS: 'books',
    BOARDING: 'boarding', TRANSPORT: 'transport',
    EXAM_FEES: 'exam_fees', ACTIVITY_FEES: 'activity_fees',
    COMBINED: 'combined', OTHER: 'other',
  };

  static generatePaymentNumber() { return `SCF-${Date.now().toString(36).toUpperCase()}`; }

  /**
   * Record a school fees payment
   */
  static async recordPayment(userId, schoolId, studentId, termId, paymentData) {
    return this.create({
      user_id: userId, school_id: schoolId, student_id: studentId, term_id: termId,
      payment_number: this.generatePaymentNumber(),
      payment_reference: paymentData.paymentReference,
      payment_type: paymentData.paymentType || 'school_fees',
      payment_category: paymentData.paymentCategory || this.paymentCategories.TUITION,
      amount: paymentData.amount, currency: paymentData.currency || 'USD',
      convenience_fee: paymentData.convenienceFee || 0,
      total_amount: (paymentData.amount || 0) + (paymentData.convenienceFee || 0),
      transaction_id: paymentData.transactionId,
      payment_method: paymentData.paymentMethod, payment_status: 'completed',
      tuition_amount: paymentData.tuitionAmount || paymentData.amount,
      uniform_amount: paymentData.uniformAmount || 0,
      books_amount: paymentData.booksAmount || 0,
      boarding_amount: paymentData.boardingAmount || 0,
      transport_amount: paymentData.transportAmount || 0,
      exam_fee_amount: paymentData.examFeeAmount || 0,
      activity_fee_amount: paymentData.activityFeeAmount || 0,
      is_partial_payment: paymentData.isPartialPayment || false,
      partial_percent: paymentData.partialPercent,
      remaining_balance: paymentData.remainingBalance || 0,
      total_fees_due: paymentData.totalFeesDue,
      payment_date: new Date().toISOString(),
      academic_year: paymentData.academicYear,
      term_name: paymentData.termName,
      student_name: paymentData.studentName,
      student_number: paymentData.studentNumber,
      grade: paymentData.grade, class_name: paymentData.className,
      parent_name: paymentData.parentName, parent_phone: paymentData.parentPhone,
      status: 'completed', receipt_sent: false,
      metadata: paymentData.metadata || {}, tenant_id: paymentData.tenantId,
    });
  }

  /**
   * Find payments by user
   */
  static async findByUser(userId) {
    return this.paginate({ where: { user_id: userId }, orderBy: { created_at: 'DESC' } });
  }

  /**
   * Find payments by student
   */
  static async findByStudent(studentId) {
    return this.findAll({ where: { student_id: studentId }, orderBy: { created_at: 'DESC' } });
  }

  /**
   * Find payments by school
   */
  static async findBySchool(schoolId, options = {}) {
    return this.paginate({ where: { school_id: schoolId }, orderBy: { created_at: 'DESC' }, ...options });
  }

  /**
   * Get payment summary for a school
   */
  static async getSchoolSummary(schoolId, academicYear = null) {
    const text = `
      SELECT
        COUNT(*) as total_payments, SUM(amount) as total_collected,
        SUM(convenience_fee) as total_fees, AVG(amount) as avg_payment,
        COUNT(DISTINCT student_id) as unique_students,
        COUNT(DISTINCT user_id) as unique_payers
      FROM ${this.tableName}
      WHERE school_id = $1 AND status = 'completed'
        ${academicYear ? 'AND academic_year = $2' : ''}
    `;
    const values = [schoolId];
    if (academicYear) values.push(academicYear);
    const result = await connectionPool.query(text, values);
    return result.rows[0];
  }
}

module.exports = SchoolFeesPayment;