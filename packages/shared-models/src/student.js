const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Student Model - Student Record for Fee Payment
 * 
 * Stores student information linked to schools for fee payment
 * identification. Parents can look up students by student number
 * and make fee payments directly.
 * 
 * TABLE: students
 */

class Student extends BaseModel {
  static tableName = 'students';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'school_id', 'student_number',
    'first_name', 'middle_name', 'last_name',
    'full_name', 'date_of_birth', 'gender',
    'grade', 'class_name', 'section',
    'stream', 'house', 'boarding_status',
    'student_type', 'enrollment_status',
    'enrollment_date', 'graduation_date',
    'transfer_date', 'transfer_school',
    'parent_name', 'parent_relationship',
    'parent_phone', 'parent_email', 'parent_address',
    'alternative_contact_name', 'alternative_contact_phone',
    'alternative_contact_relationship',
    'guardian_name', 'guardian_phone', 'guardian_email',
    'emergency_contact_name', 'emergency_contact_phone',
    'medical_conditions', 'allergies', 'medications',
    'blood_group', 'doctor_name', 'doctor_phone',
    'student_photo_url', 'birth_certificate_url',
    'previous_school', 'previous_school_records_url',
    'transport_required', 'transport_pickup_point',
    'transport_route', 'transport_fee',
    'boarding_required', 'boarding_room',
    'meal_plan', 'dietary_requirements',
    'scholarship', 'scholarship_name',
    'scholarship_amount', 'scholarship_details',
    'total_fees_due', 'total_fees_paid',
    'outstanding_balance', 'last_payment_date',
    'last_payment_amount', 'fee_category',
    'is_active', 'is_archived', 'archived_reason',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    total_fees_due: 'float', total_fees_paid: 'float',
    outstanding_balance: 'float', last_payment_amount: 'float',
    transport_fee: 'float', scholarship_amount: 'float',
    transport_required: 'boolean', boarding_required: 'boolean',
    is_active: 'boolean', is_archived: 'boolean',
    medical_conditions: 'json', allergies: 'json',
    medications: 'json', dietary_requirements: 'json',
    metadata: 'json', tags: 'json',
  };

  static relations = {
    school: { type: 'belongsTo', model: 'School', foreignKey: 'school_id', ownerKey: 'id' },
    payments: { type: 'hasMany', model: 'SchoolFeesPayment', foreignKey: 'student_id', localKey: 'id' },
  };

  static enrollmentStatuses = {
    ACTIVE: 'active', GRADUATED: 'graduated', TRANSFERRED: 'transferred',
    SUSPENDED: 'suspended', EXPELLED: 'expelled', WITHDRAWN: 'withdrawn',
    ON_LEAVE: 'on_leave', DECEASED: 'deceased',
  };

  static boardingStatuses = {
    DAY_SCHOLAR: 'day_scholar', BOARDER: 'boarder',
    WEEKLY_BOARDER: 'weekly_boarder', FLEXI_BOARDER: 'flexi_boarder',
  };

  /**
   * Register a new student
   */
  static async register(schoolId, studentData) {
    const existing = await this.findOne({
      where: { school_id: schoolId, student_number: studentData.studentNumber },
    });
    if (existing) throw new Error('Student with this number already exists');

    return this.create({
      school_id: schoolId, student_number: studentData.studentNumber,
      first_name: studentData.firstName, middle_name: studentData.middleName,
      last_name: studentData.lastName,
      full_name: `${studentData.firstName} ${studentData.middleName || ''} ${studentData.lastName}`.trim(),
      date_of_birth: studentData.dateOfBirth, gender: studentData.gender,
      grade: studentData.grade, class_name: studentData.className,
      section: studentData.section, stream: studentData.stream,
      house: studentData.house, boarding_status: studentData.boardingStatus || 'day_scholar',
      student_type: studentData.studentType || 'regular',
      enrollment_status: this.enrollmentStatuses.ACTIVE,
      enrollment_date: studentData.enrollmentDate || new Date().toISOString(),
      parent_name: studentData.parentName, parent_relationship: studentData.parentRelationship,
      parent_phone: studentData.parentPhone, parent_email: studentData.parentEmail?.toLowerCase(),
      parent_address: studentData.parentAddress,
      emergency_contact_name: studentData.emergencyContactName,
      emergency_contact_phone: studentData.emergencyContactPhone,
      medical_conditions: studentData.medicalConditions || [],
      allergies: studentData.allergies || [],
      blood_group: studentData.bloodGroup,
      transport_required: studentData.transportRequired || false,
      transport_pickup_point: studentData.transportPickupPoint,
      boarding_required: studentData.boardingRequired || false,
      is_active: true, metadata: studentData.metadata || {},
      tenant_id: studentData.tenantId,
    });
  }

  /**
   * Find students by school
   */
  static async findBySchool(schoolId, options = {}) {
    return this.paginate({
      where: { school_id: schoolId, is_active: true },
      orderBy: { last_name: 'ASC', first_name: 'ASC' },
      ...options,
    });
  }

  /**
   * Find student by student number
   */
  static async findByStudentNumber(schoolId, studentNumber) {
    return this.findOne({
      where: { school_id: schoolId, student_number: studentNumber, is_active: true },
    });
  }

  /**
   * Search students by name or number
   */
  static async search(schoolId, query, options = {}) {
    const text = `
      SELECT * FROM ${this.tableName}
      WHERE school_id = $1 AND is_active = true
        AND (student_number ILIKE $2 OR full_name ILIKE $2
             OR first_name ILIKE $2 OR last_name ILIKE $2)
      ORDER BY last_name ASC
      LIMIT $3 OFFSET $4
    `;
    const result = await connectionPool.query(text, [schoolId, `%${query}%`, options.limit || 20, options.offset || 0]);
    return result.rows;
  }

  /**
   * Update outstanding balance
   */
  static async updateBalance(studentId, amountPaid) {
    const student = await this.findById(studentId);
    if (!student) return;
    const newPaid = (student.total_fees_paid || 0) + amountPaid;
    const newOutstanding = Math.max(0, (student.total_fees_due || 0) - newPaid);
    return this.update({ id: studentId }, {
      total_fees_paid: newPaid, outstanding_balance: newOutstanding,
      last_payment_date: new Date().toISOString(), last_payment_amount: amountPaid,
    });
  }
}

module.exports = Student;