const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * User Device Model - Registered User Devices
 * 
 * Tracks devices registered by users for push notifications,
 * device fingerprinting, trusted device recognition, and
 * fraud prevention. Each device is uniquely identified and
 * can be trusted for future logins.
 * 
 * TABLE: user_devices
 */

class UserDevice extends BaseModel {
  static tableName = 'user_devices';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id', 'unified_account_id',
    'device_id', 'device_name', 'device_type',
    'device_model', 'device_manufacturer',
    'device_os', 'device_os_version', 'device_os_build',
    'app_name', 'app_version', 'app_build_number',
    'app_install_id', 'app_install_date',
    'sdk_version', 'platform', 'platform_version',
    'push_token', 'push_provider', 'push_token_updated_at',
    'push_token_status', 'push_token_error',
    'voip_token', 'voip_provider',
    'is_trusted', 'is_primary', 'is_active',
    'is_emulator', 'is_rooted', 'is_jailbroken',
    'is_development_device', 'is_test_device',
    'trusted_at', 'trust_expires_at', 'trust_method',
    'first_seen_at', 'first_seen_ip', 'first_seen_location',
    'last_seen_at', 'last_seen_ip', 'last_seen_location',
    'last_active_at', 'last_active_platform',
    'use_count', 'login_count',
    'device_fingerprint', 'fingerprint_algorithm',
    'fingerprint_confidence', 'fingerprint_updated_at',
    'screen_width', 'screen_height', 'screen_density',
    'screen_scale', 'device_memory_mb', 'device_storage_gb',
    'device_free_storage_gb', 'processor', 'processor_count',
    'device_language', 'device_locale', 'device_timezone',
    'carrier_name', 'carrier_country', 'network_type',
    'advertising_id', 'vendor_id',
    'hardware_id', 'hardware_serial',
    'bluetooth_enabled', 'bluetooth_mac',
    'wifi_enabled', 'wifi_mac', 'wifi_ssid',
    'battery_level', 'battery_charging', 'battery_health',
    'location_permission', 'notification_permission',
    'camera_permission', 'microphone_permission',
    'storage_permission', 'contacts_permission',
    'biometric_enabled', 'biometric_type', 'biometric_strength',
    'security_patch_level', 'encryption_enabled',
    'vpn_detected', 'proxy_detected', 'tor_detected',
    'developer_mode', 'usb_debugging',
    'device_metadata', 'capabilities',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at',
  ];

  static casts = {
    is_trusted: 'boolean', is_primary: 'boolean', is_active: 'boolean',
    is_emulator: 'boolean', is_rooted: 'boolean', is_jailbroken: 'boolean',
    is_development_device: 'boolean', is_test_device: 'boolean',
    bluetooth_enabled: 'boolean', wifi_enabled: 'boolean',
    battery_charging: 'boolean', location_permission: 'boolean',
    notification_permission: 'boolean', camera_permission: 'boolean',
    microphone_permission: 'boolean', storage_permission: 'boolean',
    contacts_permission: 'boolean', biometric_enabled: 'boolean',
    encryption_enabled: 'boolean', vpn_detected: 'boolean',
    proxy_detected: 'boolean', tor_detected: 'boolean',
    developer_mode: 'boolean', usb_debugging: 'boolean',
    biometric_strength: 'integer', use_count: 'integer',
    login_count: 'integer', screen_width: 'integer',
    screen_height: 'integer', device_memory_mb: 'integer',
    device_storage_gb: 'integer', device_free_storage_gb: 'integer',
    processor_count: 'integer', battery_level: 'float',
    battery_health: 'float', fingerprint_confidence: 'float',
    screen_density: 'float', screen_scale: 'float',
    device_fingerprint: 'json', device_metadata: 'json',
    capabilities: 'json', metadata: 'json', tags: 'json',
    first_seen_at: 'datetime', last_seen_at: 'datetime',
    last_active_at: 'datetime', trusted_at: 'datetime',
    trust_expires_at: 'datetime',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    unifiedAccount: { type: 'belongsTo', model: 'UnifiedAccount', foreignKey: 'unified_account_id', ownerKey: 'id' },
  };

  static deviceTypes = {
    MOBILE: 'mobile', TABLET: 'tablet', DESKTOP: 'desktop',
    LAPTOP: 'laptop', SMART_TV: 'smart_tv', WEARABLE: 'wearable',
    POS: 'pos', KIOSK: 'kiosk', OTHER: 'other',
  };

  /**
   * Register a device for a user
   */
  static async registerDevice(userId, deviceData) {
    const existing = await this.findOne({
      where: { user_id: userId, device_id: deviceData.deviceId },
    });

    if (existing) {
      return this.update({ id: existing.id }, {
        device_name: deviceData.deviceName || existing.device_name,
        push_token: deviceData.pushToken || existing.push_token,
        push_token_updated_at: deviceData.pushToken ? new Date().toISOString() : existing.push_token_updated_at,
        last_seen_at: new Date().toISOString(),
        last_seen_ip: deviceData.ipAddress,
        last_active_at: new Date().toISOString(),
        use_count: connectionPool.raw('use_count + 1'),
        app_version: deviceData.appVersion || existing.app_version,
        battery_level: deviceData.batteryLevel,
        metadata: { ...(existing.metadata || {}), lastUpdatedAt: new Date().toISOString() },
      });
    }

    // Check if first device
    const deviceCount = await this.count({ where: { user_id: userId } });

    return this.create({
      user_id: userId, unified_account_id: deviceData.unifiedAccountId,
      device_id: deviceData.deviceId, device_name: deviceData.deviceName,
      device_type: deviceData.deviceType || this.deviceTypes.MOBILE,
      device_model: deviceData.deviceModel, device_manufacturer: deviceData.manufacturer,
      device_os: deviceData.os, device_os_version: deviceData.osVersion,
      app_name: deviceData.appName, app_version: deviceData.appVersion,
      app_install_id: deviceData.appInstallId,
      platform: deviceData.platform, push_token: deviceData.pushToken,
      push_provider: deviceData.pushProvider || (deviceData.platform === 'ios' ? 'apns' : 'fcm'),
      is_trusted: deviceData.isTrusted || false,
      is_primary: deviceCount === 0,
      is_active: true, is_emulator: deviceData.isEmulator || false,
      is_rooted: deviceData.isRooted || false, is_jailbroken: deviceData.isJailbroken || false,
      first_seen_at: new Date().toISOString(), first_seen_ip: deviceData.ipAddress,
      last_seen_at: new Date().toISOString(), last_seen_ip: deviceData.ipAddress,
      last_active_at: new Date().toISOString(), use_count: 1,
      device_fingerprint: deviceData.deviceFingerprint,
      screen_width: deviceData.screenWidth, screen_height: deviceData.screenHeight,
      device_language: deviceData.deviceLanguage, device_timezone: deviceData.deviceTimezone,
      carrier_name: deviceData.carrierName, network_type: deviceData.networkType,
      battery_level: deviceData.batteryLevel, battery_charging: deviceData.isCharging,
      location_permission: deviceData.locationPermission,
      notification_permission: deviceData.notificationPermission,
      biometric_enabled: deviceData.biometricEnabled,
      biometric_type: deviceData.biometricType,
      metadata: deviceData.metadata || {}, tenant_id: deviceData.tenantId,
    });
  }

  /**
   * Find devices by user
   */
  static async findByUser(userId) {
    return this.findAll({
      where: { user_id: userId, is_active: true },
      orderBy: { is_primary: 'DESC', last_active_at: 'DESC' },
    });
  }

  /**
   * Trust a device
   */
  static async trustDevice(deviceId, method = 'manual') {
    return this.update({ id: deviceId }, {
      is_trusted: true, trusted_at: new Date().toISOString(),
      trust_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      trust_method: method,
    });
  }

  /**
   * Remove a device (deactivate)
   */
  static async removeDevice(deviceId) {
    return this.update({ id: deviceId }, {
      is_active: false, push_token: null, is_trusted: false, is_primary: false,
    });
  }

  /**
   * Update push token
   */
  static async updatePushToken(deviceId, pushToken, provider = null) {
    return this.update({ id: deviceId }, {
      push_token: pushToken, push_token_updated_at: new Date().toISOString(),
      push_provider: provider || undefined, push_token_status: 'active',
    });
  }

  /**
   * Record device usage
   */
  static async recordUsage(deviceId, metadata = {}) {
    await connectionPool.query(
      `UPDATE ${this.tableName} SET use_count = use_count + 1, login_count = login_count + 1, last_seen_at = NOW(), last_active_at = NOW(), last_seen_ip = $2, last_active_platform = $3 WHERE id = $1`,
      [deviceId, metadata.ipAddress, metadata.platform]
    );
  }
}

module.exports = UserDevice;