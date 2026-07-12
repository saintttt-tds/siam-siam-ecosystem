const logger = require('../logging/logger');

/**
 * Business Registration Number Validator
 * 
 * Validates business registration numbers and company identifiers
 * across different African countries. Links to national business
 * registries for verification.
 * 
 * REGISTRATION TYPES:
 * - Company Registration Number (CR)
 * - Tax Identification Number (TIN)
 * - VAT Registration Number
 * - Business License Number
 * - PAYE Registration Number
 * 
 * SUPPORTED COUNTRIES:
 * - Zimbabwe: CR14, BP Number, VAT Number
 * - South Africa: CIPC Registration, VAT Number
 * - Kenya: Certificate of Incorporation
 * - Nigeria: CAC Registration, TIN
 * - Botswana: CIPA Registration
 * 
 * INTEGRATION:
 * This validator connects to national business registration
 * systems for merchant/business verification during onboarding.
 * 
 * @example
 *   const bizReg = require('@siamsiam/shared-utils').validators.businessRegValidator;
 *   const result = bizReg.validate('12345/2023', 'ZW', 'company_registration');
 *   if (result.valid) { /* proceed with merchant verification * / }
 */

class BusinessRegValidator {
  constructor() {
    // Business registration formats by country
    this.countries = {
      ZW: {
        name: 'Zimbabwe',
        registrar: 'Companies and Deeds Registry',
        types: {
          company_registration: {
            name: 'Company Registration Number (CR14)',
            patterns: [/^\d{1,6}\/\d{4}$/, /^\d{2,6}\/\d{2}$/],
            format: '00000/YYYY',
            description: 'Format: XXXXX/YYYY (e.g., 12345/2023)',
            example: '12345/2023',
          },
          bp_number: {
            name: 'Business Partner Number',
            patterns: [/^BP\d{6,8}$/i, /^\d{8}$/],
            format: 'BP00000000',
            description: 'ZIMRA Business Partner Number',
            example: 'BP00123456',
          },
          vat_number: {
            name: 'VAT Registration Number',
            patterns: [/^VAT\d{6,9}$/i, /^\d{9}$/],
            format: 'VAT000000000',
            description: 'ZIMRA VAT Registration Number',
            example: 'VAT123456789',
          },
          tax_clearance: {
            name: 'Tax Clearance Certificate (ITF263)',
            patterns: [/^ITF\d{6,10}$/i],
            format: 'ITF0000000000',
            description: 'ZIMRA Tax Clearance Certificate',
            example: 'ITF1234567890',
          },
          paye_number: {
            name: 'PAYE Registration Number',
            patterns: [/^PAYE\d{5,8}$/i],
            format: 'PAYE00000000',
            description: 'ZIMRA PAYE Registration',
            example: 'PAYE12345678',
          },
        },
      },
      ZA: {
        name: 'South Africa',
        registrar: 'CIPC (Companies and Intellectual Property Commission)',
        types: {
          company_registration: {
            name: 'CIPC Registration Number',
            patterns: [/^\d{4}\/\d{6,7}\/\d{2}$/, /^[A-Z]\d{4}\/\d{6,7}\/\d{2}$/],
            format: 'YYYY/NNNNNNN/NN or KYYYY/NNNNNNN/NN',
            description: 'CIPC Company Registration (e.g., 2023/123456/07)',
            example: '2023/123456/07',
          },
          tax_number: {
            name: 'Income Tax Number',
            patterns: [/^\d{10}$/],
            format: '0000000000',
            description: 'SARS Income Tax Reference Number',
            example: '1234567890',
          },
          vat_number: {
            name: 'VAT Registration Number',
            patterns: [/^4\d{9}$/],
            format: '4000000000',
            description: 'SARS VAT Number (starts with 4)',
            example: '4123456789',
          },
        },
      },
      KE: {
        name: 'Kenya',
        registrar: 'Companies Registry',
        types: {
          company_registration: {
            name: 'Certificate of Incorporation Number',
            patterns: [/^CPR\/\d{4}\/\d{6,8}$/i, /^PVT-\w{5,10}$/i],
            format: 'CPR/YYYY/NNNNNN',
            description: 'Companies Registry Number',
            example: 'CPR/2023/123456',
          },
          kra_pin: {
            name: 'KRA PIN Number',
            patterns: [/^[A-Z]\d{9}[A-Z]$/],
            format: 'A000000000A',
            description: 'Kenya Revenue Authority PIN',
            example: 'A123456789B',
          },
          vat_number: {
            name: 'VAT Registration Number',
            patterns: [/^P\d{9}[A-Z]$/],
            format: 'P000000000A',
            description: 'KRA VAT Number',
            example: 'P123456789A',
          },
        },
      },
      NG: {
        name: 'Nigeria',
        registrar: 'CAC (Corporate Affairs Commission)',
        types: {
          company_registration: {
            name: 'CAC Registration Number (RC/BN)',
            patterns: [/^(RC|BN|IT)\s?\d{1,7}$/i],
            format: 'RC 0000000 or BN 0000000',
            description: 'CAC Registration (RC=Company, BN=Business Name)',
            example: 'RC 1234567',
          },
          tin: {
            name: 'Tax Identification Number (TIN)',
            patterns: [/^\d{12}-\d{4}$/, /^\d{16}$/],
            format: '000000000000-0000',
            description: 'FIRS Tax Identification Number',
            example: '123456789012-3456',
          },
          vat_number: {
            name: 'VAT Registration Number',
            patterns: [/^\d{12}$/],
            format: '000000000000',
            description: 'FIRS VAT Registration Number',
            example: '123456789012',
          },
        },
      },
      BW: {
        name: 'Botswana',
        registrar: 'CIPA (Companies and Intellectual Property Authority)',
        types: {
          company_registration: {
            name: 'CIPA Registration Number',
            patterns: [/^(CO|BW)\d{4}\/\d{4,6}$/i],
            format: 'COYYYY/NNNNN or BWYYYY/NNNNN',
            description: 'CIPA Company Registration',
            example: 'CO2023/12345',
          },
          tax_number: {
            name: 'BURS Tax Number',
            patterns: [/^\d{10}$/],
            format: '0000000000',
            description: 'Botswana Unified Revenue Service TIN',
            example: '1234567890',
          },
        },
      },
    };

    // Business registry verification APIs
    // PRODUCTION: Replace with actual registry APIs
    this.registryApis = {
      ZW: 'https://api.zimra.co.zw/verify',
      ZA: 'https://api.cipc.co.za/verify',
      KE: 'https://api.ecitizen.go.ke/verify',
      NG: 'https://api.cac.gov.ng/verify',
      BW: 'https://api.cipa.co.bw/verify',
    };
  }

