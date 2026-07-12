const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Product Media Model - Product Images/Videos/3D
 * 
 * Manages all product media assets including images, videos,
 * 360-degree spin images, and dimensional photos.
 * Supports CDN integration, image optimization, and responsive variants.
 * 
 * TABLE: product_media
 * 
 * MEDIA TYPES:
 * - image: Standard product image
 * - video: Product video (YouTube, Vimeo, uploaded)
 * - three_sixty: 360-degree spin image set
 * - dimensional: Dimensional/measured photo
 * - ar_preview: Augmented reality preview
 * - document: Product manual/spec sheet
 */

class ProductMedia extends BaseModel {
  static tableName = 'product_media';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'product_id', 'merchant_id',
    // Media identification
    'media_type', 'media_subtype', 'media_purpose',
    'file_name', 'original_file_name', 'file_format',
    'file_size_bytes', 'mime_type',
    // URLs and storage
    'original_url', 'cdn_url', 'local_url',
    'storage_provider', 'storage_bucket', 'storage_key',
    'public_url', 'signed_url', 'signed_url_expires_at',
    // Image variants (responsive)
    'thumbnail_url', 'thumbnail_size_bytes',
    'small_url', 'small_size_bytes', 'small_dimensions',
    'medium_url', 'medium_size_bytes', 'medium_dimensions',
    'large_url', 'large_size_bytes', 'large_dimensions',
    'extra_large_url', 'extra_large_size_bytes',
    'original_dimensions',
    // Image metadata
    'width_px', 'height_px', 'aspect_ratio',
    'resolution_dpi', 'color_space', 'color_profile',
    'has_transparency', 'has_alpha_channel',
    'dominant_colors', 'average_color',
    // Video specific
    'video_url', 'video_embed_url', 'video_platform',
    'video_duration_seconds', 'video_thumbnail_url',
    'video_quality', 'video_codec',
    // 360-degree spin
    'three_sixty_frames', 'three_sixty_frame_count',
    'three_sixty_rotation_axis', 'three_sixty_auto_rotate',
    'three_sixty_drag_speed',
    // AR/Dimensional
    'ar_preview_url', 'dimensional_scale',
    'dimensional_unit', 'dimensional_measurements',
    // Alt text and accessibility
    'alt_text', 'title_text', 'caption',
    'description', 'long_description',
    // Sorting and display
    'sort_order', 'display_order', 'is_primary',
    'is_featured', 'is_hidden', 'is_processed',
    'processing_status', 'processing_error',
    // SEO
    'seo_filename', 'image_sitemap_included',
    // Verification
    'is_verified', 'verified_at', 'verified_by',
    'is_approved', 'approved_at', 'approved_by',
    'rejection_reason',
    // CDN and caching
    'cdn_cache_key', 'cdn_cache_status',
    'cdn_invalidated_at',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    small_dimensions: 'json', medium_dimensions: 'json',
    large_dimensions: 'json', original_dimensions: 'json',
    dominant_colors: 'json', average_color: 'json',
    dimensional_measurements: 'json', metadata: 'json', tags: 'json',
    file_size_bytes: 'integer', thumbnail_size_bytes: 'integer',
    small_size_bytes: 'integer', medium_size_bytes: 'integer',
    large_size_bytes: 'integer', extra_large_size_bytes: 'integer',
    width_px: 'integer', height_px: 'integer',
    resolution_dpi: 'integer', video_duration_seconds: 'integer',
    three_sixty_frame_count: 'integer', sort_order: 'integer',
    display_order: 'integer', aspect_ratio: 'float',
    dimensional_scale: 'float', three_sixty_drag_speed: 'float',
    has_transparency: 'boolean', has_alpha_channel: 'boolean',
    is_primary: 'boolean', is_featured: 'boolean',
    is_hidden: 'boolean', is_processed: 'boolean',
    is_verified: 'boolean', is_approved: 'boolean',
    image_sitemap_included: 'boolean',
    three_sixty_auto_rotate: 'boolean',
  };

  static relations = {
    product: { type: 'belongsTo', model: 'Product', foreignKey: 'product_id', ownerKey: 'id' },
  };

  static mediaTypes = {
    IMAGE: 'image', VIDEO: 'video', THREE_SIXTY: 'three_sixty',
    DIMENSIONAL: 'dimensional', AR_PREVIEW: 'ar_preview',
    DOCUMENT: 'document',
  };

  static mediaPurposes = {
    MAIN: 'main', GALLERY: 'gallery', THUMBNAIL: 'thumbnail',
    ZOOM: 'zoom', SWATCH: 'swatch', LIFESTYLE: 'lifestyle',
    STUDIO: 'studio', PACKAGING: 'packaging', SIZE_CHART: 'size_chart',
    INSTRUCTION: 'instruction', CERTIFICATE: 'certificate',
  };

  /**
   * Add media to a product
   */
  static async addMedia(productId, merchantId, mediaData) {
    const count = await this.count({ where: { product_id: productId } });
    const isFirst = count === 0;

    return this.create({
      product_id: productId, merchant_id: merchantId,
      media_type: mediaData.mediaType || this.mediaTypes.IMAGE,
      media_subtype: mediaData.mediaSubtype,
      media_purpose: mediaData.mediaPurpose || (isFirst ? this.mediaPurposes.MAIN : this.mediaPurposes.GALLERY),
      file_name: mediaData.fileName, original_file_name: mediaData.originalFileName,
      file_format: mediaData.fileFormat, file_size_bytes: mediaData.fileSizeBytes,
      mime_type: mediaData.mimeType,
      original_url: mediaData.originalUrl, cdn_url: mediaData.cdnUrl,
      storage_provider: mediaData.storageProvider || 'aws_s3',
      storage_bucket: mediaData.storageBucket, storage_key: mediaData.storageKey,
      public_url: mediaData.publicUrl,
      thumbnail_url: mediaData.thumbnailUrl,
      small_url: mediaData.smallUrl, medium_url: mediaData.mediumUrl,
      large_url: mediaData.largeUrl,
      width_px: mediaData.widthPx, height_px: mediaData.heightPx,
      aspect_ratio: mediaData.aspectRatio || (mediaData.widthPx && mediaData.heightPx ? mediaData.widthPx / mediaData.heightPx : null),
      alt_text: mediaData.altText?.substring(0, 500),
      title_text: mediaData.titleText?.substring(0, 200),
      caption: mediaData.caption?.substring(0, 500),
      sort_order: mediaData.sortOrder || (count + 1),
      is_primary: mediaData.isPrimary || isFirst,
      is_processed: true, processing_status: 'completed',
      metadata: mediaData.metadata || {}, tenant_id: mediaData.tenantId,
    });
  }

  /**
   * Find media by product
   */
  static async findByProduct(productId, options = {}) {
    return this.findAll({
      where: { product_id: productId, is_hidden: false },
      orderBy: { is_primary: 'DESC', sort_order: 'ASC' },
      ...options,
    });
  }

  /**
   * Find primary media for a product
   */
  static async findPrimary(productId) {
    return this.findOne({
      where: { product_id: productId, is_primary: true, is_hidden: false },
      orderBy: { sort_order: 'ASC' },
    });
  }

  /**
   * Set media as primary
   */
  static async setPrimary(productId, mediaId) {
    await connectionPool.query(
      `UPDATE ${this.tableName} SET is_primary = false, updated_at = NOW() WHERE product_id = $1`,
      [productId]
    );
    return this.update({ id: mediaId }, { is_primary: true, updated_at: new Date().toISOString() });
  }

  /**
   * Reorder media
   */
  static async reorder(productId, mediaIds) {
    for (let i = 0; i < mediaIds.length; i++) {
      await this.update({ id: mediaIds[i] }, { sort_order: i + 1, updated_at: new Date().toISOString() });
    }
  }

  /**
   * Delete media
   */
  static async deleteMedia(mediaId) {
    const media = await this.findById(mediaId);
    if (!media) throw new Error('Media not found');
    
    // If deleting primary, set next as primary
    if (media.is_primary) {
      const next = await this.findOne({
        where: { product_id: media.product_id, id: { operator: '!=', value: mediaId }, is_hidden: false },
        orderBy: { sort_order: 'ASC' },
      });
      if (next) await this.setPrimary(media.product_id, next.id);
    }

    return this.update({ id: mediaId }, { is_hidden: true, is_primary: false, updated_at: new Date().toISOString() });
  }
}

module.exports = ProductMedia;