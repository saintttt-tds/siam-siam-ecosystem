const BaseModel = require('./base-model');
const SoftDeleteMixin = require('./soft-delete-mixin');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Product Model - Product Listing
 * 
 * Core product entity for the marketplace. Manages product information,
 * pricing, inventory, variants, media, SEO, and categorization.
 * 
 * TABLE: products
 * 
 * PRODUCT TYPES:
 * - physical: Tangible goods requiring shipping
 * - digital: Downloadable products, licenses, keys
 * - service: Bookable services
 * - subscription: Recurring subscription products
 * - bundle: Product bundles/collections
 * - variable: Products with variants (size, color, etc.)
 */

class Product extends BaseModel {
  static tableName = 'products';
  static primaryKey = 'id';
  static softDelete = true;
  
  static fields = [
    'id', 'merchant_id', 'store_id',
    // Identity
    'name', 'slug', 'description', 'short_description',
    'sku', 'barcode', 'upc', 'ean', 'isbn',
    'product_type', 'brand', 'manufacturer',
    'manufacturer_part_number', 'model_number',
    // Classification
    'category', 'sub_category', 'category_path',
    'tags', 'labels', 'collections',
    'is_featured', 'is_new', 'is_bestseller',
    'is_trending', 'is_recommended',
    // Pricing
    'price', 'compare_at_price', 'cost_price',
    'currency', 'taxable', 'tax_code', 'tax_rate',
    'wholesale_price', 'bulk_pricing',
    'minimum_price', 'maximum_price',
    'price_tiers', 'subscription_pricing',
    // Inventory
    'quantity', 'inventory_tracking',
    'inventory_policy', 'low_stock_threshold',
    'backorder_allowed', 'backorder_limit',
    'available_for_preorder', 'preorder_release_date',
    'sold_count', 'reserved_count',
    // Variants
    'has_variants', 'variant_type', 'variant_options',
    'default_variant_id', 'variant_attributes',
    // Dimensions & Shipping
    'weight', 'weight_unit', 'length', 'width',
    'height', 'dimension_unit', 'volumetric_weight',
    'requires_shipping', 'shipping_class',
    'shipping_profile', 'free_shipping',
    'shipping_weight_override', 'handling_fee',
    // Fulfillment
    'fulfillment_type', 'fulfillment_service',
    'warehouse_id', 'pickup_available',
    'pickup_location_id', 'fulfillment_days',
    // Digital product
    'is_digital', 'digital_file_url', 'digital_file_type',
    'digital_file_size', 'download_limit',
    'download_expiry_days', 'license_type',
    'license_duration_days',
    // Media
    'images', 'featured_image', 'image_alt_text',
    'video_url', 'video_embed', 'three_d_model_url',
    'ar_model_url', 'virtual_try_on_url',
    'media_gallery',
    // SEO
    'seo_title', 'seo_description', 'seo_keywords',
    'canonical_url', 'structured_data',
    'meta_robots', 'og_title', 'og_description',
    'og_image', 'twitter_title', 'twitter_description',
    // Availability
    'is_active', 'is_visible', 'is_available',
    'available_from', 'available_until',
    'visibility', 'published_at', 'unpublished_at',
    'published_status', 'draft_data',
    // Ratings & Reviews
    'average_rating', 'rating_count', 'review_count',
    'recommended_percent', 'verified_purchase_percent',
    'sentiment_score',
    // Performance
    'view_count', 'cart_add_count', 'purchase_count',
    'return_count', 'refund_count', 'conversion_rate',
    'search_ranking', 'popularity_score',
    // Customization
    'customizable', 'customization_options',
    'engraving_available', 'personalization_fields',
    // Compliance
    'warranty_info', 'warranty_duration_months',
    'return_policy', 'return_window_days',
    'refund_policy', 'safety_info',
    'age_restriction', 'age_minimum',
    'hazardous_material', 'dangerous_goods',
    'country_of_origin', 'hs_code',
    // Related products
    'related_products', 'upsell_products',
    'cross_sell_products', 'frequently_bought_together',
    // Vendor/Supplier
    'supplier_id', 'supplier_sku',
    'supplier_price', 'supplier_minimum_order',
    'lead_time_days', 'reorder_point', 'reorder_quantity',
    // Metadata
    'specifications', 'attributes', 'custom_fields',
    'metadata', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
    'deleted_at', 'deleted_by',
  ];