  /**
   * Validate business registration number
   * @param {string} regNumber - Registration number
   * @param {string} countryCode - ISO country code
   * @param {string} type - Registration type (company_registration, vat_number, etc.)
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  validate(regNumber, countryCode = 'ZW', type = 'company_registration', options = {}) {
    if (!regNumber) {
      return { valid: false, error: 'Registration number is required' };
    }

    const country = this.countries[countryCode];
    if (!country) {
      return { valid: false, error: `Unsupported country: ${countryCode}` };
    }

    const regType = country.types[type];
    if (!regType) {
      return { valid: false, error: `Unsupported registration type: ${type}` };
    }

    // Clean the input
    const cleaned = regNumber.replace(/[\s\-\.]/g, '').toUpperCase();

    // Pattern check
    let matchFound = false;
    for (const pattern of regType.patterns) {
      if (pattern.test(regNumber) || pattern.test(cleaned)) {
        matchFound = true;
        break;
      }
    }

    if (!matchFound) {
      return {
        valid: false,
        error: `Invalid ${regType.name} format`,
        expectedFormat: regType.format,
        description: regType.description,
        example: regType.example,
      };
    }

    return {
      valid: true,
      regNumber: cleaned,
      formatted: this.format(cleaned, countryCode, type),
      country: countryCode,
      countryName: country.name,
      type,
      typeName: regType.name,
      registrar: country.registrar,
    };
  }

  /**
   * Verify business registration against national registry
   * @param {string} regNumber - Registration number
   * @param {string} countryCode - ISO country code
   * @param {string} type - Registration type
   * @param {Object} businessInfo - Business information for verification
   * @returns {Promise<Object>} Verification result
   */
  async verifyAgainstRegistry(regNumber, countryCode, type, businessInfo = {}) {
    // First validate format
    const validation = this.validate(regNumber, countryCode, type);
    if (!validation.valid) {
      return {
        verified: false,
        error: 'Invalid registration format',
        validation,
      };
    }

    const apiEndpoint = this.registryApis[countryCode];
    if (!apiEndpoint) {
      return {
        verified: false,
        error: 'No business registry API for this country',
        validation,
      };
    }

    // PRODUCTION TODO: Implement actual API calls to business registries
    logger.info('Verifying business registration against national registry', {
      countryCode,
      type,
      regNumber: this.mask(validation.regNumber),
      apiEndpoint,
      businessName: businessInfo.name,
    });

    // Simulate verification
    const simulated = await this._simulateRegistryVerification(
      validation.regNumber,
      countryCode,
      type,
      businessInfo
    );

    return {
      ...simulated,
      validation,
      verifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Batch verify multiple registrations for a business
   * @param {string} countryCode - ISO country code
   * @param {Object} registrations - Map of type -> registration number
   * @param {Object} businessInfo - Business information
   * @returns {Promise<Object>} Verification results
   */
  async verifyBusiness(countryCode, registrations, businessInfo = {}) {
    const results = {};

    for (const [type, regNumber] of Object.entries(registrations)) {
      results[type] = await this.verifyAgainstRegistry(
        regNumber,
        countryCode,
        type,
        businessInfo
      );
    }

    return {
      businessName: businessInfo.name,
      country: countryCode,
      results,
      allValid: Object.values(results).every(r => r.verified),
      verifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Format registration number for display
   */
  format(regNumber, countryCode = 'ZW', type = 'company_registration') {
    const cleaned = regNumber.replace(/[\s\-\.]/g, '').toUpperCase();
    const country = this.countries[countryCode];
    
    if (!country || !country.types[type]) return cleaned;

    const regType = country.types[type];

    // Apply formatting based on type
    switch (`${countryCode}_${type}`) {
      case 'ZW_company_registration':
        // Format: 00000/YYYY
        const parts = cleaned.split('/');
        return parts.length === 2 ? cleaned : cleaned;
      
      case 'ZA_company_registration':
        // Format: YYYY/NNNNNNN/NN
        return cleaned.replace(/^(\d{4})(\d{6,7})(\d{2})$/, '$1/$2/$3');
      
      case 'KE_company_registration':
        // Format: CPR/YYYY/NNNNNN
        return cleaned.replace(/^CPR(\d{4})(\d{6,8})$/, 'CPR/$1/$2');
      
      case 'NG_company_registration':
        // Format: RC 0000000
        return cleaned.replace(/^(RC|BN|IT)(\d{1,7})$/, '$1 $2');
      
      default:
        return cleaned;
    }
  }

  /**
   * Mask registration number for display
   */
  mask(regNumber) {
    const cleaned = regNumber.replace(/[\s\-\.]/g, '');
    const show = 4;
    return `${'*'.repeat(Math.max(0, cleaned.length - show))}${cleaned.slice(-show)}`;
  }

  /**
   * Get supported registration types for a country
   */
  getRegistrationTypes(countryCode) {
    const country = this.countries[countryCode];
    if (!country) return [];

    return Object.entries(country.types).map(([type, info]) => ({
      type,
      name: info.name,
      format: info.format,
      description: info.description,
      example: info.example,
    }));
  }

  /**
   * Get registrar information
   */
  getRegistrarInfo(countryCode) {
    const country = this.countries[countryCode];
    return country ? { name: country.registrar, country: country.name } : null;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Simulate registry verification
   * @private
   */
  async _simulateRegistryVerification(regNumber, countryCode, type, businessInfo) {
    // PRODUCTION: Replace with actual API calls
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 150));

    // Simulate some invalid registrations for testing
    const testInvalidRegs = ['0000000000', '1111111111', '9999999999'];
    if (testInvalidRegs.some(invalid => regNumber.includes(invalid))) {
      return {
        verified: false,
        reason: 'Registration not found in national business registry',
        simulated: true,
      };
    }

    // Check if business name matches (if provided)
    if (businessInfo.name && businessInfo.name.length < 2) {
      return {
        verified: false,
        reason: 'Business name appears invalid',
        simulated: true,
      };
    }

    return {
      verified: true,
      reason: 'Business registration verified against national registry',
      simulated: true,
      verificationId: `biz_verify_${Date.now()}`,
      businessDetails: {
        registrationNumber: regNumber,
        registrationDate: '2023-01-01', // Simulated
        status: 'Active',
        type: type,
      },
    };
  }
}

module.exports = new BusinessRegValidator();