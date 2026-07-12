const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Store Theme Model - Custom Store Theme/Branding
 * 
 * Allows merchants to customize their storefront appearance
 * with colors, fonts, layouts, logos, and custom CSS/JS.
 * Supports multiple themes with preview and activation.
 * 
 * TABLE: store_themes
 */

class StoreTheme extends BaseModel {
  static tableName = 'store_themes';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'merchant_id', 'store_id',
    'theme_name', 'theme_slug', 'description',
    'theme_version', 'theme_type',
    'is_active', 'is_default', 'is_premium',
    'preview_url', 'thumbnail_url',
    'colors', 'fonts', 'typography',
    'layout', 'layout_options', 'header_style',
    'footer_style', 'product_grid_style',
    'product_card_style', 'navigation_style',
    'button_style', 'badge_style', 'form_style',
    'logo_url', 'logo_dark_url', 'logo_mobile_url',
    'favicon_url', 'banner_url',
    'custom_css', 'custom_js',
    'custom_header_html', 'custom_footer_html',
    'social_links', 'social_links_style',
    'currency_selector_style', 'language_selector_style',
    'search_bar_style', 'announcement_bar',
    'announcement_bar_style', 'newsletter_style',
    'cart_style', 'checkout_style',
    'mobile_breakpoints', 'tablet_breakpoints',
    'animations', 'transitions',
    'spacing', 'border_radius', 'shadows',
    'created_by_designer', 'designer_name',
    'purchased_from', 'purchase_ref',
    'last_previewed_at', 'published_at',
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    theme_version: 'integer', is_active: 'boolean',
    is_default: 'boolean', is_premium: 'boolean',
    colors: 'json', fonts: 'json', typography: 'json',
    layout: 'json', layout_options: 'json',
    social_links: 'json', mobile_breakpoints: 'json',
    tablet_breakpoints: 'json', animations: 'json',
    transitions: 'json', spacing: 'json',
    border_radius: 'json', shadows: 'json',
    announcement_bar: 'json', metadata: 'json', tags: 'json',
  };

  static relations = {
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
  };

  static themeTypes = {
    BUILT_IN: 'built_in', CUSTOM: 'custom', PURCHASED: 'purchased',
    DEVELOPER: 'developer', IMPORTED: 'imported',
  };

  // Default theme templates
  static defaultThemes = [
    {
      name: 'Default', slug: 'default',
      colors: { primary: '#2C3E50', secondary: '#3498DB', accent: '#E74C3C', background: '#FFFFFF', text: '#333333', heading: '#2C3E50', link: '#3498DB', border: '#E0E0E0', success: '#27AE60', warning: '#F39C12', error: '#E74C3C' },
      fonts: { heading: 'Inter', body: 'Inter', accent: 'Inter' },
      layout: { header: 'standard', footer: 'standard', productGrid: 'grid_4', sidebar: 'left' },
    },
    {
      name: 'Grocery', slug: 'grocery',
      colors: { primary: '#27AE60', secondary: '#2ECC71', accent: '#F39C12', background: '#FAFAFA', text: '#333333', heading: '#1a1a1a' },
      fonts: { heading: 'Poppins', body: 'Open Sans' },
      layout: { header: 'compact', footer: 'minimal', productGrid: 'grid_3', sidebar: 'none' },
    },
    {
      name: 'Fashion', slug: 'fashion',
      colors: { primary: '#1a1a1a', secondary: '#E91E63', accent: '#FF5722', background: '#FFFFFF', text: '#333333', heading: '#1a1a1a' },
      fonts: { heading: 'Playfair Display', body: 'Lato' },
      layout: { header: 'hero', footer: 'expanded', productGrid: 'grid_4', sidebar: 'right' },
    },
    {
      name: 'Electronics', slug: 'electronics',
      colors: { primary: '#0D47A1', secondary: '#2196F3', accent: '#FF6F00', background: '#F5F5F5', text: '#212121' },
      fonts: { heading: 'Roboto', body: 'Roboto' },
      layout: { header: 'mega_menu', footer: 'standard', productGrid: 'grid_5', sidebar: 'left' },
    },
  ];

  /**
   * Create a theme from template
   */
  static async createFromTemplate(merchantId, templateSlug = 'default', options = {}) {
    const template = this.defaultThemes.find(t => t.slug === templateSlug) || this.defaultThemes[0];

    const existing = await this.findOne({ where: { merchant_id: merchantId, theme_slug: templateSlug } });
    if (existing) throw new Error(`Theme "${templateSlug}" already exists for this merchant`);

    return this.create({
      merchant_id: merchantId, store_id: options.storeId,
      theme_name: options.themeName || template.name,
      theme_slug: templateSlug, description: `Default ${template.name} theme`,
      theme_version: 1, theme_type: this.themeTypes.BUILT_IN,
      is_active: true, is_default: true,
      colors: options.colors || template.colors,
      fonts: options.fonts || template.fonts,
      typography: options.typography || {},
      layout: options.layout || template.layout,
      logo_url: options.logoUrl, favicon_url: options.faviconUrl,
      metadata: options.metadata || {}, tenant_id: options.tenantId,
    });
  }

  /**
   * Activate a theme
   */
  static async activate(merchantId, themeId) {
    await require('@siamsiam/shared-utils').database.connectionPool.query(
      `UPDATE ${this.tableName} SET is_active = false, updated_at = NOW() WHERE merchant_id = $1`,
      [merchantId]
    );
    return this.update({ id: themeId }, { is_active: true, published_at: new Date().toISOString() });
  }

  /**
   * Find active theme by merchant
   */
  static async findByMerchant(merchantId) {
    return this.findOne({ where: { merchant_id: merchantId, is_active: true } });
  }

  /**
   * Get all themes for a merchant
   */
  static async getAllByMerchant(merchantId) {
    return this.findAll({ where: { merchant_id: merchantId }, orderBy: { is_active: 'DESC', created_at: 'DESC' } });
  }
}

module.exports = StoreTheme;