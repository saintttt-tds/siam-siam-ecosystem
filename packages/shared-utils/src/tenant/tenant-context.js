const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * Tenant Context Provider
 * 
 * Manages multi-tenant context across the ecosystem:
 * - Tenant identification from request (domain, header, path)
 * - Tenant configuration loading
 * - Tenant-specific settings (theme, currency, language)
 * - Tenant isolation enforcement
 * 
 * TENANT TYPES:
 * - platform: Main SiamSiam platform
 * - store: Individual merchant store (choppies.axion.zw)
 * - partner: Integration partners with custom branding
 * 
 * IDENTIFICATION METHODS:
 * 1. Custom domain: choppies.axion.zw -> tenant_choppies
 * 2. Tenant header: x-tenant-id: choppies
 * 3. Path prefix: /t/choppies/products
 * 
 * @example
 *   const tenantCtx = require('@siamsiam/shared-utils').tenant.tenantContext;
 *   
 *   const tenant = tenantCtx.identifyTenant(req);
 *   console.log(tenant.tenantId); // 'choppies'
 */

class TenantContext {
  constructor() {
    this.defaultTenant = config.multiTenancy.defaultTenant || 'siamsiam';
    this.tenantHeader = config.multiTenancy.tenantHeader || 'x-tenant-id';
    
    // Registered tenants
    this.tenants = new Map();
    
    // Domain-to-tenant mapping cache
    this.domainCache = new Map();
  }

  /**
   * Identify tenant from Express request
   * @param {Object} req - Express request object
   * @returns {Object} Tenant context
   */
  identifyTenant(req) {
    let tenantId = null;
    let source = 'default';

    // Method 1: Custom domain
    const hostname = req.hostname || req.get('host') || '';
    if (hostname && config.multiTenancy.enabled) {
      tenantId = this._resolveFromDomain(hostname);
      if (tenantId) source = 'domain';
    }

    // Method 2: Tenant header
    if (!tenantId) {
      const headerValue = req.headers[this.tenantHeader];
      if (headerValue && this.tenants.has(headerValue)) {
        tenantId = headerValue;
        source = 'header';
      }
    }

    // Method 3: Path prefix (/t/tenantId/...)
    if (!tenantId && req.path && req.path.startsWith('/t/')) {
      const parts = req.path.split('/');
      if (parts.length > 2 && this.tenants.has(parts[2])) {
        tenantId = parts[2];
        source = 'path';
      }
    }

    // Fallback to default
    if (!tenantId) {
      tenantId = this.defaultTenant;
      source = 'default';
    }

    const tenant = this.tenants.get(tenantId) || this._getDefaultTenantConfig();

    return {
      tenantId,
      tenantName: tenant.name || tenantId,
      isDefaultTenant: tenantId === this.defaultTenant,
      source,
      config: tenant,
      features: tenant.features || {},
      theme: tenant.theme || {},
      settings: tenant.settings || {},
    };
  }

  /**
   * Register a tenant
   * @param {string} tenantId - Tenant identifier
   * @param {Object} tenantConfig - Tenant configuration
   */
  registerTenant(tenantId, tenantConfig = {}) {
    const config = {
      id: tenantId,
      name: tenantConfig.name || tenantId,
      displayName: tenantConfig.displayName || tenantId,
      domains: tenantConfig.domains || [],
      features: tenantConfig.features || {},
      theme: tenantConfig.theme || {},
      settings: tenantConfig.settings || {},
      registeredAt: new Date().toISOString(),
      isActive: tenantConfig.isActive !== false,
      databaseName: tenantConfig.databaseName || `tenant_${tenantId}`,
      storageBucket: tenantConfig.storageBucket || `siamsiam-${tenantId}`,
    };

    this.tenants.set(tenantId, config);

    // Update domain cache
    if (config.domains && config.domains.length > 0) {
      for (const domain of config.domains) {
        this.domainCache.set(domain.toLowerCase(), tenantId);
      }
    }

    logger.info('Tenant registered', { tenantId, name: config.name });
    return config;
  }

  /**
   * Get tenant configuration
   * @param {string} tenantId - Tenant identifier
   * @returns {Object|null} Tenant configuration
   */
  getTenant(tenantId) {
    return this.tenants.get(tenantId) || null;
  }

  /**
   * Check if tenant exists
   * @param {string} tenantId - Tenant identifier
   * @returns {boolean} True if tenant exists
   */
  hasTenant(tenantId) {
    return this.tenants.has(tenantId);
  }

  /**
   * Get all registered tenants
   * @returns {Array} List of tenant IDs and names
   */
  getAllTenants() {
    return Array.from(this.tenants.entries()).map(([id, config]) => ({
      id,
      name: config.name,
      displayName: config.displayName,
      isActive: config.isActive,
      domains: config.domains,
    }));
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Resolve tenant from domain name
   * @private
   */
  _resolveFromDomain(hostname) {
    const cleaned = hostname.toLowerCase().replace(/:\d+$/, ''); // Remove port
    
    // Check direct domain match
    if (this.domainCache.has(cleaned)) {
      return this.domainCache.get(cleaned);
    }

    // Check subdomain match
    for (const [domain, tenantId] of this.domainCache) {
      if (cleaned.endsWith(`.${domain}`)) {
        return tenantId;
      }
    }

    return null;
  }

  /**
   * Get default tenant configuration
   * @private
   */
  _getDefaultTenantConfig() {
    return {
      id: this.defaultTenant,
      name: 'SiamSiam',
      displayName: 'SiamSiam',
      features: {},
      theme: {},
      settings: {},
      isActive: true,
    };
  }
}

// Export singleton instance
module.exports = new TenantContext();