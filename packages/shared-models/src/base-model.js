const { connectionPool } = require('@siamsiam/shared-utils').database;
const QueryBuilder = require('@siamsiam/shared-utils').database.queryBuilder;
const logger = require('@siamsiam/shared-utils').logging.logger;
const { validateSchema } = require('@siamsiam/shared-utils').validators;
const crypto = require('crypto');

/**
 * Base ORM Model with Common Fields and Behaviors
 * 
 * This is the foundation for ALL models in the SiamSiam ecosystem.
 * Provides comprehensive CRUD operations, validation hooks,
 * relationship management, event system, and query building.
 * 
 * ARCHITECTURE:
 * - Active Record pattern with static methods
 * - Instance methods for record-level operations  
 * - Hook system for lifecycle events (beforeCreate, afterSave, etc.)
 * - Validation framework integration
 * - Relationship loading (belongsTo, hasMany, hasOne, belongsToMany)
 * - Query scoping for multi-tenancy
 * - Caching integration
 * - Event emission for cross-service communication
 * 
 * COMMON FIELDS (present on every table):
 * - id: UUID v4 primary key
 * - created_at: Timestamp with timezone (auto-set)
 * - updated_at: Timestamp with timezone (auto-updated)
 * - created_by: User who created the record
 * - updated_by: User who last updated the record
 * - tenant_id: Multi-tenant isolation key
 * - version: Optimistic locking version number
 * 
 * @example
 *   class User extends BaseModel {
 *     static tableName = 'users';
 *     static primaryKey = 'id';
 *     static fields = [...];
 *     static guarded = ['password_hash', 'failed_login_attempts'];
 *     static relations = {
 *       sessions: { type: 'hasMany', model: 'UserSession', foreignKey: 'user_id' },
 *       wallet: { type: 'hasOne', model: 'Wallet', foreignKey: 'user_id' },
 *     };
 *     static hooks = {
 *       beforeCreate: [async (data) => { ... }],
 *       afterCreate: [async (record) => { ... }],
 *     };
 *   }
 */

class BaseModel {
  // ==================== STATIC CONFIGURATION ====================
  
  /** @type {string} Database table name */
  static tableName = '';
  
  /** @type {string} Primary key column */
  static primaryKey = 'id';
  
