const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * POS Device Model - Point of Sale Device
 * 
 * Registers and manages POS devices (terminals, tablets, registers).
 * Tracks device status, software versions, and connectivity.
 * 
 * TABLE: pos_devices
 */

class PosDevice extends BaseModel {
  static tableName = 'pos_devices';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'store_id', 'branch_id', 'merchant_id',
    'device_name', 'device_code', 'device_type',
    'device_model', 'serial_number', 'mac_address',
    'ip_address', 'operating_system', 'os_version',
    'app_version', 'firmware_version',
    'is_active', 'is_online', 'is_registered',
    'registered_at', 'last_online_at', 'last_offline_at',
    'last_heartbeat_at', 'last_transaction_at',
    'total_transactions', 'total_offline_transactions',
    'battery_level', 'storage_used_percent',
    'printer_connected', 'scanner_connected',
    'cash_drawer_connected', 'card_reader_connected',
    'assigned_to', 'assigned_to_name',
    'hardware_id', 'device_fingerprint',
    'registration_token_hash', 'api_key_hash',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    is_active: 'boolean', is_online: 'boolean', is_registered: 'boolean',
    printer_connected: 'boolean', scanner_connected: 'boolean',
    cash_drawer_connected: 'boolean', card_reader_connected: 'boolean',
    total_transactions: 'integer', total_offline_transactions: 'integer',
    battery_level: 'float', storage_used_percent: 'float',
    metadata: 'json', tags: 'json',
  };

  static deviceTypes = { TABLET: 'tablet', TERMINAL: 'terminal', REGISTER: 'register', MOBILE: 'mobile', KIOSK: 'kiosk' };

  static relations = {
    branch: { type: 'belongsTo', model: 'Branch', foreignKey: 'branch_id', ownerKey: 'id' },
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
  };

  static generateDeviceCode() { return `POS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; }

  /**
   * Register a new POS device
   */
  static async register(merchantId, branchId, deviceInfo) {
    const deviceCode = this.generateDeviceCode();
    const registrationToken = crypto.randomBytes(32).toString('hex');

    return this.create({
      store_id: deviceInfo.storeId, branch_id: branchId, merchant_id: merchantId,
      device_name: deviceInfo.deviceName, device_code: deviceCode,
      device_type: deviceInfo.deviceType || this.deviceTypes.TABLET,
      device_model: deviceInfo.deviceModel, serial_number: deviceInfo.serialNumber,
      mac_address: deviceInfo.macAddress, operating_system: deviceInfo.os,
      os_version: deviceInfo.osVersion, app_version: deviceInfo.appVersion,
      hardware_id: deviceInfo.hardwareId, device_fingerprint: deviceInfo.fingerprint,
      registration_token_hash: crypto.createHash('sha256').update(registrationToken).digest('hex'),
      is_active: true, is_registered: true, registered_at: new Date().toISOString(),
      metadata: deviceInfo.metadata || {}, tenant_id: deviceInfo.tenantId,
    });
  }

  /**
   * Update device online status
   */
  static async updateOnlineStatus(deviceId, isOnline) {
    const updates = { is_online: isOnline };
    if (isOnline) updates.last_online_at = new Date().toISOString();
    else updates.last_offline_at = new Date().toISOString();
    updates.last_heartbeat_at = new Date().toISOString();
    return this.update({ id: deviceId }, updates);
  }

  /**
   * Record transaction
   */
  static async recordTransaction(deviceId) {
    await connectionPool.query(
      `UPDATE ${this.tableName} SET total_transactions = total_transactions + 1, last_transaction_at = NOW() WHERE id = $1`,
      [deviceId]
    );
  }

  /**
   * Find devices by branch
   */
  static async findByBranch(branchId) {
    return this.findAll({ where: { branch_id: branchId, is_active: true } });
  }

  /**
   * Find devices by merchant
   */
  static async findByMerchant(merchantId) {
    return this.findAll({ where: { merchant_id: merchantId, is_active: true } });
  }

  /**
   * Deactivate a device
   */
  static async deactivate(deviceId, reason = null) {
    return this.update({ id: deviceId }, { is_active: false, is_online: false, notes: reason });
  }
}

module.exports = PosDevice;