const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Product 3D Model Model - 3D Product Model
 * 
 * Stores 3D model data for products enabling interactive
 * 360-degree viewing, AR preview, and virtual try-on experiences.
 * Supports multiple 3D formats and optimization levels.
 * 
 * TABLE: product_3d_models
 * 
 * SUPPORTED FORMATS:
 * - glTF/GLB: Standard 3D format for web (recommended)
 * - USDZ: Apple AR format for iOS devices
 * - FBX: Autodesk exchange format
 * - OBJ: Wavefront format with MTL materials
 * - STL: Stereolithography for 3D printing preview
 * 
 * OPTIMIZATION LEVELS:
 * - high: Full detail for desktop/web (original quality)
 * - medium: Optimized for tablets and mid-range devices
 * - low: Lightweight for mobile and slow connections
 * - thumbnail: Tiny preview for product cards
 */

class Product3dModel extends BaseModel {
  static tableName = 'product_3d_models';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'product_id', 'merchant_id',
    // Model identification
    'model_name', 'model_format', 'model_version',
    'model_file_url', 'model_file_size_bytes',
    'model_file_hash', 'fallback_model_url',
    // Optimization levels
    'high_quality_url', 'high_quality_size_bytes',
    'medium_quality_url', 'medium_quality_size_bytes',
    'low_quality_url', 'low_quality_size_bytes',
    'thumbnail_url', 'thumbnail_size_bytes',
    // Materials and textures
    'material_url', 'texture_url', 'texture_resolution',
    'normal_map_url', 'roughness_map_url',
    'metallic_map_url', 'ao_map_url',
    'emissive_map_url', 'opacity_map_url',
    // Model metadata
    'polygon_count', 'vertex_count', 'triangle_count',
    'mesh_count', 'material_count', 'texture_count',
    'animation_count', 'bone_count', 'morph_target_count',
    'has_animations', 'has_skeleton', 'has_morph_targets',
    'has_physics', 'has_colliders',
    // Dimensions and scale
    'bounding_box_min', 'bounding_box_max',
    'bounding_box_center', 'model_scale',
    'original_units', 'display_units',
    'width_mm', 'height_mm', 'depth_mm',
    'real_world_scale',
    // Camera and viewing
    'default_camera_position', 'default_camera_target',
    'default_camera_fov', 'default_camera_near',
    'default_camera_far', 'orbit_target',
    'min_zoom', 'max_zoom', 'auto_rotate',
    'auto_rotate_speed', 'enable_zoom',
    'enable_pan', 'enable_damping',
    // Lighting
    'environment_map_url', 'light_intensity',
    'ambient_light_color', 'ambient_light_intensity',
    'directional_light_position', 'directional_light_color',
    'directional_light_intensity', 'shadow_enabled',
    'shadow_softness',
    // Background and environment
    'background_color', 'background_image_url',
    'show_environment', 'environment_blur',
    'reflection_intensity',
    // AR support
    'ar_enabled', 'ar_scale', 'ar_placement_type',
    'ar_anchor_point', 'ar_shadow_enabled',
    'usdz_url', 'reality_composer_url',
    // Virtual try-on
    'virtual_try_on_enabled', 'try_on_body_part',
    'try_on_anchor_points', 'try_on_calibration_url',
    // Interactions
    'allow_spin', 'allow_zoom', 'allow_pan',
    'allow_reset', 'show_controls', 'show_annotations',
    'annotations', 'hotspots',
    // Performance
    'loading_strategy', 'progressive_loading',
    'draco_compressed', 'ktx2_textures',
    'meshopt_compressed',
    // Status
    'is_active', 'is_processed', 'processing_status',
    'processing_error', 'processed_at',
    'is_verified', 'verified_at', 'verified_by',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    bounding_box_min: 'json', bounding_box_max: 'json',
    bounding_box_center: 'json', model_scale: 'float',
    default_camera_position: 'json', default_camera_target: 'json',
    default_camera_fov: 'float', default_camera_near: 'float',
    default_camera_far: 'float', orbit_target: 'json',
    min_zoom: 'float', max_zoom: 'float',
    auto_rotate_speed: 'float', ambient_light_color: 'json',
    ambient_light_intensity: 'float',
    directional_light_position: 'json', directional_light_color: 'json',
    directional_light_intensity: 'float', shadow_softness: 'float',
    background_color: 'json', environment_blur: 'float',
    reflection_intensity: 'float', ar_scale: 'float',
    ar_anchor_point: 'json', try_on_anchor_points: 'json',
    annotations: 'json', hotspots: 'json',
    model_file_size_bytes: 'integer', high_quality_size_bytes: 'integer',
    medium_quality_size_bytes: 'integer', low_quality_size_bytes: 'integer',
    thumbnail_size_bytes: 'integer', polygon_count: 'integer',
    vertex_count: 'integer', triangle_count: 'integer',
    mesh_count: 'integer', material_count: 'integer',
    texture_count: 'integer', animation_count: 'integer',
    bone_count: 'integer', morph_target_count: 'integer',
    width_mm: 'float', height_mm: 'float', depth_mm: 'float',
    light_intensity: 'float',
    has_animations: 'boolean', has_skeleton: 'boolean',
    has_morph_targets: 'boolean', has_physics: 'boolean',
    has_colliders: 'boolean', auto_rotate: 'boolean',
    enable_zoom: 'boolean', enable_pan: 'boolean',
    enable_damping: 'boolean', shadow_enabled: 'boolean',
    show_environment: 'boolean', ar_enabled: 'boolean',
    ar_shadow_enabled: 'boolean', virtual_try_on_enabled: 'boolean',
    allow_spin: 'boolean', allow_zoom: 'boolean',
    allow_pan: 'boolean', allow_reset: 'boolean',
    show_controls: 'boolean', show_annotations: 'boolean',
    progressive_loading: 'boolean', draco_compressed: 'boolean',
    ktx2_textures: 'boolean', meshopt_compressed: 'boolean',
    real_world_scale: 'boolean',
    is_active: 'boolean', is_processed: 'boolean',
    is_verified: 'boolean', metadata: 'json', tags: 'json',
  };

  static relations = {
    product: { type: 'belongsTo', model: 'Product', foreignKey: 'product_id', ownerKey: 'id' },
  };

  static modelFormats = {
    GLTF: 'gltf', GLB: 'glb', USDZ: 'usdz',
    FBX: 'fbx', OBJ: 'obj', STL: 'stl',
  };

  static processingStatuses = {
    PENDING: 'pending', PROCESSING: 'processing',
    COMPLETED: 'completed', FAILED: 'failed',
    OPTIMIZING: 'optimizing',
  };

  static arPlacementTypes = {
    FLOOR: 'floor', WALL: 'wall', SURFACE: 'surface',
    ANCHOR: 'anchor', FACE: 'face', BODY: 'body',
  };

  /**
   * Upload a 3D model for a product
   */
  static async uploadModel(productId, merchantId, modelData) {
    const existing = await this.findOne({ where: { product_id: productId } });
    if (existing) {
      // Replace existing model
      return this.update({ id: existing.id }, {
        model_file_url: modelData.modelFileUrl,
        model_format: modelData.modelFormat || this.modelFormats.GLB,
        model_file_size_bytes: modelData.fileSizeBytes,
        model_file_hash: modelData.fileHash,
        model_name: modelData.modelName || `Model-${productId}`,
        model_version: (existing.model_version || 0) + 1,
        is_processed: false,
        processing_status: this.processingStatuses.PENDING,
        updated_at: new Date().toISOString(),
      });
    }

    return this.create({
      product_id: productId, merchant_id: merchantId,
      model_name: modelData.modelName || `Model-${productId}`,
      model_format: modelData.modelFormat || this.modelFormats.GLB,
      model_version: 1,
      model_file_url: modelData.modelFileUrl,
      model_file_size_bytes: modelData.fileSizeBytes,
      model_file_hash: modelData.fileHash,
      fallback_model_url: modelData.fallbackModelUrl,
      ar_enabled: modelData.arEnabled || false,
      ar_scale: modelData.arScale || 1.0,
      ar_placement_type: modelData.arPlacementType || this.arPlacementTypes.FLOOR,
      usdz_url: modelData.usdzUrl,
      virtual_try_on_enabled: modelData.virtualTryOnEnabled || false,
      try_on_body_part: modelData.tryOnBodyPart,
      allow_spin: true, allow_zoom: true, allow_pan: true,
      show_controls: true, auto_rotate: true,
      is_active: true, is_processed: false,
      processing_status: this.processingStatuses.PENDING,
      metadata: modelData.metadata || {},
      tenant_id: modelData.tenantId,
    });
  }

  /**
   * Find model by product
   */
  static async findByProduct(productId) {
    return this.findOne({ where: { product_id: productId, is_active: true } });
  }

  /**
   * Update optimization levels after processing
   */
  static async updateOptimizations(modelId, optimizations) {
    return this.update({ id: modelId }, {
      high_quality_url: optimizations.highQualityUrl,
      high_quality_size_bytes: optimizations.highQualitySize,
      medium_quality_url: optimizations.mediumQualityUrl,
      medium_quality_size_bytes: optimizations.mediumQualitySize,
      low_quality_url: optimizations.lowQualityUrl,
      low_quality_size_bytes: optimizations.lowQualitySize,
      thumbnail_url: optimizations.thumbnailUrl,
      polygon_count: optimizations.polygonCount,
      vertex_count: optimizations.vertexCount,
      triangle_count: optimizations.triangleCount,
      is_processed: true,
      processing_status: this.processingStatuses.COMPLETED,
      processed_at: new Date().toISOString(),
      bounding_box_min: optimizations.boundingBoxMin,
      bounding_box_max: optimizations.boundingBoxMax,
      width_mm: optimizations.widthMm,
      height_mm: optimizations.heightMm,
      depth_mm: optimizations.depthMm,
    });
  }

  /**
   * Mark processing as failed
   */
  static async markProcessingFailed(modelId, error) {
    return this.update({ id: modelId }, {
      processing_status: this.processingStatuses.FAILED,
      processing_error: error?.substring(0, 1000),
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Record model view (analytics)
   */
  static async recordView(modelId) {
    await connectionPool.query(
      `UPDATE ${this.tableName} SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{totalViews}', COALESCE(metadata->>'totalViews', '0')::int + 1) WHERE id = $1`,
      [modelId]
    );
  }
}

module.exports = Product3dModel;