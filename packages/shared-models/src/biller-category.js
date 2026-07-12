const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Biller Category Model - Biller Type Classification
 * 
 * Organizes billers into logical categories for navigation and reporting.
 * Categories define the types of services users can pay for.
 * 
 * TABLE: biller_categories
 * 
 * CATEGORIES:
 * - electricity: Power utilities (ZESA, etc.)
 * - water: Water utilities
 * - internet: Internet service providers
 * - dstv: Satellite TV subscriptions
 * - gas: Gas utilities
 * - council_rates: Municipal services
 * - school_fees: Educational institutions
 * - insurance: Insurance providers
 * - transportation: Transport services
 * - other: Miscellaneous services
 */

class BillerCategory extends BaseModel {
  static tableName = 'biller_categories';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'name', 'slug', 'description',
    'icon', 'icon_url', 'color',
    'is_active', 'is_featured',
    'sort_order', 'display_order',
    'metadata', 'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    is_active: 'boolean',
    is_featured: 'boolean',
    sort_order: 'integer',
    display_order: 'integer',
    metadata: 'json',
  };

  static relations = {
    billers: {
      type: 'hasMany',
      model: 'Biller',
      foreignKey: 'category_id',
      localKey: 'id',
    },
  };

  /**
   * Get all active categories ordered by display order
   */
  static async getActive() {
    return this.findAll({
      where: { is_active: true },
      orderBy: { display_order: 'ASC', sort_order: 'ASC' },
    });
  }

  /**
   * Get featured categories (shown on home screen)
   */
  static async getFeatured() {
    return this.findAll({
      where: { is_active: true, is_featured: true },
      orderBy: { display_order: 'ASC' },
      limit: 6,
    });
  }

  /**
   * Find category by slug
   * @param {string} slug - Category slug
   */
  static async findBySlug(slug) {
    return this.findOne({
      where: { slug, is_active: true },
      with: ['billers'],
    });
  }

  /**
   * Get categories with biller counts
   */
  static async getWithBillerCounts() {
    const { connectionPool } = require('@siamsiam/shared-utils').database;
    const text = `
      SELECT 
        bc.*,
        COUNT(b.id) as biller_count
      FROM ${this.tableName} bc
      LEFT JOIN billers b ON bc.id = b.category_id 
        AND b.is_active = true AND b.is_verified = true
      WHERE bc.is_active = true
      GROUP BY bc.id
      ORDER BY bc.display_order ASC
    `;
    
    const result = await connectionPool.query(text);
    return result.rows;
  }
}

module.exports = BillerCategory;