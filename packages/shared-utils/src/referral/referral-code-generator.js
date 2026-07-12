const crypto = require('crypto');

/**
 * Unique Referral Code Generator
 * 
 * Generates unique, human-friendly referral codes with:
 * - Configurable length and character sets
 * - Ambiguous character exclusion (0/O, 1/I/l, 5/S, 8/B)
 * - Profanity filtering
 * - Duplicate prevention
 * - Prefix/suffix support for campaigns
 * - Pronounceable code option
 * 
 * @example
 *   const generator = require('@siamsiam/shared-utils').referral.referralCodeGenerator;
 *   const code = generator.generate({ prefix: 'SIAM', length: 8 });
 */

class ReferralCodeGenerator {
  constructor() {
    // Clean character set (no ambiguous characters)
    this.charset = 'ABCDEFGHJKMNPQRSTUVWXYZ234679';
    
    // Default code length
    this.defaultLength = 8;
    
    // Set of already used codes to prevent duplicates
    this.usedCodes = new Set();
    
    // Blocked words/patterns (profanity, offensive terms)
    this.blockedWords = [
      'BAD', 'XXX', 'SEX', 'DIE', 'GOD', 'ASS', 'FUK', 'FAG',
      'KIL', 'MUR', 'RAP', 'SUX', 'DED', 'DIK', 'FAT', 'GAY',
      'HEL', 'JEW', 'NAZ', 'PIG', 'PIS', 'POT', 'RAT', 'SUK',
    ];
    
    // Blocked prefixes (avoid generating codes starting with these)
    this.blockedPrefixes = ['FUK', 'DIK', 'ASS', 'SEX', 'XXX', 'KIL'];
  }

  /**
   * Generate a unique referral code
   * @param {Object} options - Generation options
   * @param {string} options.prefix - Prefix to add (e.g., 'SIAM')
   * @param {string} options.suffix - Suffix to add
   * @param {number} options.length - Code length (excluding prefix/suffix)
   * @param {number} options.maxAttempts - Max generation attempts before failing
   * @returns {string} Unique referral code
   */
  generate(options = {}) {
    const {
      prefix = '',
      suffix = '',
      length = this.defaultLength,
      maxAttempts = 100,
    } = options;

    let attempts = 0;
    let code;
    let fullCode;

    do {
      code = this._generateRandomCode(length);
      fullCode = prefix + code + suffix;
      attempts++;

      if (attempts >= maxAttempts) {
        throw new Error('Failed to generate unique referral code after maximum attempts');
      }
    } while (
      this.usedCodes.has(fullCode) || 
      this._containsBlockedWord(fullCode) ||
      this._startsWithBlockedPrefix(fullCode)
    );

    // Register code as used
    this.usedCodes.add(fullCode);

    return fullCode;
  }

  /**
   * Generate a pronounceable referral code
   * Alternates consonants and vowels for readability
   * @param {number} length - Code length (default: 6)
   * @returns {string} Pronounceable code
   */
  generatePronounceable(length = 6) {
    const consonants = 'BCDFGHJKLMNPQRSTVWXYZ';
    const vowels = 'AEUY';
    let code = '';

    for (let i = 0; i < length; i++) {
      if (i % 2 === 0) {
        code += consonants[crypto.randomInt(consonants.length)];
      } else {
        code += vowels[crypto.randomInt(vowels.length)];
      }
    }

    // Check for blocked words in pronounceable code
    if (this._containsBlockedWord(code)) {
      return this.generatePronounceable(length);
    }

    return code;
  }

  /**
   * Generate a numeric referral code (for USSD/sharing via phone)
   * @param {number} length - Code length (default: 6)
   * @returns {string} Numeric code
   */
  generateNumeric(length = 6) {
    let code = '';
    for (let i = 0; i < length; i++) {
      code += crypto.randomInt(10).toString();
    }
    return code;
  }

  /**
   * Generate a word-based referral code (easier to remember)
   * Combines random words with numbers
   * @returns {string} Word-based code (e.g., "HAPPY37CAT")
   */
  generateWordBased() {
    const adjectives = ['HAPPY', 'COOL', 'FAST', 'BEST', 'NICE', 'GOOD', 'WISE', 'BOLD'];
    const nouns = ['CAT', 'DOG', 'OWL', 'FOX', 'BEAR', 'LION', 'WOLF', 'DEER'];
    const number = crypto.randomInt(100).toString().padStart(2, '0');
    
    const adj = adjectives[crypto.randomInt(adjectives.length)];
    const noun = nouns[crypto.randomInt(nouns.length)];
    
    return `${adj}${number}${noun}`;
  }

  /**
   * Validate a referral code format
   * @param {string} code - Code to validate
   * @returns {boolean} True if code format is valid
   */
  validateFormat(code) {
    if (!code || typeof code !== 'string') return false;
    if (code.length < 4 || code.length > 20) return false;
    if (!/^[A-Z0-9]+$/.test(code)) return false;
    if (this._containsBlockedWord(code)) return false;
    return true;
  }

  /**
   * Release a code back to the available pool
   * @param {string} code - Code to release
   */
  releaseCode(code) {
    this.usedCodes.delete(code);
  }

  /**
   * Check if a code is already used
   * @param {string} code - Code to check
   * @returns {boolean} True if code is in use
   */
  isCodeUsed(code) {
    return this.usedCodes.has(code);
  }

  /**
   * Get number of codes generated
   * @returns {number} Count of used codes
   */
  getGeneratedCount() {
    return this.usedCodes.size;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Generate a random code from charset
   * @private
   */
  _generateRandomCode(length) {
    let code = '';
    for (let i = 0; i < length; i++) {
      code += this.charset[crypto.randomInt(this.charset.length)];
    }
    return code;
  }

  /**
   * Check if code contains any blocked words
   * @private
   */
  _containsBlockedWord(code) {
    const upper = code.toUpperCase();
    return this.blockedWords.some(word => upper.includes(word));
  }

  /**
   * Check if code starts with any blocked prefix
   * @private
   */
  _startsWithBlockedPrefix(code) {
    const upper = code.toUpperCase();
    return this.blockedPrefixes.some(prefix => upper.startsWith(prefix));
  }
}

// Export singleton instance
module.exports = new ReferralCodeGenerator();