  static casts = {
    tags: 'json', labels: 'json', collections: 'json',
    bulk_pricing: 'json', price_tiers: 'json',
    subscription_pricing: 'json', variant_options: 'json',
    variant_attributes: 'json', images: 'json',
    media_gallery: 'json', structured_data: 'json',
    draft_data: 'json', customization_options: 'json',
    personalization_fields: 'json', related_products: 'json',
    upsell_products: 'json', cross_sell_products: 'json',
    frequently_bought_together: 'json',
    specifications: 'json', attributes: 'json',
    custom_fields: 'json', metadata: 'json',
    price: 'float', compare_at_price: 'float',
    cost_price: 'float', wholesale_price: 'float',
    minimum_price: 'float', maximum_price: 'float',
    tax_rate: 'float', weight: 'float',
    length: 'float', width: 'float', height: 'float',
    volumetric_weight: 'float', handling_fee: 'float',
    digital_file_size: 'float', average_rating: 'float',
    recommended_percent: 'float', verified_purchase_percent: 'float',
    sentiment_score: 'float', conversion_rate: 'float',
    search_ranking: 'float', popularity_score: 'float',
    supplier_price: 'float', quantity: 'integer',
    sold_count: 'integer', reserved_count: 'integer',
    low_stock_threshold: 'integer', backorder_limit: 'integer',
    download_limit: 'integer', download_expiry_days: 'integer',
    license_duration_days: 'integer', fulfillment_days: 'integer',
    rating_count: 'integer', review_count: 'integer',
    view_count: 'integer', cart_add_count: 'integer',
    purchase_count: 'integer', return_count: 'integer',
    refund_count: 'integer', warranty_duration_months: 'integer',
    return_window_days: 'integer', age_minimum: 'integer',
    supplier_minimum_order: 'integer', lead_time_days: 'integer',
    reorder_point: 'integer', reorder_quantity: 'integer',
    is_active: 'boolean', is_visible: 'boolean',
    is_available: 'boolean', is_featured: 'boolean',
    is_new: 'boolean', is_bestseller: 'boolean',
    is_trending: 'boolean', is_recommended: 'boolean',
    taxable: 'boolean', has_variants: 'boolean',
    inventory_tracking: 'boolean', backorder_allowed: 'boolean',
    available_for_preorder: 'boolean', requires_shipping: 'boolean',
    free_shipping: 'boolean', is_digital: 'boolean',
    customizable: 'boolean', engraving_available: 'boolean',
    pickup_available: 'boolean', hazardous_material: 'boolean',
    dangerous_goods: 'boolean',
  };

  static relations = {
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
    media: { type: 'hasMany', model: 'ProductMedia', foreignKey: 'product_id', localKey: 'id' },
    threeDModel: { type: 'hasOne', model: 'Product3dModel', foreignKey: 'product_id', localKey: 'id' },
    reviews: { type: 'hasMany', model: 'StoreRating', foreignKey: 'product_id', localKey: 'id' },
  };

  static productTypes = {
    PHYSICAL: 'physical', DIGITAL: 'digital', SERVICE: 'service',
    SUBSCRIPTION: 'subscription', BUNDLE: 'bundle', VARIABLE: 'variable',
  };

  static publishedStatuses = {
    DRAFT: 'draft', PUBLISHED: 'published', SCHEDULED: 'scheduled',
    ARCHIVED: 'archived', UNDER_REVIEW: 'under_review', REJECTED: 'rejected',
  };

