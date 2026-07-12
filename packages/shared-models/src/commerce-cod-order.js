const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * COD Order Model - Cash on Delivery Order
 * 
 * Manages Cash on Delivery orders with risk assessment,
 * collection tracking, and reconciliation.
 * 
 * TABLE: cod_orders
 * 
 * RISK FACTORS:
 * - New customer (higher risk)
 * - High order value
 * - Delivery to high-risk area
 * - Previous COD failures
 * - Unusual order patterns
 */

class CodOrder extends BaseModel {
  static tableName = 'cod_orders';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'order_id', 'user_id',
    // Order details
    'cod_amount', 'cod_currency', 'total_order_amount',
    // Risk assessment
    'risk_score', 'risk_level', 'risk_factors',
    'is_approved', 'approved_by', 'approved_at',
    'requires_deposit', 'deposit_amount',
    'deposit_paid', 'deposit_transaction_id',
    // Delivery
    'delivery_id', 'driver_id',
    'delivery_attempts', 'max_delivery_attempts',
    // Collection
    'collection_status', 'collected_amount',
    'collected_at', 'collected_by',
    'collection_method', 'collection_reference',
    'collection_notes', 'collection_photo_url',
    // Verification
    'is_verified', 'verification_code',
    'verification_method', 'verified_at',
    'verified_by_customer', 'verified_by_driver',
    // Refund (if COD fails)
    'refund_required', 'refund_amount',
    'refund_status', 'refund_transaction_id',
    // Dispute
    'is_disputed', 'dispute_reason',
    'disputed_at', 'dispute_resolved_at',
    // Return
    'returned_at', 'return_reason',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    cod_amount: 'float',
    total_order_amount: 'float',
    risk_score: 'integer',
    risk_factors: 'json',
    deposit_amount: 'float',
    collected_amount: 'float',
    refund_amount: 'float',
    is_approved: 'boolean',
    requires_deposit: 'boolean',
    deposit_paid: 'boolean',
    is_verified: 'boolean',
    verified_by_customer: 'boolean',
    verified_by_driver: 'boolean',
    refund_required: 'boolean',
    is_disputed: 'boolean',
    delivery_attempts: 'integer',
    max_delivery_attempts: 'integer',
    metadata: 'json',
    tags: 'json',
  };

  static relations = {
    order: { type: 'belongsTo', model: 'Order', foreignKey: 'order_id', ownerKey: 'id' },
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    delivery: { type: 'belongsTo', model: 'Delivery', foreignKey: 'delivery_id', ownerKey: 'id' },
  };

  static riskLevels = {
    LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical',
  };

  static collectionStatuses = {
    PENDING: 'pending', IN_PROGRESS: 'in_progress',
    COLLECTED: 'collected', FAILED: 'failed',
    PARTIALLY_COLLECTED: 'partially_collected',
    REFUNDED: 'refunded', DISPUTED: 'disputed',
  };

  /**
   * Assess COD risk for an order
   */
  static assessRisk(userId, orderAmount, deliveryAddress, userHistory = {}) {
    const riskFactors = [];
    let riskScore = 0;

    // New user (higher risk)
    if (userHistory.totalOrders < 3) {
      riskFactors.push('new_customer');
      riskScore += 20;
    }

    // Previous COD failures
    if (userHistory.codFailures > 0) {
      riskFactors.push('previous_cod_failure');
      riskScore += 30 * userHistory.codFailures;
    }

    // High order value
    if (orderAmount > 500) {
      riskFactors.push('high_value_order');
      riskScore += 15;
    }

    // First COD order
    if (userHistory.codOrders === 0) {
      riskFactors.push('first_cod_order');
      riskScore += 10;
    }

    let riskLevel = this.riskLevels.LOW;
    if (riskScore >= 70) riskLevel = this.riskLevels.CRITICAL;
    else if (riskScore >= 50) riskLevel = this.riskLevels.HIGH;
    else if (riskScore >= 30) riskLevel = this.riskLevels.MEDIUM;

    return {
      riskScore: Math.min(riskScore, 100),
      riskLevel,
      riskFactors,
      requiresDeposit: riskLevel === this.riskLevels.HIGH || riskLevel === this.riskLevels.CRITICAL,
      depositPercentage: riskLevel === this.riskLevels.CRITICAL ? 50 : riskLevel === this.riskLevels.HIGH ? 25 : 0,
    };
  }

  /**
   * Find COD orders by user
   */
  static async findByUser(userId) {
    return this.findAll({
      where: { user_id: userId },
      orderBy: { created_at: 'DESC' },
    });
  }

  /**
   * Find pending COD collections for a driver
   */
  static async findPendingForDriver(driverId) {
    return this.findAll({
      where: {
        driver_id: driverId,
        collection_status: [this.collectionStatuses.PENDING, this.collectionStatuses.IN_PROGRESS],
      },
      orderBy: { created_at: 'ASC' },
    });
  }

  /**
   * Record COD collection
   */
  static async recordCollection(codOrderId, amount, method, collectedBy, options = {}) {
    return this.update({ id: codOrderId }, {
      collection_status: this.collectionStatuses.COLLECTED,
      collected_amount: amount,
      collected_at: new Date().toISOString(),
      collected_by: collectedBy,
      collection_method: method,
      collection_reference: options.reference || null,
      collection_notes: options.notes || null,
      collection_photo_url: options.photoUrl || null,
    });
  }

  /**
   * Record failed COD collection
   */
  static async recordFailed(codOrderId, reason) {
    const order = await this.findById(codOrderId);
    const attempts = (order?.delivery_attempts || 0) + 1;
    const maxAttempts = order?.max_delivery_attempts || 3;

    const updates = {
      delivery_attempts: attempts,
    };

    if (attempts >= maxAttempts) {
      updates.collection_status = this.collectionStatuses.FAILED;
      updates.returned_at = new Date().toISOString();
      updates.return_reason = reason;
    }

    return this.update({ id: codOrderId }, updates);
  }

  /**
   * Get COD statistics
   */
  static async getStats(options = {}) {
    const text = `
      SELECT
        COUNT(*) as total_cod_orders,
        COUNT(CASE WHEN collection_status = 'collected' THEN 1 END) as successful,
        COUNT(CASE WHEN collection_status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN collection_status = 'disputed' THEN 1 END) as disputed,
        SUM(cod_amount) as total_cod_value,
        SUM(collected_amount) as total_collected,
        AVG(risk_score) as avg_risk_score
      FROM ${this.tableName}
      ${options.startDate ? 'WHERE created_at >= $1' : ''}
    `;
    const values = options.startDate ? [options.startDate.toISOString()] : [];
    const result = await connectionPool.query(text, values);
    return result.rows[0];
  }
}

module.exports = CodOrder;