  /** @type {string[]} All table columns */
  static fields = ['id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'tenant_id', 'version'];
  
  /** @type {string[]} Fields that cannot be mass-assigned */
  static guarded = ['id', 'created_at', 'updated_at', 'version'];
  
  /** @type {string[]} Fields that are always hidden from serialization */
  static hidden = [];
  
  /** @type {string[]} Fields that should be cast to specific types */
  static casts = {};
  
  /** @type {Object} Relationship definitions */
  static relations = {};
  
  /** @type {Object} Lifecycle hooks */
  static hooks = {
    beforeCreate: [],
    afterCreate: [],
    beforeUpdate: [],
    afterUpdate: [],
    beforeDelete: [],
    afterDelete: [],
    beforeSave: [],
    afterSave: [],
    afterFind: [],
  };
  
  /** @type {boolean} Enable soft deletes */
  static softDelete = false;
  
  /** @type {string} Soft delete column */
  static softDeleteColumn = 'deleted_at';
  
  /** @type {boolean} Enable automatic timestamps */
  static timestamps = true;
  
  /** @type {boolean} Enable optimistic locking */
  static optimisticLocking = true;
  
  /** @type {number} Default pagination page size */
  static perPage = 20;
  
  /** @type {number} Maximum records per page */
  static maxPerPage = 100;

  // ==================== INSTANCE PROPERTIES ====================
  
  constructor(data = {}) {
    this._exists = false;
    this._original = {};
    this._relations = {};
    this._dirty = new Set();
    
    // Fill with data
    this.fill(data);
  }

  // ==================== CRUD OPERATIONS ====================

  /**
   * Find a single record by primary key
   * @param {string|number} id - Primary key value
   * @param {Object} options - Query options
   * @param {string[]} options.with - Relations to eager load
   * @param {boolean} options.withTrashed - Include soft-deleted records
   * @returns {Promise<BaseModel|null>} Model instance or null
   */
  static async findById(id, options = {}) {
    const query = this._newQuery()
      .where(this.primaryKey, id)
      .limit(1);

    if (!options.withTrashed && this.softDelete) {
      query.whereNull(this.softDeleteColumn);
    }

    const { text, values } = query.buildSelect();
    const result = await connectionPool.query(text, values);
    
    if (result.rows.length === 0) return null;

    const model = this._hydrate(result.rows[0]);
    
    // Execute afterFind hooks
    for (const hook of this.hooks.afterFind) {
      await hook(model);
    }

    // Eager load relations
    if (options.with) {
      await model.loadRelations(options.with);
    }

    return model;
  }

  /**
   * Find all records matching criteria
   * @param {Object} criteria - Query criteria
   * @returns {Promise<BaseModel[]>} Array of model instances
   */
  static async findAll(criteria = {}) {
    const query = this._applyQueryCriteria(criteria);
    const { text, values } = query.buildSelect();
    const result = await connectionPool.query(text, values);
    
    const models = result.rows.map(row => this._hydrate(row));
    
    // Execute afterFind hooks
    for (const model of models) {
      for (const hook of this.hooks.afterFind) {
        await hook(model);
      }
    }

    return models;
  }

  /**
   * Find a single record matching criteria
   */
  static async findOne(criteria = {}) {
    criteria.limit = 1;
    const results = await this.findAll(criteria);
    return results[0] || null;
  }

  /**
   * Paginate records
   */
  static async paginate(criteria = {}, page = 1, perPage = null) {
    perPage = Math.min(perPage || this.perPage, this.maxPerPage);
    
    const countQuery = this._applyQueryCriteria({ ...criteria, select: [] });
    const { text: countText, values: countValues } = countQuery.buildCount();
    const countResult = await connectionPool.query(countText, countValues);
    const total = parseInt(countResult.rows[0].total);

    const query = this._applyQueryCriteria({
      ...criteria,
      offset: (page - 1) * perPage,
      limit: perPage,
    });

    const { text, values } = query.buildSelect();
    const result = await connectionPool.query(text, values);
    const models = result.rows.map(row => this._hydrate(row));

    return {
      data: models,
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
        hasMore: page * perPage < total,
        hasPrevious: page > 1,
        nextPage: page * perPage < total ? page + 1 : null,
        previousPage: page > 1 ? page - 1 : null,
      },
    };
  }

  /**
   * Create a new record
   */
  static async create(data, options = {}) {
    const model = new this(data);
    await model.save(options);
    return model;
  }

  /**
   * Save the model (create or update)
   */
  async save(options = {}) {
    const data = this._getDirtyData();
    
    // Validate data
    if (this.constructor.validate) {
      await this.constructor.validate(data);
    }

    if (!this._exists) {
      return this._performCreate(data, options);
    } else {
      return this._performUpdate(data, options);
    }
  }

  /**
   * Update records matching criteria
   */
  static async update(criteria, data) {
    const query = this._newQuery();
    
    if (this.timestamps) {
      data.updated_at = new Date().toISOString();
    }

    const { text, values } = query
      .where(criteria)
      .buildUpdate(this.tableName, data);

    const result = await connectionPool.query(text, values);
    return result.rowCount;
  }

  /**
   * Delete a record (soft or hard)
   */
  async delete() {
    // Execute beforeDelete hooks
    for (const hook of this.constructor.hooks.beforeDelete) {
      await hook(this);
    }

    let result;
    if (this.constructor.softDelete) {
      result = await this._softDelete();
    } else {
      result = await this._hardDelete();
    }

    // Execute afterDelete hooks
    for (const hook of this.constructor.hooks.afterDelete) {
      await hook(this);
    }

    this._exists = false;
    return result;
  }

  // ==================== RELATIONSHIPS ====================

  /**
   * Load specified relations
   */
  async loadRelations(relations) {
    if (typeof relations === 'string') {
      relations = [relations];
    }

    for (const relation of relations) {
      await this._loadRelation(relation);
    }
  }

