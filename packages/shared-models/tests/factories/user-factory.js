/**
 * User Model Factory
 * 
 * Generates test user data for unit and integration tests.
 */

const crypto = require('crypto');

class UserFactory {
  /**
   * Create a valid user object
   * @param {Object} overrides - Fields to override
   * @returns {Object} User object
   */
  static build(overrides = {}) {
    return {
      id: `user_${crypto.randomBytes(4).toString('hex')}`,
      email: `test_${Date.now()}@example.com`,
      phone: `+26377${Math.floor(1000000 + Math.random() * 9000000)}`,
      password_hash: '$2b$12$LJ3m4ys3Lk0TSwHCmxqkXOabc1234567890defghijk',
      first_name: 'Test',
      last_name: 'User',
      date_of_birth: '1990-01-01',
      national_id: '00-1234567X00',
      kyc_status: 'verified',
      kyc_level: 2,
      is_active: true,
      email_verified: true,
      phone_verified: true,
      last_login_at: null,
      last_login_ip: null,
      failed_login_attempts: 0,
      locked_until: null,
      preferences: {},
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  /**
   * Create an admin user
   */
  static buildAdmin(overrides = {}) {
    return this.build({
      id: `admin_${crypto.randomBytes(4).toString('hex')}`,
      email: `admin_${Date.now()}@siamsiam.com`,
      first_name: 'Admin',
      last_name: 'User',
      ...overrides,
    });
  }

  /**
   * Create a user with KYC level 0 (unverified)
   */
  static buildUnverified(overrides = {}) {
    return this.build({
      kyc_status: 'unverified',
      kyc_level: 0,
      email_verified: false,
      phone_verified: false,
      ...overrides,
    });
  }

  /**
   * Create a locked user
   */
  static buildLocked(overrides = {}) {
    return this.build({
      failed_login_attempts: 5,
      locked_until: new Date(Date.now() + 30 * 60000).toISOString(),
      ...overrides,
    });
  }
}

module.exports = UserFactory;