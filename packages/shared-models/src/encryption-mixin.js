const { encryption } = require('@siamsiam/shared-utils').security;
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Encryption Mixin
 * 
 * Adds field-level encryption to models.
 * Automatically encrypts/decrypts specified fields
 * when reading from or writing to the database.
 * 
 * ENCRYPTED FIELDS:
 * Define static encryptedFields array on your model:
 * static encryptedFields = ['ssn', 'passport_number', 'bank_account'];
 * 
 * @example
 *   class User extends BaseModel {
 *     static encryptedFields = ['national_id', 'date_of_birth'];
 *   }
 *   Object.assign(User, EncryptionMixin);
 */

const EncryptionMixin = {
  encryptedFields: [],

  /**
   * Create record with encrypted fields
   */
  async create(data) {
    const encrypted = { ...data };
    
    for (const field of this.encryptedFields) {
      if (encrypted[field]) {
        encrypted[field] = encryption.encrypt(String(encrypted[field]));
      }
    }

    return BaseModel.create.call(this, encrypted);
  },

  /**
   * Update record with encrypted fields
   */
  async update(id, data) {
    const encrypted = { ...data };
    
    for (const field of this.encryptedFields) {
      if (encrypted[field]) {
        encrypted[field] = encryption.encrypt(String(encrypted[field]));
      }
    }

    const record = await BaseModel.update.call(this, id, encrypted);
    
    // Decrypt for return
    if (record) {
      return this._decryptRecord(record);
    }
    
    return null;
  },

  /**
   * Find by ID with decryption
   */
  async findById(id) {
    const record = await BaseModel.findById.call(this, id);
    return record ? this._decryptRecord(record) : null;
  },

  /**
   * Find all with decryption
   */
  async findAll(options) {
    const records = await BaseModel.findAll.call(this, options);
    return records.map(record => this._decryptRecord(record));
  },

  /**
   * Find one with decryption
   */
  async findOne(options) {
    const record = await BaseModel.findOne.call(this, options);
    return record ? this._decryptRecord(record) : null;
  },

  /**
   * Decrypt encrypted fields in a record
   * @private
   */
  _decryptRecord(record) {
    if (!record || !this.encryptedFields.length) return record;

    const decrypted = { ...record };
    
    for (const field of this.encryptedFields) {
      if (decrypted[field]) {
        try {
          decrypted[field] = encryption.decrypt(decrypted[field]);
        } catch (error) {
          logger.warn(`Failed to decrypt field: ${field}`, {
            error: error.message,
          });
        }
      }
    }

    return decrypted;
  },
};

const BaseModel = require('./base-model');
module.exports = EncryptionMixin;