  /**
   * Define a belongs-to relationship
   */
  static belongsTo(relatedModel, foreignKey = null, ownerKey = null) {
    return {
      type: 'belongsTo',
      model: relatedModel,
      foreignKey: foreignKey || `${relatedModel.tableName}_id`,
      ownerKey: ownerKey || relatedModel.primaryKey,
    };
  }

  /**
   * Define a has-many relationship
   */
  static hasMany(relatedModel, foreignKey = null, localKey = null) {
    return {
      type: 'hasMany',
      model: relatedModel,
      foreignKey: foreignKey || `${this.tableName}_id`,
      localKey: localKey || this.primaryKey,
    };
  }

  /**
   * Define a has-one relationship
   */
  static hasOne(relatedModel, foreignKey = null, localKey = null) {
    return {
      type: 'hasOne',
      model: relatedModel,
      foreignKey: foreignKey || `${this.tableName}_id`,
      localKey: localKey || this.primaryKey,
    };
  }

  // ==================== INSTANCE METHODS ====================

  /**
   * Fill the model with data
   */
  fill(data) {
    for (const [key, value] of Object.entries(data)) {
      if (this.constructor.guarded.includes(key)) continue;
      if (!this.constructor.fields.includes(key)) continue;
      
      // Apply type casting
      this[key] = this._castValue(key, value);
      this._dirty.add(key);
    }
    return this;
  }

  /**
   * Get the original value of an attribute
   */
  getOriginal(key) {
    return this._original[key];
  }

  /**
   * Check if an attribute has been modified
   */
  isDirty(key = null) {
    if (key) return this._dirty.has(key);
    return this._dirty.size > 0;
  }

  /**
   * Get only dirty attributes
   */
  getDirty() {
    const dirty = {};
    for (const key of this._dirty) {
      dirty[key] = this[key];
    }
    return dirty;
  }

  /**
   * Convert model to plain object
   */
  toJSON() {
    const obj = {};
    for (const field of this.constructor.fields) {
      if (this.constructor.hidden.includes(field)) continue;
      if (this[field] !== undefined) {
        obj[field] = this[field];
      }
    }
    return obj;
  }

  // ==================== QUERY SCOPES ====================

  /**
   * Scope: Only active records
   */
  static scopeActive(query) {
    return query.where('is_active', true);
  }

  /**
   * Scope: Include soft-deleted records
   */
  static scopeWithTrashed(query) {
    query._includeTrashed = true;
    return query;
  }

  /**
   * Scope: Filter by tenant
   */
  static scopeByTenant(query, tenantId) {
    return query.where('tenant_id', tenantId);
  }

  /**
   * Scope: Filter by date range
   */
  static scopeDateRange(query, startDate, endDate, column = 'created_at') {
    return query.whereBetween(column, startDate, endDate);
  }

  // ==================== TRANSACTIONS ====================

