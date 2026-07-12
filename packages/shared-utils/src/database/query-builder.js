/**
 * Dynamic SQL Query Builder
 * 
 * Provides a safe and flexible way to build dynamic SQL queries
 * with automatic parameterization to prevent SQL injection attacks.
 * 
 * While we primarily use raw parameterized queries for performance,
 * this builder is invaluable for complex dynamic queries where
 * WHERE clauses, JOINs, and ORDER BY statements vary based on user input.
 * 
 * SECURITY: NEVER concatenate user input directly into SQL strings.
 * Always use parameterized queries ($1, $2, etc.) to prevent SQL injection.
 * 
 * @example
 *   const { text, values } = new QueryBuilder()
 *     .select(['id', 'name', 'email'])
 *     .from('users')
 *     .where('active', true)
 *     .where('created_at', '>=', startDate)
 *     .orderBy('created_at', 'DESC')
 *     .limit(10)
 *     .buildSelect();
 */

class QueryBuilder {
  constructor() {
    this.reset();
  }

  /**
   * Reset all query components
   */
  reset() {
    this._select = [];
    this._from = '';
    this._joins = [];
    this._where = [];
    this._whereParams = [];
    this._orderBy = [];
    this._groupBy = [];
    this._having = [];
    this._havingParams = [];
    this._limit = null;
    this._offset = null;
    this._returning = [];
    this._setClauses = {};
    return this;
  }

  // ==================== SELECT ====================

  select(columns = ['*']) {
    this._select = Array.isArray(columns) ? columns : [columns];
    return this;
  }

  selectDistinct(columns) {
    this._select = Array.isArray(columns) ? columns : [columns];
    this._distinct = true;
    return this;
  }

  // ==================== FROM ====================

  from(table, alias) {
    this._from = alias ? `${table} AS ${alias}` : table;
    return this;
  }

  // ==================== JOINS ====================

  join(table, condition, type = 'INNER') {
    this._joins.push(`${type} JOIN ${table} ON ${condition}`);
    return this;
  }

  leftJoin(table, condition) {
    return this.join(table, condition, 'LEFT');
  }

  rightJoin(table, condition) {
    return this.join(table, condition, 'RIGHT');
  }

  fullOuterJoin(table, condition) {
    return this.join(table, condition, 'FULL OUTER');
  }

  crossJoin(table) {
    this._joins.push(`CROSS JOIN ${table}`);
    return this;
  }

  // ==================== WHERE ====================

  where(column, operator, value) {
    // Handle two-argument form: where('column', value) -> column = value
    if (value === undefined) {
      value = operator;
      operator = '=';
    }
    
    // Handle NULL comparisons
    if (value === null) {
      this._where.push(`${column} IS NULL`);
    } 
    // Handle IN clauses
    else if (Array.isArray(value)) {
      if (value.length === 0) {
        this._where.push('FALSE');
      } else {
        const placeholders = value.map((_, i) => `$${this._whereParams.length + i + 1}`);
        this._where.push(`${column} ${operator} (${placeholders.join(', ')})`);
        this._whereParams.push(...value);
      }
    } 
    // Handle standard comparisons
    else {
      this._where.push(`${column} ${operator} $${this._whereParams.length + 1}`);
      this._whereParams.push(value);
    }
    return this;
  }

  whereRaw(condition, params = []) {
    this._where.push(condition);
    this._whereParams.push(...params);
    return this;
  }

  whereIn(column, values) {
    return this.where(column, 'IN', values);
  }

  whereNotIn(column, values) {
    return this.where(column, 'NOT IN', values);
  }

  whereNull(column) {
    return this.where(column, null);
  }

  whereNotNull(column) {
    this._where.push(`${column} IS NOT NULL`);
    return this;
  }

  whereBetween(column, start, end) {
    this._where.push(
      `${column} BETWEEN $${this._whereParams.length + 1} AND $${this._whereParams.length + 2}`
    );
    this._whereParams.push(start, end);
    return this;
  }

  whereLike(column, pattern) {
    return this.where(column, 'LIKE', pattern);
  }

  whereILike(column, pattern) {
    return this.where(column, 'ILIKE', pattern);
  }

  // Soft delete helpers
  whereNotDeleted(tableAlias) {
    const prefix = tableAlias ? `${tableAlias}.` : '';
    return this.whereNull(`${prefix}deleted_at`);
  }

  whereDeleted(tableAlias) {
    const prefix = tableAlias ? `${tableAlias}.` : '';
    return this.whereNotNull(`${prefix}deleted_at`);
  }

  // Tenant isolation
  whereTenant(tenantId, tableAlias) {
    const prefix = tableAlias ? `${tableAlias}.` : '';
    return this.where(`${prefix}tenant_id`, tenantId);
  }

  // ==================== ORDER BY ====================

  orderBy(column, direction = 'ASC') {
    const dir = direction.toUpperCase();
    if (!['ASC', 'DESC', 'ASC NULLS FIRST', 'ASC NULLS LAST', 'DESC NULLS FIRST', 'DESC NULLS LAST'].includes(dir)) {
      throw new Error(`Invalid sort direction: ${direction}`);
    }
    this._orderBy.push(`${column} ${dir}`);
    return this;
  }

  orderByRaw(expression) {
    this._orderBy.push(expression);
    return this;
  }

  // ==================== GROUP BY ====================

