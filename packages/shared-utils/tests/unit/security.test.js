const crypto = require('crypto');

/**
 * Security Module Unit Tests
 * Tests encryption, hashing, and security utilities
 */

describe('Security Utilities', () => {
  jest.mock('@siamsiam/shared-config', () => ({
    encryption: {
      key: 'test-32-character-encryption-key',
      algorithm: 'aes-256-gcm',
      ivLength: 16,
      tagLength: 16,
    },
    isDevelopment: true,
    isProduction: false,
    monitoring: {
      alerting: {
        slack: null,
        email: null,
        pagerDuty: null,
      },
    },
  }));

  describe('Encryption', () => {
    let encryption;

    beforeEach(() => {
      jest.resetModules();
      encryption = require('../../src/security/encryption');
    });

    test('should encrypt data', () => {
      const plainText = 'sensitive data for encryption';
      const encrypted = encryption.encrypt(plainText);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(plainText);
      expect(encrypted.length).toBeGreaterThan(plainText.length);
    });

    test('should decrypt encrypted data', () => {
      const plainText = 'sensitive data for encryption';
      const encrypted = encryption.encrypt(plainText);
      const decrypted = encryption.decrypt(encrypted);

      expect(decrypted).toBe(plainText);
    });

    test('should produce different ciphertext for same plaintext', () => {
      const plainText = 'test data';
      const encrypted1 = encryption.encrypt(plainText);
      const encrypted2 = encryption.encrypt(plainText);

      expect(encrypted1).not.toBe(encrypted2); // Different IVs
    });

    test('should encrypt objects as JSON', () => {
      const obj = { name: 'John', email: 'john@example.com', age: 30 };
      const encrypted = encryption.encrypt(obj);
      const decrypted = encryption.decrypt(encrypted, true);

      expect(decrypted).toEqual(obj);
    });

    test('should handle null input', () => {
      expect(encryption.encrypt(null)).toBeNull();
      expect(encryption.decrypt(null)).toBeNull();
    });

    test('should handle empty string', () => {
      const encrypted = encryption.encrypt('');
      const decrypted = encryption.decrypt(encrypted);
      expect(decrypted).toBe('');
    });

    test('should generate secure tokens', () => {
      const token1 = encryption.generateToken(32);
      const token2 = encryption.generateToken(32);

      expect(token1).toBeDefined();
      expect(token1.length).toBe(64); // 32 bytes = 64 hex chars
      expect(token1).not.toBe(token2);
    });

    test('should generate OTPs', () => {
      const otp = encryption.generateOTP(6);
      expect(otp).toMatch(/^\d{6}$/);
    });

    test('should hash passwords securely', () => {
      const password = 'securePassword123';
      const hash = encryption.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).toContain('pbkdf2:');
      expect(hash).not.toBe(password);
    });

    test('should verify correct password', () => {
      const password = 'securePassword123';
      const hash = encryption.hashPassword(password);
      const isValid = encryption.verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    test('should reject incorrect password', () => {
      const password = 'securePassword123';
      const hash = encryption.hashPassword(password);
      const isValid = encryption.verifyPassword('wrongPassword', hash);

      expect(isValid).toBe(false);
    });

    test('should encrypt specific object fields', () => {
      const data = {
        name: 'John',
        email: 'john@example.com',
        phone: '+263771234567',
        ssn: '123-45-6789',
      };

      const encrypted = encryption.encryptFields(data, ['email', 'phone', 'ssn']);

      expect(encrypted.name).toBe('John'); // Not encrypted
      expect(encrypted.email).not.toBe('john@example.com'); // Encrypted
      expect(encrypted.phone).not.toBe('+263771234567'); // Encrypted
      expect(encrypted.ssn).not.toBe('123-45-6789'); // Encrypted
    });

    test('should decrypt specific object fields', () => {
      const data = {
        name: 'John',
        email: 'john@example.com',
        phone: '+263771234567',
      };

      const encrypted = encryption.encryptFields(data, ['email', 'phone']);
      const decrypted = encryption.decryptFields(encrypted, ['email', 'phone']);

      expect(decrypted.name).toBe('John');
      expect(decrypted.email).toBe('john@example.com');
      expect(decrypted.phone).toBe('+263771234567');
    });

    test('should mask data for display', () => {
      expect(encryption.mask('1234567890', 3, 3)).toBe('123****890');
      expect(encryption.mask('ab', 1, 1)).toBe('**');
    });

    test('should mask email addresses', () => {
      const masked = encryption.maskEmail('john.doe@example.com');
      expect(masked).toContain('***');
      expect(masked).toContain('@');
      expect(masked).not.toBe('john.doe@example.com');
    });

    test('should mask phone numbers', () => {
      const masked = encryption.maskPhone('+263771234567');
      expect(masked).toContain('***');
      expect(masked).toContain('4567');
    });

    test('should mask card numbers (PCI compliant)', () => {
      const masked = encryption.maskCardNumber('4111111111111111');
      expect(masked).toBe('****1111');
    });

    test('should fail decryption with corrupted data', () => {
      const encrypted = encryption.encrypt('test data');
      const corrupted = encrypted.substring(0, encrypted.length - 5) + 'xxxxx';
      
      expect(() => encryption.decrypt(corrupted)).toThrow();
    });
  });

  describe('SQL Injection Prevention', () => {
    let sqlPrevention;

    beforeEach(() => {
      jest.resetModules();
      sqlPrevention = require('../../src/security/sql-injection-prevention');
    });

    test('should detect SQL injection patterns', () => {
      const patterns = [
        "' OR '1'='1",
        "1; DROP TABLE users",
        "' UNION SELECT * FROM users--",
        "1' AND 1=1--",
        "admin'--",
      ];

      for (const pattern of patterns) {
        expect(sqlPrevention.detectInjection(pattern)).toBe(true);
      }
    });

    test('should allow safe input', () => {
      const safeInputs = [
        'john.doe@example.com',
        'John Doe',
        '123 Main Street',
        'normal text input',
      ];

      for (const input of safeInputs) {
        expect(sqlPrevention.detectInjection(input)).toBe(false);
      }
    });

    test('should sanitize dangerous characters', () => {
      const input = "O'Brien";
      const sanitized = sqlPrevention.sanitize(input);
      expect(sanitized).not.toContain("'");
      expect(sanitized).toContain("O");
    });

    test('should validate SQL identifiers', () => {
      expect(() => sqlPrevention.validateIdentifier('valid_name')).not.toThrow();
      expect(() => sqlPrevention.validateIdentifier('DROP TABLE')).toThrow();
      expect(() => sqlPrevention.validateIdentifier('test; DROP')).toThrow();
    });

    test('should detect parameterized queries', () => {
      expect(sqlPrevention.isParameterizedQuery('SELECT * FROM users WHERE id = $1')).toBe(true);
      expect(sqlPrevention.isParameterizedQuery('SELECT * FROM users WHERE id = :id')).toBe(true);
      expect(sqlPrevention.isParameterizedQuery("SELECT * FROM users WHERE id = '123'")).toBe(false);
    });
  });
});