const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Custom Domain Model - White-Label Store Domains
 * 
 * Manages custom domains for merchant stores.
 * Stores can use their own domain (e.g., choppies.axion.zw)
 * or bring their own custom domain with SSL support.
 * 
 * TABLE: custom_domains
 * 
 * DOMAIN TYPES:
 * - subdomain: storename.axion.zw (platform subdomain)
 * - custom: www.mystore.com (fully custom domain)
 * - redirect: old-domain.com -> new-domain.com
 */

class CustomDomain extends BaseModel {
  static tableName = 'custom_domains';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'merchant_id', 'store_id',
    // Domain configuration
    'domain', 'subdomain', 'domain_type',
    'is_primary', 'is_active',
    // Verification
    'is_verified', 'verified_at', 'verification_method',
    'verification_token', 'dns_verified',
    // DNS Configuration
    'dns_records', 'cname_record', 'a_record',
    'txt_record', 'dns_provider',
    // SSL
    'ssl_enabled', 'ssl_provider', 'ssl_status',
    'ssl_certificate_expiry', 'ssl_auto_renew',
    'force_https',
    // Redirect
    'redirect_to', 'redirect_type',
    // Status tracking
    'last_dns_check_at', 'dns_status',
    'last_ssl_check_at', 'ssl_health',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    dns_records: 'json',
    metadata: 'json',
    tags: 'json',
    is_primary: 'boolean',
    is_active: 'boolean',
    is_verified: 'boolean',
    dns_verified: 'boolean',
    ssl_enabled: 'boolean',
    ssl_auto_renew: 'boolean',
    force_https: 'boolean',
  };

  static relations = {
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
  };

  static domainTypes = {
    SUBDOMAIN: 'subdomain',
    CUSTOM: 'custom',
    REDIRECT: 'redirect',
  };

  static sslStatuses = {
    PENDING: 'pending', PROVISIONING: 'provisioning',
    ACTIVE: 'active', EXPIRING: 'expiring',
    EXPIRED: 'expired', ERROR: 'error',
  };

  /**
   * Find domain by domain name
   */
  static async findByDomain(domain) {
    return this.findOne({
      where: {
        domain: domain.toLowerCase().trim(),
        is_active: true,
        is_verified: true,
      },
    });
  }

  /**
   * Find all domains for a merchant
   */
  static async findByMerchant(merchantId) {
    return this.findAll({
      where: { merchant_id: merchantId },
      orderBy: { is_primary: 'DESC', created_at: 'DESC' },
    });
  }

  /**
   * Find primary domain for a merchant
   */
  static async getPrimary(merchantId) {
    return this.findOne({
      where: { merchant_id: merchantId, is_primary: true, is_active: true },
    });
  }

  /**
   * Set domain as primary
   */
  static async setPrimary(merchantId, domainId) {
    await connectionPool.query(
      `UPDATE ${this.tableName}
       SET is_primary = false, updated_at = NOW()
       WHERE merchant_id = $1`,
      [merchantId]
    );

    return this.update({ id: domainId }, {
      is_primary: true,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Verify domain ownership
   */
  static async verify(domainId, method = 'dns') {
    return this.update({ id: domainId }, {
      is_verified: true,
      verified_at: new Date().toISOString(),
      verification_method: method,
    });
  }

  /**
   * Enable SSL for domain
   */
  static async enableSSL(domainId, provider = 'letsencrypt') {
    return this.update({ id: domainId }, {
      ssl_enabled: true,
      ssl_provider: provider,
      ssl_status: this.sslStatuses.PROVISIONING,
      force_https: true,
    });
  }

  /**
   * Update DNS check status
   */
  static async updateDNSStatus(domainId, status, records = null) {
    const updates = {
      last_dns_check_at: new Date().toISOString(),
      dns_status: status,
    };
    if (records) updates.dns_records = records;
    if (status === 'verified') updates.dns_verified = true;

    return this.update({ id: domainId }, updates);
  }

  /**
   * Generate verification token for DNS/File verification
   */
  static generateVerificationToken() {
    const crypto = require('crypto');
    return `siamsiam-verify-${crypto.randomBytes(16).toString('hex')}`;
  }
}

module.exports = CustomDomain;