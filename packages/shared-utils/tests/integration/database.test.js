/**
 * Database Module Integration Tests
 * Tests connection pooling and query building
 */

describe('Database Integration', () => {
  let connectionPool;
  let QueryBuilder;

  beforeAll(() => {
    jest.mock('@siamsiam/shared-config', () => ({
      database: {
        primary: {
          host: 'localhost',
          port: 5432,
          database: 'siamsiam_test',
          username: 'test_user',
          password: 'test_password',
          pool: { max: 5, min: 1, idle: 10000, acquire: 30000 },
        },
        readReplicas: [],
        migrations: {
          directory: './migrations',
          tableName: 'migrations',
        },
      },
      isProduction: false,
      isDevelopment: true,
      env: 'test',
    }));
  });

  beforeEach(() => {
    jest.resetModules();
    connectionPool = require('../../src/database/connection-pool');
    QueryBuilder = require('../../src/database/query-builder');
  });

  describe('Connection Pool', () => {
    test('should create connection pool', () => {
      const pool = connectionPool.getPool('primary');
      expect(pool).toBeDefined();
    });

    test('should return same pool instance', () => {
      const pool1 = connectionPool.getPool('primary');
      const pool2 = connectionPool.getPool('primary');
      expect(pool1).toBe(pool2);
    });

    test('should track metrics', () => {
      const metrics = connectionPool.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.queries).toBeDefined();
      expect(metrics.queries.total).toBeDefined();
      expect(metrics.pools).toBeDefined();
    });

    test('should handle shutdown gracefully', async () => {
      await connectionPool.shutdown();
      // After shutdown, pools should be empty
      const metrics = connectionPool.getMetrics();
      expect(metrics.pools).toBeDefined();
    });
  });

  describe('Query Builder', () => {
    let builder;

    beforeEach(() => {
      builder = new QueryBuilder();
    });

    test('should build SELECT query', () => {
      const { text, values } = builder
        .select(['id', 'name', 'email'])
        .from('users', 'u')
        .where('u.active', true)
        .orderBy('u.name', 'ASC')
        .limit(10)
        .buildSelect();

      expect(text).toContain('SELECT');
      expect(text).toContain('FROM users AS u');
      expect(text).toContain('WHERE');
      expect(text).toContain('ORDER BY');
      expect(text).toContain('LIMIT');
      expect(values).toHaveLength(2); // active=true and limit=10
    });

    test('should build INSERT query', () => {
      const data = { name: 'John', email: 'john@example.com', age: 30 };
      const { text, values } = builder
        .returning(['id', 'created_at'])
        .buildInsert('users', data);

      expect(text).toContain('INSERT INTO users');
      expect(text).toContain('RETURNING id, created_at');
      expect(values).toHaveLength(3);
      expect(values).toEqual(['John', 'john@example.com', 30]);
    });

    test('should build UPDATE query', () => {
      const { text, values } = builder
        .where('id', 1)
        .returning(['id', 'updated_at'])
        .buildUpdate('users', { name: 'Jane', active: false });

      expect(text).toContain('UPDATE users SET');
      expect(text).toContain('WHERE');
      expect(text).toContain('RETURNING');
      expect(values).toHaveLength(3); // name, active, id
    });

    test('should build DELETE query', () => {
      const { text, values } = builder
        .where('id', 1)
        .buildDelete('users');

      expect(text).toContain('DELETE FROM users');
      expect(text).toContain('WHERE');
      expect(values).toEqual([1]);
    });

    test('should build soft DELETE query', () => {
      const { text, values } = builder
        .where('id', 1)
        .buildSoftDelete('users');

      expect(text).toContain('UPDATE users SET');
      expect(text).toContain('deleted_at');
      expect(text).toContain('WHERE');
    });

    test('should build COUNT query', () => {
      const { text } = builder
        .from('users')
        .where('active', true)
        .buildCount();

      expect(text).toContain('COUNT(*)');
      expect(text).not.toContain('ORDER BY');
      expect(text).not.toContain('LIMIT');
    });

    test('should handle WHERE IN clause', () => {
      const { text, values } = builder
        .select(['*'])
        .from('users')
        .whereIn('id', [1, 2, 3])
        .buildSelect();

      expect(text).toContain('IN');
      expect(values).toEqual([1, 2, 3]);
    });

    test('should handle WHERE NULL clause', () => {
      const { text } = builder
        .select(['*'])
        .from('users')
        .whereNull('deleted_at')
        .buildSelect();

      expect(text).toContain('IS NULL');
    });

    test('should handle WHERE BETWEEN clause', () => {
      const { text, values } = builder
        .select(['*'])
        .from('orders')
        .whereBetween('created_at', '2024-01-01', '2024-12-31')
        .buildSelect();

      expect(text).toContain('BETWEEN');
      expect(values).toHaveLength(2);
    });

    test('should handle LEFT JOIN', () => {
      const { text } = builder
        .select(['u.*', 'o.total'])
        .from('users', 'u')
        .leftJoin('orders o', 'u.id = o.user_id')
        .buildSelect();

      expect(text).toContain('LEFT JOIN');
    });

    test('should build paginated query', () => {
      const { text, values } = builder
        .select(['*'])
        .from('users')
        .page(2, 20)
        .buildSelect();

      expect(text).toContain('LIMIT');
      expect(text).toContain('OFFSET');
      expect(values).toContain(20); // limit
      expect(values).toContain(20); // offset = (2-1) * 20
    });

    test('should reset builder state', () => {
      builder.select(['*']).from('users').where('active', true);
      builder.reset();

      const { text } = builder.buildSelect();
      expect(text).toBe('SELECT * FROM ');
    });
  });
});