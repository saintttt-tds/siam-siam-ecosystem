/**
 * International Phone Number Validator
 * 
 * Validates and formats phone numbers with focus on African countries.
 * Supports E.164 format, local formats, and mobile network identification.
 * 
 * FORMATS SUPPORTED:
 * - International: +263771234567
 * - Local with 0: 0771234567
 * - Local without 0: 771234567
 * - With country code without +: 263771234567
 * 
 * @example
 *   const phone = require('@siamsiam/shared-utils').validators.phoneValidator;
 *   const result = phone.validate('0771234567', 'ZW');
 *   if (result.valid) { /* use result.e164 * / }
 */

class PhoneValidator {
  constructor() {
    // Country configurations
    this.countries = {
      ZW: {
        name: 'Zimbabwe',
        code: '263',
        length: 9, // After country code
        prefixes: ['71', '73', '77', '78'], // Mobile prefixes
        landlinePrefixes: ['24', '25', '26', '27', '28', '29'],
        networks: {
          '77': 'Econet',
          '78': 'Econet',
          '71': 'NetOne',
          '73': 'Telecel',
        },
        format: 'xxx xxx xxxx',
      },
      ZA: {
        name: 'South Africa',
        code: '27',
        length: 9,
        prefixes: ['60', '61', '62', '63', '64', '65', '66', '67', '68', 
                   '70', '71', '72', '73', '74', '75', '76', '77', '78', '79',
                   '81', '82', '83', '84'],
        networks: {
          '83': 'MTN', '73': 'MTN', '78': 'MTN',
          '82': 'Vodacom', '72': 'Vodacom', '76': 'Vodacom', '79': 'Vodacom',
          '81': 'Cell C', '74': 'Cell C', '84': 'Cell C',
          '60': 'Telkom', '61': 'Telkom',
        },
        format: 'xxx xxx xxxx',
      },
      KE: {
        name: 'Kenya',
        code: '254',
        length: 9,
        prefixes: ['70', '71', '72', '74', '75', '76', '77', '78', '79'],
        networks: {
          '70': 'Safaricom', '71': 'Safaricom', '72': 'Safaricom',
          '79': 'Safaricom',
          '73': 'Airtel', '75': 'Airtel', '78': 'Airtel',
          '74': 'Telkom',
          '76': 'Faiba',
          '77': 'Equitel',
        },
      },
      NG: {
        name: 'Nigeria',
        code: '234',
        length: 10,
        prefixes: ['70', '80', '81', '90', '91'],
        networks: {
          '80': 'MTN', '81': 'MTN', '90': 'MTN',
          '70': 'Airtel', '90': 'Airtel',
          '80': 'Glo', '81': 'Glo',
          '70': '9mobile', '80': '9mobile', '81': '9mobile',
        },
      },
      BW: {
        name: 'Botswana',
        code: '267',
        length: 8,
        prefixes: ['71', '72', '73', '74', '75', '76', '77'],
        networks: {
          '71': 'Mascom', '72': 'Mascom',
          '73': 'Orange', '74': 'Orange',
          '75': 'BTC Mobile', '76': 'BTC Mobile',
          '77': 'Mascom',
        },
      },
      ZM: {
        name: 'Zambia',
        code: '260',
        length: 9,
        prefixes: ['95', '96', '97', '76', '77'],
        networks: {
          '95': 'Airtel', '96': 'MTN',
          '97': 'Zamtel', '76': 'MTN',
          '77': 'Airtel',
        },
      },
      TZ: {
        name: 'Tanzania',
        code: '255',
        length: 9,
        prefixes: ['62', '65', '67', '68', '69', '71', '73', '74', '75', '76', '77', '78', '79'],
        networks: {
          '62': 'Halotel', '65': 'Tigo', '67': 'Tigo',
          '68': 'Airtel', '69': 'Airtel',
          '71': 'Vodacom', '74': 'Vodacom', '75': 'Vodacom', '76': 'Vodacom',
          '73': 'TTCL', '77': 'Zantel', '78': 'Airtel', '79': 'Vodacom',
        },
      },
    };
  }

