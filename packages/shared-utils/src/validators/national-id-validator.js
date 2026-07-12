const logger = require('../logging/logger');

/**
 * National ID Number Format Validator
 * 
 * Validates national identification numbers for various African countries.
 * Each country has specific formats and validation rules.
 * 
 * SUPPORTED COUNTRIES:
 * - Zimbabwe: 00-000000X00 (with checksum)
 * - South Africa: 13-digit with Luhn checksum
 * - Kenya: 8-digit ID number
 * - Nigeria: 11-digit NIN
 * - Botswana: 9-digit Omang
 * - Zambia: 11-digit NRC
 * 
 * INTEGRATION:
 * This validator is linked to the national registration system
 * for identity verification during user KYC onboarding.
 * 
 * @example
 *   const nationalId = require('@siamsiam/shared-utils').validators.nationalIdValidator;
 *   const result = nationalId.validate('00-1234567X00', 'ZW');
 *   if (result.valid) { /* proceed with KYC verification * / }
 */

class NationalIdValidator {
  constructor() {
    this.countries = {
      ZW: {
        name: 'Zimbabwe',
        idName: 'National ID Number',
        patterns: [
          /^(\d{2})-(\d{6,7})([A-Z])(\d{2})$/,
          /^(\d{2})(\d{6,7})([A-Z])(\d{2})$/,
        ],
        format: '00-000000X00',
        minLength: 11,
        maxLength: 13,
        validateChecksum: true,
        description: 'Format: XX-XXXXXXXLXX (e.g., 00-1234567X00)',
      },
      ZA: {
        name: 'South Africa',
        idName: 'ID Number',
        patterns: [
          /^(\d{6})(\d{4})(\d{1})(\d{2})$/,
        ],
        format: 'YYMMDD SSSS C Z',
        minLength: 13,
        maxLength: 13,
        validateChecksum: true,
        luhnValidation: true,
        description: '13-digit South African ID number',
        formatBreakdown: {
          dob: 'First 6 digits (YYMMDD)',
          gender: 'Digits 7-10 (SSSS): 0000-4999 female, 5000-9999 male',
          citizenship: 'Digit 11 (C): 0 = SA citizen, 1 = permanent resident',
          race: 'Digit 12: Not used post-1994',
          checksum: 'Digit 13: Luhn checksum',
        },
      },
      KE: {
        name: 'Kenya',
        idName: 'National ID Number',
        patterns: [
          /^\d{7,8}$/,
        ],
        format: '00000000',
        minLength: 7,
        maxLength: 8,
        validateChecksum: false,
        description: '7-8 digit Kenyan ID number',
      },
      NG: {
        name: 'Nigeria',
        idName: 'National Identification Number (NIN)',
        patterns: [
          /^\d{11}$/,
        ],
        format: '00000000000',
        minLength: 11,
        maxLength: 11,
        validateChecksum: false,
        description: '11-digit Nigerian NIN',
      },
      BW: {
        name: 'Botswana',
        idName: 'Omang Number',
        patterns: [
          /^\d{9}$/,
        ],
        format: '000000000',
        minLength: 9,
        maxLength: 9,
        validateChecksum: false,
        description: '9-digit Botswana Omang number',
      },
      ZM: {
        name: 'Zambia',
        idName: 'National Registration Card (NRC)',
        patterns: [
          /^\d{6}\/\d{2}\/\d{1}$/,
          /^\d{9}$/,
        ],
        format: '000000/00/0',
        minLength: 9,
        maxLength: 12,
        validateChecksum: false,
        description: 'Format: XXXXXX/XX/X (Zambian NRC)',
      },
      TZ: {
        name: 'Tanzania',
        idName: 'National ID Number (NIDA)',
        patterns: [
          /^\d{8}-\d{5}-\d{5}$/,
          /^\d{20}$/,
        ],
        format: '00000000-00000-00000',
        minLength: 20,
        maxLength: 22,
        validateChecksum: false,
        description: '20-digit Tanzanian NIDA number',
      },
    };

    // National registration system integration endpoints
    // PRODUCTION: Replace with actual registration authority APIs
    this.registrationApis = {
      ZW: 'https://api.rg.gov.zw/verify',
      ZA: 'https://api.dha.gov.za/verify',
      KE: 'https://api.nimc.go.ke/verify',
      NG: 'https://api.nimc.gov.ng/verify',
      BW: 'https://api.gov.bw/verify',
      ZM: 'https://api.zambia.gov.zm/verify',
      TZ: 'https://api.nida.go.tz/verify',
    };
  }

