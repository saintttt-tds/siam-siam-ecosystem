/**
 * Validators Module Index
 * 
 * Input validation and sanitization utilities for
 * all common data types used across the ecosystem.
 */

module.exports = {
  phoneValidator: require('./phone-validator'),
  emailValidator: require('./email-validator'),
  currencyValidator: require('./currency-validator'),
  nationalIdValidator: require('./national-id-validator'),
  businessRegValidator: require('./business-reg-validator'),
  sanitize: require('./sanitize'),
};