  /**
   * Validate and normalize a phone number
   * @param {string} phone - Phone number to validate
   * @param {string} countryCode - ISO country code (ZW, ZA, etc.)
   * @returns {Object} Validation result
   */
  validate(phone, countryCode = 'ZW') {
    if (!phone) {
      return { valid: false, error: 'Phone number is required' };
    }

    const country = this.countries[countryCode];
    if (!country) {
      return { valid: false, error: `Unsupported country: ${countryCode}` };
    }

    // Clean the number
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
    
    // Extract digits only
    const digits = cleaned.replace(/\D/g, '');

    if (digits.length === 0) {
      return { valid: false, error: 'No digits found in phone number' };
    }

    // Determine format and normalize
    let nationalNumber;
    
    if (cleaned.startsWith('+')) {
      // International format: +263771234567
      const expectedPrefix = `+${country.code}`;
      if (!cleaned.startsWith(expectedPrefix)) {
        return { 
          valid: false, 
          error: `Expected country code +${country.code} for ${country.name}`,
        };
      }
      nationalNumber = digits.slice(country.code.length);
    } else if (digits.startsWith(country.code)) {
      // Without +: 263771234567
      nationalNumber = digits.slice(country.code.length);
    } else if (digits.startsWith('0')) {
      // Local with 0: 0771234567
      nationalNumber = digits.slice(1);
    } else {
      // Local without 0: 771234567
      nationalNumber = digits;
    }

    // Validate length
    if (nationalNumber.length !== country.length) {
      return {
        valid: false,
        error: `Phone number must be ${country.length} digits after country code, got ${nationalNumber.length}`,
        expectedLength: country.length,
        actualLength: nationalNumber.length,
      };
    }

    // Validate prefix (mobile vs landline)
    const prefix = nationalNumber.substring(0, 2);
    const isMobile = country.prefixes.includes(prefix);
    const isLandline = country.landlinePrefixes?.includes(prefix);

    if (!isMobile && !isLandline) {
      return {
        valid: false,
        error: `Invalid phone prefix: ${prefix}`,
        validPrefixes: country.prefixes,
      };
    }

    // Identify network
    const network = country.networks?.[prefix] || 'Unknown';

    // Format to E.164
    const e164 = `+${country.code}${nationalNumber}`;
    
    // Format for display
    const localFormat = `0${nationalNumber}`;
    const displayFormat = this._formatNumber(nationalNumber, country.format);

    return {
      valid: true,
      e164,
      national: nationalNumber,
      local: localFormat,
      display: displayFormat,
      country: countryCode,
      countryName: country.name,
      type: isMobile ? 'mobile' : 'landline',
      network,
      prefix,
    };
  }

  /**
   * Format a phone number for display
   */
  format(phone, countryCode = 'ZW') {
    const result = this.validate(phone, countryCode);
    return result.valid ? result.display : phone;
  }

  /**
   * Normalize to E.164 format
   */
  toE164(phone, countryCode = 'ZW') {
    const result = this.validate(phone, countryCode);
    return result.valid ? result.e164 : null;
  }

  /**
   * Check if number is from a specific network
   */
  isNetwork(phone, network, countryCode = 'ZW') {
    const result = this.validate(phone, countryCode);
    return result.valid && result.network.toLowerCase() === network.toLowerCase();
  }

  /**
   * Check if number is mobile
   */
  isMobile(phone, countryCode = 'ZW') {
    const result = this.validate(phone, countryCode);
    return result.valid && result.type === 'mobile';
  }

  /**
   * Compare two numbers (are they the same?)
   */
  areSame(phone1, phone2, countryCode = 'ZW') {
    const result1 = this.toE164(phone1, countryCode);
    const result2 = this.toE164(phone2, countryCode);
    return result1 !== null && result1 === result2;
  }

  /**
   * Mask phone number for display
   */
  mask(phone, countryCode = 'ZW') {
    const result = this.validate(phone, countryCode);
    if (!result.valid) return '***';
    
    const national = result.national;
    const country = this.countries[countryCode];
    return `+${country.code} ${national.substring(0, 2)} *** ${national.slice(-3)}`;
  }

  // ==================== PRIVATE ====================

  _formatNumber(number, format) {
    if (!format) return number;
    
    let formatted = '';
    let numIndex = 0;
    
    for (const char of format) {
      if (char === 'x' && numIndex < number.length) {
        formatted += number[numIndex];
        numIndex++;
      } else if (char === ' ') {
        formatted += ' ';
      }
    }
    
    return formatted.trim();
  }
}

module.exports = new PhoneValidator();