  /**
   * Execute operations within a database transaction
   */
  static async transaction(callback) {
    return connectionPool.transaction(async (client) => {
      // Temporarily override query to use transaction client
      const originalQuery = connectionPool.query;
      connectionPool.query = (text, params) => client.query(text, params);
      
      try {
        const result = await callback();
        return result;
      } finally {
        connectionPool.query = originalQuery;
      }
    });
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Create a new query builder instance
   * @private
   */
  static _newQuery() {
    const query = new QueryBuilder();
    query.select(this.fields).from(this.tableName);
    
    if (this.softDelete && !query._includeTrashed) {
      query.whereNull(this.softDeleteColumn);
    }
    
    return query;
  }

  /**
   * Apply criteria to query builder
   * @private
   */
  static _applyQueryCriteria(criteria = {}) {
    const query = this._newQuery();

    // WHERE conditions
    if (criteria.where) {
      for (const [key, value] of Object.entries(criteria.where)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          query.where(key, value.operator || '=', value.value);
        } else {
          query.where(key, value);
        }
      }
    }

    // WHERE IN conditions
    if (criteria.whereIn) {
      for (const [key, values] of Object.entries(criteria.whereIn)) {
        query.whereIn(key, values);
      }
    }

    // WHERE BETWEEN
    if (criteria.whereBetween) {
      for (const [key, [start, end]] of Object.entries(criteria.whereBetween)) {
        query.whereBetween(key, start, end);
      }
    }

    // WHERE NULL
    if (criteria.whereNull) {
      for (const key of criteria.whereNull) {
        query.whereNull(key);
      }
    }

    // WHERE NOT NULL
    if (criteria.whereNotNull) {
      for (const key of criteria.whereNotNull) {
        query.whereNotNull(key);
      }
    }

    // Raw WHERE
    if (criteria.whereRaw) {
      query.whereRaw(criteria.whereRaw.condition, criteria.whereRaw.params || []);
    }

    // ORDER BY
    if (criteria.orderBy) {
      if (typeof criteria.orderBy === 'string') {
        query.orderBy(criteria.orderBy);
      } else if (Array.isArray(criteria.orderBy)) {
        for (const order of criteria.orderBy) {
          query.orderBy(order.column, order.direction || 'ASC');
        }
      } else {
        for (const [column, direction] of Object.entries(criteria.orderBy)) {
          query.orderBy(column, direction);
        }
      }
    }

    // GROUP BY
    if (criteria.groupBy) {
      query.groupBy(criteria.groupBy);
    }

    // LIMIT & OFFSET
    if (criteria.limit) query.limit(criteria.limit);
    if (criteria.offset) query.offset(criteria.offset);

    // SELECT specific fields
    if (criteria.select && criteria.select.length > 0) {
      query.select(criteria.select);
    }

    // JOIN
    if (criteria.joins) {
      for (const join of criteria.joins) {
        query.join(join.table, join.on, join.type || 'INNER');
      }
    }

    return query;
  }

  /**
   * Hydrate a database row into a model instance
   * @private
   */
  static _hydrate(row) {
    const model = new this();
    model._exists = true;
    
    for (const [key, value] of Object.entries(row)) {
      model[key] = model._castValue(key, value);
      model._original[key] = value;
    }
    
    model._dirty.clear();
    return model;
  }

  /**
   * Cast a value based on field type definitions
   * @private
   */
  _castValue(key, value) {
    if (value === null || value === undefined) return value;
    
    const castType = this.constructor.casts[key];
    if (!castType) return value;

    switch (castType) {
      case 'boolean':
        return Boolean(value);
      case 'integer':
        return parseInt(value, 10);
      case 'float':
      case 'decimal':
        return parseFloat(value);
      case 'json':
      case 'array':
        return typeof value === 'string' ? JSON.parse(value) : value;
      case 'date':
      case 'datetime':
        return new Date(value);
      case 'string':
        return String(value);
      default:
        return value;
    }
  }

  /**
   * Get data that has been modified
   * @private
   */
  _getDirtyData() {
    const data = {};
    for (const key of this._dirty) {
      data[key] = this[key];
    }
    return data;
  }

  /**
   * Perform create operation
   * @private
   */
  async _performCreate(data, options = {}) {
    // Set timestamps
    if (this.constructor.timestamps) {
      const now = new Date().toISOString();
      data.created_at = now;
      data.updated_at = now;
    }

    // Generate ID if not provided
    if (!data[this.constructor.primaryKey]) {
      data[this.constructor.primaryKey] = this._generateId();
    }

    // Set version for optimistic locking
    if (this.constructor.optimisticLocking) {
      data.version = 1;
    }

    // Execute beforeCreate hooks
    for (const hook of this.constructor.hooks.beforeCreate) {
      await hook(data);
    }
    
    // Execute beforeSave hooks
    for (const hook of this.constructor.hooks.beforeSave) {
      await hook(data);
    }

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`);

    const text = `
      INSERT INTO ${this.constructor.tableName} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    const result = await connectionPool.query(text, values);
    const row = result.rows[0];

    // Update instance
    for (const [key, value] of Object.entries(row)) {
      this[key] = this._castValue(key, value);
      this._original[key] = value;
    }
    
    this._exists = true;
    this._dirty.clear();

    // Execute afterCreate hooks
    for (const hook of this.constructor.hooks.afterCreate) {
      await hook(this);
    }
    
    // Execute afterSave hooks
    for (const hook of this.constructor.hooks.afterSave) {
      await hook(this);
    }

    return this;
  }

