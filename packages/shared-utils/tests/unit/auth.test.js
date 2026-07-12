const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

/**
 * Auth Module Unit Tests
 * Tests JWT token generation/validation and PIN authentication
 */

describe('Auth Utilities', () => {
  // Mock config before requiring modules
  jest.mock('@siamsiam/shared-config', () => ({
    jwt: {
      accessToken: {
        secret: 'test_secret_key_for_testing',
        expiresIn: '15m',
        algorithm: 'HS256',
      },
      refreshToken: {
        secret: 'test_refresh_secret_for_testing',
        expiresIn: '7d',
        algorithm: 'HS256',
      },
      issuer: 'siamsiam-test',
      audience: 'siamsiam-test-clients',
    },
    encryption: {
      key: 'test-32-char-encryption-key!!',
    },
    isDevelopment: true,
    isProduction: false,
  }));

  describe('JWT Service', () => {
    let jwtService;

    beforeEach(() => {
      // Clear require cache to get fresh mock
      jest.resetModules();
      jwtService = require('../../src/auth/jwt-service');
    });

    test('should generate access token', () => {
      const payload = { userId: 'user_123', role: 'user' };
      const token = jwtService.generateAccessToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    test('should generate refresh token', () => {
      const payload = { userId: 'user_123' };
      const token = jwtService.generateRefreshToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    test('should verify valid token', () => {
      const payload = { userId: 'user_123', role: 'user' };
      const token = jwtService.generateAccessToken(payload);
      const decoded = jwtService.verifyAccessToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe('user_123');
      expect(decoded.role).toBe('user');
    });

    test('should reject invalid token', () => {
      const invalidToken = 'invalid.token.here';
      const result = jwtService.verifyAccessToken(invalidToken);

      expect(result).toBeNull();
    });

    test('should reject expired token', () => {
      const payload = { userId: 'user_123' };
      // Create token that expires immediately
      const token = jwt.sign(payload, 'test_secret_key_for_testing', { expiresIn: '0s' });
      
      // Wait a moment for token to expire
      const result = jwtService.verifyAccessToken(token);
      expect(result).toBeNull();
    });

    test('should reject token with wrong secret', () => {
      const payload = { userId: 'user_123' };
      const token = jwt.sign(payload, 'wrong_secret', { expiresIn: '1h' });
      
      const result = jwtService.verifyAccessToken(token);
      expect(result).toBeNull();
    });

    test('should decode token without verification', () => {
      const payload = { userId: 'user_456', role: 'admin' };
      const token = jwtService.generateAccessToken(payload);
      const decoded = jwtService.decodeToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe('user_456');
      expect(decoded.role).toBe('admin');
    });
  });

  describe('PIN Authentication', () => {
    let pinAuth;

    beforeEach(() => {
      jest.resetModules();
      pinAuth = require('../../src/auth/pin-auth');
    });

    test('should hash PIN', async () => {
      const pin = '1234';
      const hash = await pinAuth.hashPin(pin);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe(pin);
      expect(hash.length).toBeGreaterThan(20);
    });

    test('should verify correct PIN', async () => {
      const pin = '567890';
      const hash = await pinAuth.hashPin(pin);
      const isValid = await pinAuth.verifyPin(pin, hash);

      expect(isValid).toBe(true);
    });

    test('should reject incorrect PIN', async () => {
      const pin = '123456';
      const wrongPin = '654321';
      const hash = await pinAuth.hashPin(pin);
      const isValid = await pinAuth.verifyPin(wrongPin, hash);

      expect(isValid).toBe(false);
    });

    test('should enforce PIN length requirements', () => {
      expect(() => pinAuth.validatePinFormat('123')).toThrow();
      expect(() => pinAuth.validatePinFormat('12345678901')).toThrow();
      expect(() => pinAuth.validatePinFormat('123456')).not.toThrow();
    });

    test('should reject sequential PINs', () => {
      expect(pinAuth.isSecurePin('123456')).toBe(false);
      expect(pinAuth.isSecurePin('654321')).toBe(false);
      expect(pinAuth.isSecurePin('472918')).toBe(true);
    });

    test('should reject repeating PINs', () => {
      expect(pinAuth.isSecurePin('111111')).toBe(false);
      expect(pinAuth.isSecurePin('000000')).toBe(false);
      expect(pinAuth.isSecurePin('472918')).toBe(true);
    });

    test('should handle empty PIN', async () => {
      const hash = await pinAuth.hashPin('');
      expect(hash).toBeNull();
    });

    test('should handle null PIN verification', async () => {
      const isValid = await pinAuth.verifyPin(null, 'some_hash');
      expect(isValid).toBe(false);
    });
  });
});