  groupBy(columns) {
    this._groupBy = Array.isArray(columns) ? columns : [columns];
    return this;
  }

  having(condition, ...params) {
    this._having.push(condition);
    this._havingParams.push(...params);
    return this;
  }

  // ==================== LIMIT & OFFSET ====================

  limit(limit) {
    this._limit = limit;
    return this;
  }

  offset(offset) {
    this._offset = offset;
    return this;
  }

  page(page = 1, perPage = 20) {
    this._limit = perPage;
    this._offset = (page - 1) * perPage;
    return this;
  }

  // ==================== RETURNING ====================

  returning(columns) {
    this._returning = Array.isArray(columns) ? columns : [columns];
    return this;
  }

  // ==================== BUILD METHODS ====================

  /**
   * Build SELECT query
   */
  buildSelect() {
    if (!this._from) throw new Error('FROM clause is required');
    
    const parts = [];
    
    // SELECT clause
    const selectKeyword = this._distinct ? 'SELECT DISTINCT' : 'SELECT';
    parts.push(`${selectKeyword} ${this._select.join(', ')}`);
    
    // FROM clause
    parts.push(`FROM ${this._from}`);
    
    // JOIN clauses
    if (this._joins.length > 0) {
      parts.push(this._joins.join(' '));
    }
    
    // WHERE clause
    if (this._where.length > 0) {
      parts.push(`WHERE ${this._where.join(' AND ')}`);
    }
    
    // GROUP BY clause
    if (this._groupBy.length > 0) {
      parts.push(`GROUP BY ${this._groupBy.join(', ')}`);
    }
    
    // HAVING clause
    if (this._having.length > 0) {
      parts.push(`HAVING ${this._having.join(' AND ')}`);
      this._whereParams.push(...this._havingParams);
    }
    
    // ORDER BY clause
    if (this._orderBy.length > 0) {
      parts.push(`ORDER BY ${this._orderBy.join(', ')}`);
    }
    
    // LIMIT & OFFSET
    if (this._limit !== null) {
      parts.push(`LIMIT $${this._whereParams.length + 1}`);
      this._whereParams.push(this._limit);
    }
    
    if (this._offset !== null) {
      parts.push(`OFFSET $${this._whereParams.length + 1}`);
      this._whereParams.push(this._offset);
    }
    
    return {
      text: parts.join(' '),
      values: this._whereParams,
    };
  }

  /**
   * Build INSERT query
   */
  buildInsert(table, data) {
    if (!table) throw new Error('Table name is required');
    if (!data || Object.keys(data).length === 0) throw new Error('Data is required');
    
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`);
    
    let query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
    
    if (this._returning.length > 0) {
      query += ` RETURNING ${this._returning.join(', ')}`;
    }
    
    return { text: query, values };
  }

  /**
   * Build bulk INSERT query
   */
  buildBulkInsert(table, rows) {
    if (!table) throw new Error('Table name is required');
    if (!rows || rows.length === 0) throw new Error('Rows are required');
    
    const columns = Object.keys(rows[0]);
    const values = [];
    const placeholders = [];
    
    rows.forEach((row, rowIndex) => {
      const rowPlaceholders = columns.map((_, colIndex) => 
        `$${rowIndex * columns.length + colIndex + 1}`
      );
      placeholders.push(`(${rowPlaceholders.join(', ')})`);
      values.push(...Object.values(row));
    });
    
    let query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`;
    
    if (this._returning.length > 0) {
      query += ` RETURNING ${this._returning.join(', ')}`;
    }
    
    return { text: query, values };
  }

  /**
   * Build UPDATE query
   */
  buildUpdate(table, data) {
    if (!table) throw new Error('Table name is required');
    if (!data || Object.keys(data).length === 0) throw new Error('Data is required');
    
    const setClauses = [];
    const setValues = [];
    
    Object.entries(data).forEach(([key, value]) => {
      setClauses.push(`${key} = $${setValues.length + 1}`);
      setValues.push(value);
    });
    
    let query = `UPDATE ${table} SET ${setClauses.join(', ')}`;
    
    if (this._where.length > 0) {
      query += ` WHERE ${this._where.join(' AND ')}`;
    }
    
    if (this._returning.length > 0) {
      query += ` RETURNING ${this._returning.join(', ')}`;
    }
    
    return {
      text: query,
      values: [...setValues, ...this._whereParams],
    };
  }

  /**
   * Build DELETE query
   */
  buildDelete(table) {
    if (!table) throw new Error('Table name is required');
    
    let query = `DELETE FROM ${table}`;
    
    if (this._where.length > 0) {
      query += ` WHERE ${this._where.join(' AND ')}`;
    }
    
    if (this._returning.length > 0) {
      query += ` RETURNING ${this._returning.join(', ')}`;
    }
    
    return { text: query, values: this._whereParams };
  }

  /**
   * Build soft DELETE (UPDATE deleted_at)
   */
  buildSoftDelete(table) {
    return this.buildUpdate(table, {
      deleted_at: new Date().toISOString(),
    });
  }

  /**
   * Build COUNT query
   */
  buildCount() {
    this._select = ['COUNT(*) as total'];
    this._orderBy = [];
    this._limit = null;
    this._offset = null;
    return this.buildSelect();
  }

  /**
   * Build paginated SELECT with total count in one query
   */
  buildPaginatedSelect() {
    return this.buildSelect();
  }
}

module.exports = QueryBuilder;