  /**
   * Perform update operation
   * @private
   */
  async _performUpdate(data, options = {}) {
    if (Object.keys(data).length === 0) return this;

    // Set timestamps
    if (this.constructor.timestamps) {
      data.updated_at = new Date().toISOString();
    }

    // Optimistic locking check
    if (this.constructor.optimisticLocking) {
      const currentVersion = this.version || 0;
      data.version = currentVersion + 1;
    }

    // Execute beforeUpdate hooks
    for (const hook of this.constructor.hooks.beforeUpdate) {
      await hook(data, this);
    }
    
    // Execute beforeSave hooks
    for (const hook of this.constructor.hooks.beforeSave) {
      await hook(data, this);
    }

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    // Add primary key to values
    const id = this[this.constructor.primaryKey];
    values.push(id);
    const primaryCondition = `${this.constructor.primaryKey} = $${paramIndex}`;
    paramIndex++;

    // Add version check for optimistic locking
    let versionCondition = '';
    if (this.constructor.optimisticLocking) {
      values.push(this._original.version || this.version || 0);
      versionCondition = ` AND version = $${paramIndex}`;
    }

    const text = `
      UPDATE ${this.constructor.tableName}
      SET ${setClauses.join(', ')}
      WHERE ${primaryCondition}${versionCondition}
      RETURNING *
    `;

    const result = await connectionPool.query(text, values);

    if (result.rows.length === 0) {
      if (this.constructor.optimisticLocking) {
        throw new Error('Record was modified by another process. Please refresh and try again.');
      }
      throw new Error('Record not found');
    }

    const row = result.rows[0];
    
    // Update instance
    for (const [key, value] of Object.entries(row)) {
      this[key] = this._castValue(key, value);
      this._original[key] = value;
    }
    
    this._dirty.clear();

    // Execute afterUpdate hooks
    for (const hook of this.constructor.hooks.afterUpdate) {
      await hook(this);
    }
    
    // Execute afterSave hooks
    for (const hook of this.constructor.hooks.afterSave) {
      await hook(this);
    }

    return this;
  }

  /**
   * Perform soft delete
   * @private
   */
  async _softDelete() {
    const data = {
      [this.constructor.softDeleteColumn]: new Date().toISOString(),
      deleted_by: this._currentUser?.id || null,
    };
    
    if (this.constructor.timestamps) {
      data.updated_at = new Date().toISOString();
    }

    return this._performUpdate(data);
  }

  /**
   * Perform hard delete
   * @private
   */
  async _hardDelete() {
    const text = `DELETE FROM ${this.constructor.tableName} WHERE ${this.constructor.primaryKey} = $1`;
    const result = await connectionPool.query(text, [this[this.constructor.primaryKey]]);
    return result.rowCount > 0;
  }

  /**
   * Load a single relation
   * @private
   */
  async _loadRelation(relationName) {
    const relation = this.constructor.relations[relationName];
    if (!relation) throw new Error(`Relation not defined: ${relationName}`);
    
    const RelatedModel = require(`./${relation.model.toLowerCase()}`);

    switch (relation.type) {
      case 'hasMany':
        this._relations[relationName] = await RelatedModel.findAll({
          where: { [relation.foreignKey]: this[relation.localKey] },
        });
        break;

      case 'hasOne':
        this._relations[relationName] = await RelatedModel.findOne({
          where: { [relation.foreignKey]: this[relation.localKey] },
        });
        break;

      case 'belongsTo':
        this._relations[relationName] = await RelatedModel.findById(this[relation.foreignKey]);
        break;
    }
  }

  /**
   * Generate a UUID v4
   * @private
   */
  _generateId() {
    return crypto.randomUUID();
  }
}

module.exports = BaseModel;