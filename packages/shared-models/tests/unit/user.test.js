/**
 * User Model Unit Tests
 */

// Mock database
jest.mock('@siamsiam/shared-utils', () => ({
  database: {
    connectionPool: {
      query: jest.fn(),
      transaction: jest.fn(),
    },
    queryBuilder: jest.fn(),
  },
  logging: {
    logger: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    },
  },
}));

describe('User Model', () => {
  let User;
  let mockQuery;

  beforeEach(() => {
    jest.resetModules();
    mockQuery = require('@siamsiam/shared-utils').database.connectionPool.query;
    User = require('../../src/user');
  });

  test('should have correct table name', () => {
    expect(User.tableName).toBe('users');
  });

  test('should define required fields', () => {
    expect(User.fields).toContain('id');
    expect(User.fields).toContain('email');
    expect(User.fields).toContain('phone');
    expect(User.fields).toContain('first_name');
    expect(User.fields).toContain('last_name');
  });

  test('should find user by email', async () => {
    const mockUser = { id: 'user_123', email: 'test@example.com', first_name: 'John' };
    mockQuery.mockResolvedValueOnce({ rows: [mockUser] });

    const user = await User.findByEmail('test@example.com');

    expect(user).toEqual(mockUser);
    expect(mockQuery).toHaveBeenCalled();
  });

  test('should return null when user not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const user = await User.findByEmail('nonexistent@example.com');

    expect(user).toBeNull();
  });

  test('should create user with timestamps', async () => {
    const userData = {
      email: 'new@example.com',
      phone: '+263771234567',
      first_name: 'New',
      last_name: 'User',
    };

    const createdUser = { id: 'user_new', ...userData, created_at: new Date().toISOString() };
    mockQuery.mockResolvedValueOnce({ rows: [createdUser] });

    const result = await User.create(userData);

    expect(result).toEqual(createdUser);
    expect(mockQuery).toHaveBeenCalled();
  });

  test('should record successful login', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'user_123' }] });

    await User.recordLogin('user_123', '192.168.1.1');

    expect(mockQuery).toHaveBeenCalled();
  });

  test('should lock account after 5 failed attempts', async () => {
    const user = {
      id: 'user_123',
      failed_login_attempts: 4,
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [user] }) // findById
      .mockResolvedValueOnce({ rows: [{ ...user, failed_login_attempts: 5, locked_until: new Date().toISOString() }] }); // update

    const result = await User.recordFailedLogin('user_123');

    expect(result.failed_login_attempts).toBe(5);
  });

  test('should encrypt sensitive fields', () => {
    expect(User.encryptedFields).toContain('national_id');
    expect(User.encryptedFields).toContain('date_of_birth');
  });

  test('should define KYC levels', () => {
    expect(User.kycLevels[0]).toBe('unverified');
    expect(User.kycLevels[2]).toBe('verified');
  });
});