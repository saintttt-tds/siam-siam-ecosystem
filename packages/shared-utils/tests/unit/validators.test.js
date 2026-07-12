/**
 * Validators Module Unit Tests
 * Tests phone, email, currency, and national ID validation
 */

describe('Validators', () => {
  describe('Phone Validator', () => {
    let phoneValidator;

    beforeEach(() => {
      jest.resetModules();
      phoneValidator = require('../../src/validators/phone-validator');
    });

    test('should validate Zimbabwe phone numbers', () => {
      const validNumbers = [
        '+263771234567',
        '0771234567',
        '771234567',
        '263771234567',
      ];

      for (const number of validNumbers) {
        const result = phoneValidator.validate(number, 'ZW');
        expect(result.valid).toBe(true);
        expect(result.e164).toBe('+263771234567');
      }
    });

    test('should reject invalid phone numbers', () => {
      const invalidNumbers = [
        '12345',
        'abcdefghij',
        '+26377123', // Too short
        '+26377123456789', // Too long
        '+9991234567', // Invalid country
      ];

      for (const number of invalidNumbers) {
        const result = phoneValidator.validate(number, 'ZW');
        expect(result.valid).toBe(false);
      }
    });

    test('should identify mobile networks', () => {
      const econetResult = phoneValidator.validate('0771234567', 'ZW');
      expect(econetResult.network).toBe('Econet');

      const netoneResult = phoneValidator.validate('0711234567', 'ZW');
      expect(netoneResult.network).toBe('NetOne');
    });

    test('should format phone numbers', () => {
      const formatted = phoneValidator.format('0771234567', 'ZW');
      expect(formatted).toBeDefined();
      expect(formatted).not.toBe('0771234567'); // Formatted differently
    });

    test('should mask phone numbers', () => {
      const masked = phoneValidator.mask('+263771234567', 'ZW');
      expect(masked).toContain('***');
      expect(masked).toContain('+263');
    });

    test('should compare phone numbers', () => {
      expect(phoneValidator.areSame('0771234567', '+263771234567', 'ZW')).toBe(true);
      expect(phoneValidator.areSame('0771234567', '0789876543', 'ZW')).toBe(false);
    });

    test('should validate South African numbers', () => {
      const result = phoneValidator.validate('0821234567', 'ZA');
      expect(result.valid).toBe(true);
      expect(result.countryCode).toBe('ZA');
    });

    test('should validate Kenyan numbers', () => {
      const result = phoneValidator.validate('0712345678', 'KE');
      expect(result.valid).toBe(true);
      expect(result.countryCode).toBe('KE');
    });
  });

  describe('Email Validator', () => {
    let emailValidator;

    beforeEach(() => {
      jest.resetModules();
      emailValidator = require('../../src/validators/email-validator');
    });

    test('should validate correct email addresses', () => {
      const validEmails = [
        'user@example.com',
        'john.doe@company.co.zw',
        'user+tag@domain.com',
        'valid_email@sub.domain.org',
      ];

      for (const email of validEmails) {
        const result = emailValidator.isValidFormat(email);
        expect(result).toBe(true);
      }
    });

    test('should reject invalid email addresses', () => {
      const invalidEmails = [
        'notanemail',
        '@nodomain.com',
        'noat.com',
        'spaces in@email.com',
        'double..dots@domain.com',
        '.startswithdot@domain.com',
        '',
      ];

      for (const email of invalidEmails) {
        const result = emailValidator.isValidFormat(email);
        expect(result).toBe(false);
      }
    });

    test('should detect disposable emails', () => {
      expect(emailValidator.isDisposable('user@mailinator.com')).toBe(true);
      expect(emailValidator.isDisposable('user@guerrillamail.com')).toBe(true);
      expect(emailValidator.isDisposable('user@gmail.com')).toBe(false);
    });

    test('should normalize Gmail addresses', () => {
      const normalized = emailValidator.normalize('John.Doe@Gmail.com');
      expect(normalized).toBe('johndoe@gmail.com');
    });

    test('should mask email addresses', () => {
      const masked = emailValidator.mask('john.doe@example.com');
      expect(masked).toContain('***');
      expect(masked).toContain('@');
      expect(masked).not.toBe('john.doe@example.com');
    });
  });

  describe('Currency Validator', () => {
    let currencyValidator;

    beforeEach(() => {
      jest.resetModules();
      currencyValidator = require('../../src/validators/currency-validator');
    });

    test('should validate currency codes', () => {
      expect(currencyValidator.isValidCode('USD')).toBe(true);
      expect(currencyValidator.isValidCode('ZWL')).toBe(true);
      expect(currencyValidator.isValidCode('ZAR')).toBe(true);
      expect(currencyValidator.isValidCode('XYZ')).toBe(false);
      expect(currencyValidator.isValidCode('')).toBe(false);
    });

    test('should validate amounts', () => {
      expect(currencyValidator.validate(100, 'USD').valid).toBe(true);
      expect(currencyValidator.validate(0.01, 'USD').valid).toBe(true);
      expect(currencyValidator.validate(-50, 'USD').valid).toBe(false);
      expect(currencyValidator.validate('invalid', 'USD').valid).toBe(false);
    });

    test('should format currency amounts', () => {
      const formatted = currencyValidator.format(1000.50, 'USD');
      expect(formatted).toContain('$');
      expect(formatted).toContain('1,000.50');
    });

    test('should format Zimbabwe Dollar', () => {
      const formatted = currencyValidator.format(5000, 'ZWL');
      expect(formatted).toContain('Z$');
    });

    test('should round to currency decimal places', () => {
      const rounded = currencyValidator.round(10.999, 'USD');
      expect(rounded).toBe(11.00);
    });

    test('should convert between currencies', () => {
      const result = currencyValidator.convert(100, 'USD', 'ZAR');
      expect(result.from).toBe('USD');
      expect(result.to).toBe('ZAR');
      expect(result.amount).toBeGreaterThan(100); // USD to ZAR
    });

    test('should parse amount strings', () => {
      expect(currencyValidator.parse('$1,234.56', 'USD')).toBe(1234.56);
      expect(currencyValidator.parse('Z$5,000', 'ZWL')).toBe(5000);
    });
  });

  describe('National ID Validator', () => {
    let nationalIdValidator;

    beforeEach(() => {
      jest.resetModules();
      nationalIdValidator = require('../../src/validators/national-id-validator');
    });

    test('should validate Zimbabwe ID format', () => {
      const result = nationalIdValidator.validate('00-1234567X00', 'ZW');
      expect(result.valid).toBe(true);
      expect(result.country).toBe('ZW');
      expect(result.idType).toBe('National ID Number');
    });

    test('should validate South African ID format', () => {
      const result = nationalIdValidator.validate('9001015001087', 'ZA');
      expect(result.valid).toBe(true);
      expect(result.country).toBe('ZA');
    });

    test('should reject invalid ID formats', () => {
      expect(nationalIdValidator.validate('123', 'ZW').valid).toBe(false);
      expect(nationalIdValidator.validate('abcdefghijk', 'ZW').valid).toBe(false);
    });

    test('should extract metadata from South African ID', () => {
      const info = nationalIdValidator.extractInfo('9001015001087', 'ZA');
      expect(info).toBeDefined();
      expect(info.gender).toBeDefined();
      expect(info.citizenship).toBeDefined();
    });

    test('should mask ID numbers', () => {
      const masked = nationalIdValidator.mask('00-1234567X00', 'ZW');
      expect(masked).toContain('***');
      expect(masked.length).toBeLessThan('00-1234567X00'.length);
    });
  });
});