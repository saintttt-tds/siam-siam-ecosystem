const logger = require('../logging/logger');

/**
 * Multi-Country Zone Definitions and International Coverage
 * 
 * Manages delivery zones, service availability, and operational
 * parameters across multiple African countries.
 * 
 * COVERAGE INCLUDES:
 * - Zimbabwe (ZW)
 * - South Africa (ZA)
 * - Botswana (BW)
 * - Zambia (ZM)
 * - Kenya (KE)
 * - Nigeria (NG)
 * - Tanzania (TZ)
 * 
 * @example
 *   const intl = require('@siamsiam/shared-utils').geolocation.internationalCoverage;
 *   const countries = intl.getActiveCountries();
 *   const services = intl.getAvailableServices('ZW');
 */

class InternationalCoverage {
  constructor() {
    // Country configurations
    this.countries = {
      ZW: {
        name: 'Zimbabwe',
        capital: 'Harare',
        currency: 'USD',
        timezone: 'Africa/Harare',
        languages: ['en', 'sn', 'nd'],
        active: true,
        services: {
          commerce: true,
          payments: true,
          delivery: true,
          pos: true,
          ussd: true,
          corporateFx: true,
        },
        zones: ['harare_cbd', 'harare_suburbs', 'bulawayo', 'gweru', 'mutare'],
        paymentMethods: ['ecocash', 'onemoney', 'telecash', 'zimswitch', 'bank_transfer', 'cash'],
        deliveryPartners: ['axionfly', 'third_party'],
        regulations: {
          maxTransactionUSD: 10000,
          requireKYC: true,
          kycThreshold: 1000,
        },
        operatingHours: {
          timezone: 'Africa/Harare',
          weekdays: { start: '08:00', end: '18:00' },
          saturday: { start: '09:00', end: '14:00' },
          sunday: false,
        },
      },
      ZA: {
        name: 'South Africa',
        capital: 'Pretoria',
        currency: 'ZAR',
        timezone: 'Africa/Johannesburg',
        languages: ['en', 'af', 'zu', 'xh'],
        active: true,
        services: {
          commerce: true,
          payments: true,
          delivery: true,
          pos: false,
          ussd: false,
          corporateFx: true,
        },
        zones: ['johannesburg', 'capetown', 'durban', 'pretoria'],
        paymentMethods: ['card', 'bank_transfer', 'capitec', 'fnb', 'standard_bank', 'nedbank'],
        deliveryPartners: ['axionfly', 'third_party'],
        regulations: {
          maxTransactionZAR: 100000,
          requireKYC: true,
          kycThreshold: 5000,
        },
      },
      BW: {
        name: 'Botswana',
        capital: 'Gaborone',
        currency: 'BWP',
        timezone: 'Africa/Gaborone',
        languages: ['en', 'tn'],
        active: true,
        services: {
          commerce: true,
          payments: true,
          delivery: true,
          pos: false,
          ussd: false,
          corporateFx: true,
        },
        zones: ['gaborone', 'francistown'],
        paymentMethods: ['card', 'bank_transfer', 'fnb_botswana', 'standard_chartered'],
        deliveryPartners: ['axionfly', 'third_party'],
        regulations: {
          maxTransactionBWP: 50000,
          requireKYC: true,
          kycThreshold: 5000,
        },
      },
      ZM: {
        name: 'Zambia',
        capital: 'Lusaka',
        currency: 'ZMW',
        timezone: 'Africa/Lusaka',
        languages: ['en', 'bem', 'nya'],
        active: true,
        services: {
          commerce: true,
          payments: true,
          delivery: false,
          pos: false,
          ussd: false,
          corporateFx: false,
        },
        zones: ['lusaka', 'kitwe'],
        paymentMethods: ['mobile_money', 'bank_transfer'],
        deliveryPartners: ['third_party'],
        regulations: {
          maxTransactionZMW: 50000,
          requireKYC: false,
        },
      },
      KE: {
        name: 'Kenya',
        capital: 'Nairobi',
        currency: 'KES',
        timezone: 'Africa/Nairobi',
        languages: ['en', 'sw'],
        active: true,
        services: {
          commerce: true,
          payments: true,
          delivery: false,
          pos: false,
          ussd: true,
          corporateFx: false,
        },
        zones: ['nairobi', 'mombasa'],
        paymentMethods: ['mpesa', 'airtel_money', 'card', 'bank_transfer'],
        deliveryPartners: ['third_party'],
        regulations: {
          maxTransactionKES: 300000,
          requireKYC: true,
          kycThreshold: 100000,
        },
      },
      NG: {
        name: 'Nigeria',
        capital: 'Abuja',
        currency: 'NGN',
        timezone: 'Africa/Lagos',
        languages: ['en', 'ha', 'yo', 'ig'],
        active: true,
        services: {
          commerce: true,
          payments: true,
          delivery: false,
          pos: false,
          ussd: true,
          corporateFx: false,
        },
        zones: ['lagos', 'abuja', 'portharcourt'],
        paymentMethods: ['bank_transfer', 'card', 'ussd'],
        deliveryPartners: ['third_party'],
        regulations: {
          maxTransactionNGN: 1000000,
          requireKYC: true,
          kycThreshold: 50000,
        },
      },
      TZ: {
        name: 'Tanzania',
        capital: 'Dodoma',
        currency: 'TZS',
        timezone: 'Africa/Dar_es_Salaam',
        languages: ['sw', 'en'],
        active: false, // Coming soon
        services: {
          commerce: false,
          payments: false,
          delivery: false,
          pos: false,
          ussd: false,
          corporateFx: false,
        },
        zones: ['dar_es_salaam'],
        paymentMethods: ['mobile_money', 'bank_transfer'],
        deliveryPartners: ['third_party'],
        regulations: {
          maxTransactionTZS: 10000000,
          requireKYC: false,
        },
      },
    };

    // Cross-border delivery configurations
    this.crossBorder = {
      enabled: true,
      supportedRoutes: [
        { from: 'ZW', to: 'ZA', method: 'road', estimatedDays: 3 },
        { from: 'ZW', to: 'BW', method: 'road', estimatedDays: 2 },
        { from: 'ZA', to: 'BW', method: 'road', estimatedDays: 2 },
        { from: 'ZA', to: 'ZW', method: 'road', estimatedDays: 3 },
        { from: 'ZA', to: 'ZM', method: 'road', estimatedDays: 5 },
        { from: 'KE', to: 'TZ', method: 'road', estimatedDays: 3 },
      ],
      customsDocumentation: {
        commercial_invoice: true,
        packing_list: true,
        certificate_of_origin: true,
      },
    };
  }