  static generateSlug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
  }

  /**
   * Create a new product
   */
  static async createProduct(merchantId, productData) {
    const slug = productData.slug || this.generateSlug(productData.name);
    const existing = await this.findOne({ where: { slug } });
    if (existing) throw new Error(`Product with slug "${slug}" already exists`);

    return this.create({
      merchant_id: merchantId, store_id: productData.storeId,
      name: productData.name, slug, description: productData.description?.substring(0, 10000),
      short_description: productData.shortDescription?.substring(0, 500),
      sku: productData.sku, barcode: productData.barcode,
      product_type: productData.productType || this.productTypes.PHYSICAL,
      brand: productData.brand, category: productData.category,
      sub_category: productData.subCategory, tags: productData.tags || [],
      price: productData.price, compare_at_price: productData.compareAtPrice,
      cost_price: productData.costPrice, currency: productData.currency || 'USD',
      taxable: productData.taxable !== false, tax_rate: productData.taxRate || 0,
      quantity: productData.quantity || 0, inventory_tracking: productData.inventoryTracking !== false,
      low_stock_threshold: productData.lowStockThreshold || 5,
      weight: productData.weight, weight_unit: productData.weightUnit || 'kg',
      requires_shipping: productData.productType !== this.productTypes.DIGITAL,
      shipping_class: productData.shippingClass,
      is_digital: productData.productType === this.productTypes.DIGITAL,
      images: productData.images || [], featured_image: productData.featuredImage,
      seo_title: productData.seoTitle, seo_description: productData.seoDescription?.substring(0, 300),
      is_active: productData.isActive !== false, is_visible: productData.isVisible !== false,
      published_status: productData.publishedStatus || this.publishedStatuses.DRAFT,
      published_at: productData.publishedStatus === this.publishedStatuses.PUBLISHED ? new Date().toISOString() : null,
      specifications: productData.specifications || {},
      attributes: productData.attributes || {},
      metadata: productData.metadata || {}, tenant_id: productData.tenantId,
    });
  }

  /**
   * Find products by merchant
   */
  static async findByMerchant(merchantId, options = {}) {
    return this.paginate({
      where: { merchant_id: merchantId },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Find products by category
   */
  static async findByCategory(category, options = {}) {
    return this.paginate({
      where: { category, is_active: true, is_visible: true, published_status: this.publishedStatuses.PUBLISHED },
      orderBy: { is_featured: 'DESC', created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Search products
   */
  static async search(query, options = {}) {
    const text = `
      SELECT * FROM ${this.tableName}
      WHERE is_active = true AND is_visible = true
        AND published_status = 'published'
        AND deleted_at IS NULL
        AND (name ILIKE $1 OR description ILIKE $1 OR sku ILIKE $1
             OR barcode ILIKE $1 OR brand ILIKE $1 OR tags::text ILIKE $1)
      ORDER BY ${options.orderBy || 'popularity_score DESC, created_at DESC'}
      LIMIT $2 OFFSET $3
    `;
    const result = await connectionPool.query(text, [`%${query}%`, options.limit || 20, options.offset || 0]);
    return result.rows;
  }

  /**
   * Get featured products
   */
  static async getFeatured(limit = 10) {
    return this.findAll({
      where: { is_featured: true, is_active: true, is_visible: true, published_status: this.publishedStatuses.PUBLISHED },
      orderBy: { popularity_score: 'DESC' },
      limit,
    });
  }

  /**
   * Update product stock
   */
  static async updateStock(productId, quantity, operation = 'set') {
    const product = await this.findById(productId);
    if (!product) throw new Error('Product not found');

    let newQuantity;
    switch (operation) {
      case 'add': newQuantity = product.quantity + quantity; break;
      case 'subtract': newQuantity = Math.max(0, product.quantity - quantity); break;
      case 'reserve': newQuantity = product.quantity; break;
      default: newQuantity = quantity;
    }

    const updates = { quantity: newQuantity, reserved_count: operation === 'reserve' ? (product.reserved_count || 0) + quantity : product.reserved_count };
    if (newQuantity <= 0) updates.is_available = false;
    if (newQuantity <= (product.low_stock_threshold || 5)) updates.low_stock_threshold = product.low_stock_threshold;

    return this.update({ id: productId }, updates);
  }

  /**
   * Record product view
   */
  static async recordView(productId) {
    await connectionPool.query(`UPDATE ${this.tableName} SET view_count = view_count + 1 WHERE id = $1`, [productId]);
  }

  /**
   * Update product rating
   */
  static async updateRating(productId, newRating) {
    const product = await this.findById(productId);
    if (!product) return;
    const newCount = (product.rating_count || 0) + 1;
    const newAvg = ((product.average_rating || 0) * (product.rating_count || 0) + newRating) / newCount;
    return this.update({ id: productId }, { average_rating: Math.round(newAvg * 100) / 100, rating_count: newCount });
  }

  /**
   * Get low stock products
   */
  static async getLowStock(merchantId = null, threshold = null) {
    const criteria = { inventory_tracking: true, is_active: true };
    if (merchantId) criteria.merchant_id = merchantId;
    const products = await this.findAll({ where: criteria });
    return products.filter(p => p.quantity <= (threshold || p.low_stock_threshold || 5));
  }
}

Object.assign(Product, SoftDeleteMixin);
module.exports = Product;