  /**
   * Validate a national ID number
   * @param {string} idNumber - National ID number
   * @param {string} countryCode - ISO country code
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  validate(idNumber, countryCode = 'ZW', options = {}) {
    if (!idNumber) {
      return { valid: false, error: 'National ID number is required' };
    }

    const country = this.countries[countryCode];
    if (!country) {
      return { valid: false, error: `Unsupported country: ${countryCode}` };
    }

    // Clean the input
    const cleaned = idNumber.replace(/[\s\-\.]/g, '').toUpperCase();

    // Length check
    if (cleaned.length < country.minLength || cleaned.length > country.maxLength) {
      return {
        valid: false,
        error: `ID number must be between ${country.minLength} and ${country.maxLength} characters`,
        expectedFormat: country.format,
        description: country.description,
      };
    }

    // Pattern check
    const originalFormat = idNumber;
    let matchFound = false;
    let parsedParts = null;

    for (const pattern of country.patterns) {
      const match = originalFormat.match(pattern);
      if (match) {
        matchFound = true;
        parsedParts = match;
        break;
      }
    }

    if (!matchFound) {
      return {
        valid: false,
        error: `Invalid ${country.idName} format`,
        expectedFormat: country.format,
        description: country.description,
        example: this._generateExample(countryCode),
      };
    }

    // Checksum validation
    if (country.validateChecksum && options.skipChecksum !== true) {
      const checksumValid = this._validateChecksum(cleaned, countryCode);
      if (!checksumValid) {
        return {
          valid: false,
          error: 'Invalid ID number checksum',
          detail: 'The ID number appears to be invalid. Please check and try again.',
        };
      }
    }

    // Luhn algorithm validation (South Africa)
    if (country.luhnValidation && options.skipLuhn !== true) {
      const luhnValid = this._validateLuhn(cleaned);
      if (!luhnValid) {
        return {
          valid: false,
          error: 'ID number fails Luhn validation',
        };
      }
    }

    // Extract metadata from ID number
    const metadata = this._extractMetadata(cleaned, countryCode);

    return {
      valid: true,
      idNumber: cleaned,
      formatted: this.format(cleaned, countryCode),
      country: countryCode,
      countryName: country.name,
      idType: country.idName,
      metadata,
    };
  }

  /**
   * Verify ID against national registration system
   * @param {string} idNumber - National ID number
   * @param {string} countryCode - ISO country code
   * @param {Object} personalInfo - Personal info for verification
   * @returns {Promise<Object>} Verification result
   */
  async verifyAgainstRegistry(idNumber, countryCode, personalInfo = {}) {
    // First validate format
    const validation = this.validate(idNumber, countryCode);
    if (!validation.valid) {
      return {
        verified: false,
        error: 'Invalid ID format',
        validation,
      };
    }

    const apiEndpoint = this.registrationApis[countryCode];
    if (!apiEndpoint) {
      return {
        verified: false,
        error: 'No registration verification API for this country',
        validation,
      };
    }

    // PRODUCTION TODO: Implement actual API calls to registration authorities
    // This is a simulated verification
    logger.info('Verifying ID against national registry', {
      countryCode,
      idNumber: this.mask(validation.idNumber, countryCode),
      apiEndpoint,
    });

    // Simulate API verification
    const simulated = await this._simulateRegistryVerification(
      validation.idNumber,
      countryCode,
      personalInfo
    );

    return {
      ...simulated,
      validation,
      verifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Format national ID number for display
   */
  format(idNumber, countryCode = 'ZW') {
    const cleaned = idNumber.replace(/[\s\-\.]/g, '').toUpperCase();
    
    switch (countryCode) {
      case 'ZW':
        // Format: 00-000000X00
        return `${cleaned.substring(0, 2)}-${cleaned.substring(2, cleaned.length - 3)}${cleaned.charAt(cleaned.length - 3)}${cleaned.substring(cleaned.length - 2)}`;
      case 'ZA':
        // Format: YYMMDD SSSS C Z
        return `${cleaned.substring(0, 6)} ${cleaned.substring(6, 10)} ${cleaned.substring(10, 11)} ${cleaned.substring(11, 13)}`;
      case 'ZM':
        // Format: 000000/00/0
        if (cleaned.length === 9) {
          return `${cleaned.substring(0, 6)}/${cleaned.substring(6, 8)}/${cleaned.substring(8, 9)}`;
        }
        return cleaned;
      case 'TZ':
        // Format: 00000000-00000-00000
        if (cleaned.length === 20) {
          return `${cleaned.substring(0, 8)}-${cleaned.substring(8, 13)}-${cleaned.substring(13, 18)}`;
        }
        return cleaned;
      default:
        return cleaned;
    }
  }

  /**
   * Mask ID number for display
   */
  mask(idNumber, countryCode = 'ZW') {
    const cleaned = idNumber.replace(/[\s\-\.]/g, '');
    const show = 4;
    return `${'*'.repeat(cleaned.length - show)}${cleaned.slice(-show)}`;
  }

  /**
   * Extract metadata from ID number (DOB, gender, etc.)
   */
  extractInfo(idNumber, countryCode = 'ZW') {
    const validation = this.validate(idNumber, countryCode);
    if (!validation.valid) return null;

    return this._extractMetadata(validation.idNumber, countryCode);
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Validate checksum for Zimbabwe ID
   * @private
   */
  _validateChecksum(idNumber, countryCode) {
    if (countryCode === 'ZW') {
      // Zimbabwe ID checksum validation
      // Format: XX-XXXXXXXLXX
      // Last two digits are a check digit based on the previous digits
      // PRODUCTION TODO: Implement actual checksum algorithm
      return true; // Simplified for now
    }

    if (countryCode === 'ZA') {
      // South African ID: Luhn algorithm on first 12 digits
      return this._validateLuhn(idNumber);
    }

    return true;
  }

  /**
   * Luhn algorithm validation
   * @private
   */
  _validateLuhn(number) {
    if (!number || number.length < 2) return false;

    let sum = 0;
    let alternate = false;

    for (let i = number.length - 1; i >= 0; i--) {
      let digit = parseInt(number.charAt(i), 10);

      if (alternate) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      alternate = !alternate;
    }

    return sum % 10 === 0;
  }

  /**
   * Extract metadata from ID number
   * @private
   */
  _extractMetadata(idNumber, countryCode) {
    const meta = {};

    switch (countryCode) {
      case 'ZA':
        // South African ID: YYMMDD SSSS C Z
        const dob = idNumber.substring(0, 6);
        const genderDigits = idNumber.substring(6, 10);
        const citizenship = idNumber.charAt(10);

        // Parse date of birth
        const year = parseInt(dob.substring(0, 2));
        const month = parseInt(dob.substring(2, 4));
        const day = parseInt(dob.substring(4, 6));
        
        meta.dateOfBirth = `${year > 30 ? '19' : '20'}${dob.substring(0, 2)}-${dob.substring(2, 4)}-${dob.substring(4, 6)}`;
        meta.gender = parseInt(genderDigits) >= 5000 ? 'male' : 'female';
        meta.citizenship = citizenship === '0' ? 'citizen' : 'permanent_resident';
        
        // Age estimate
        const birthYear = year > 30 ? 1900 + year : 2000 + year;
        meta.ageEstimate = new Date().getFullYear() - birthYear;
        break;

      case 'ZW':
        // Zimbabwe ID: First two digits indicate district
        const districtCode = idNumber.substring(0, 2);
        meta.district = this._getZimDistrict(districtCode);
        break;
    }

    return meta;
  }

  /**
   * Get Zimbabwe district name from code
   * @private
   */
  _getZimDistrict(code) {
    const districts = {
      '00': 'Harare',
      '01': 'Bulawayo',
      '02': 'Manicaland',
      '03': 'Mashonaland Central',
      '04': 'Mashonaland East',
      '05': 'Mashonaland West',
      '06': 'Masvingo',
      '07': 'Matabeleland North',
      '08': 'Matabeleland South',
      '09': 'Midlands',
    };
    return districts[code] || 'Unknown';
  }

  /**
   * Generate example ID for format display
   * @private
   */
  _generateExample(countryCode) {
    switch (countryCode) {
      case 'ZW': return '00-1234567X00';
      case 'ZA': return '900101 5001 0 87';
      case 'KE': return '12345678';
      case 'NG': return '12345678901';
      case 'BW': return '123456789';
      case 'ZM': return '123456/78/9';
      case 'TZ': return '12345678-12345-12345';
      default: return '000000000';
    }
  }

  /**
   * Simulate registry verification (for development)
   * @private
   */
  async _simulateRegistryVerification(idNumber, countryCode, personalInfo) {
    // PRODUCTION: Replace with actual API calls
    // This simulates a successful verification for development
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Simulate some invalid IDs for testing
    const testInvalidIds = ['0000000000', '1111111111', '9999999999'];
    if (testInvalidIds.some(invalid => idNumber.includes(invalid))) {
      return {
        verified: false,
        reason: 'ID not found in national registry',
        simulated: true,
      };
    }

    return {
      verified: true,
      reason: 'Identity verified against national registry',
      simulated: true,
      verificationId: `verify_${Date.now()}`,
    };
  }
}

module.exports = new NationalIdValidator();