  /**
   * Get all active countries
   * @returns {Array} List of active country configurations
   */
  getActiveCountries() {
    return Object.entries(this.countries)
      .filter(([, config]) => config.active)
      .map(([code, config]) => ({
        code,
        name: config.name,
        capital: config.capital,
        currency: config.currency,
        timezone: config.timezone,
        languages: config.languages,
        services: this.getAvailableServices(code),
      }));
  }

  /**
   * Get available services for a country
   * @param {string} countryCode - ISO country code
   * @returns {Object|null} Available services
   */
  getAvailableServices(countryCode) {
    const country = this.countries[countryCode];
    if (!country || !country.active) return null;

    return {
      commerce: country.services.commerce,
      payments: country.services.payments,
      delivery: country.services.delivery,
      pos: country.services.pos,
      ussd: country.services.ussd,
      corporateFx: country.services.corporateFx,
    };
  }

  /**
   * Get available payment methods for a country
   * @param {string} countryCode - ISO country code
   * @returns {Array|null} Available payment methods
   */
  getPaymentMethods(countryCode) {
    const country = this.countries[countryCode];
    return country?.active ? country.paymentMethods : null;
  }

  /**
   * Get delivery zones for a country
   */
  getZones(countryCode) {
    const country = this.countries[countryCode];
    return country?.active ? country.zones : [];
  }

  /**
   * Check if a service is available in a country
   */
  isServiceAvailable(countryCode, service) {
    const country = this.countries[countryCode];
    return country?.active && country.services[service] === true;
  }

  /**
   * Get regulatory limits for a country
   */
  getRegulations(countryCode) {
    return this.countries[countryCode]?.regulations || null;
  }

  /**
   * Get operating hours for a country
   */
  getOperatingHours(countryCode) {
    return this.countries[countryCode]?.operatingHours || null;
  }

  /**
   * Check if cross-border delivery is available
   */
  isCrossBorderAvailable(fromCountry, toCountry) {
    if (!this.crossBorder.enabled) return false;

    return this.crossBorder.supportedRoutes.some(
      route => route.from === fromCountry && route.to === toCountry
    );
  }

  /**
   * Get cross-border delivery info
   */
  getCrossBorderInfo(fromCountry, toCountry) {
    const route = this.crossBorder.supportedRoutes.find(
      r => r.from === fromCountry && r.to === toCountry
    );

    if (!route) return null;

    return {
      available: true,
      method: route.method,
      estimatedDays: route.estimatedDays,
      requiresCustoms: true,
      documents: this.crossBorder.customsDocumentation,
    };
  }

  /**
   * Get supported languages for a country
   */
  getLanguages(countryCode) {
    return this.countries[countryCode]?.languages || ['en'];
  }

  /**
   * Check if country requires KYC for transactions
   */
  requiresKYC(countryCode, amount, currency) {
    const country = this.countries[countryCode];
    if (!country?.regulations) return false;

    if (!country.regulations.requireKYC) return false;

    // Convert amount to local currency for threshold check
    // PRODUCTION TODO: Implement currency conversion
    const threshold = country.regulations.kycThreshold || 0;
    return amount > threshold;
  }

  /**
   * Add or update country configuration
   */
  updateCountry(countryCode, config) {
    this.countries[countryCode] = {
      ...this.countries[countryCode],
      ...config,
    };
    logger.info(`Country configuration updated: ${countryCode}`);
  }

  /**
   * Get all countries (including inactive)
   */
  getAllCountries() {
    return Object.entries(this.countries).map(([code, config]) => ({
      code,
      name: config.name,
      active: config.active,
      currency: config.currency,
      services: config.services,
    }));
  }
}

module.exports = new InternationalCoverage();