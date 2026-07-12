const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Return Label Model - Return Shipping Label
 * 
 * Generates and manages return shipping labels for customer returns.
 * Supports multiple carriers, label formats, and tracking integration.
 * 
 * TABLE: return_labels
 */

class ReturnLabel extends BaseModel {
  static tableName = 'return_labels';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'refund_request_id', 'order_id', 'order_item_id',
    'user_id', 'merchant_id',
    'label_number', 'label_type', 'label_format',
    'label_url', 'label_pdf_url', 'label_png_url',
    'label_zpl_url', 'label_status',
    'carrier', 'carrier_service', 'carrier_account',
    'tracking_number', 'tracking_url',
    'rma_number', 'return_authorization_code',
    'sender_name', 'sender_company', 'sender_address_line1',
    'sender_address_line2', 'sender_city', 'sender_state',
    'sender_postal_code', 'sender_country', 'sender_phone',
    'recipient_name', 'recipient_company',
    'recipient_address_line1', 'recipient_address_line2',
    'recipient_city', 'recipient_state',
    'recipient_postal_code', 'recipient_country',
    'recipient_phone', 'recipient_email',
    'package_weight_kg', 'package_length_cm',
    'package_width_cm', 'package_height_cm',
    'package_description', 'package_value',
    'package_currency', 'package_quantity',
    'is_prepaid', 'shipping_cost', 'shipping_currency',
    'cost_billed_to', 'insurance_amount',
    'signature_required', 'adult_signature_required',
    'saturday_delivery', 'hazardous_materials',
    'reference_1', 'reference_2', 'instructions',
    'generated_at', 'generated_by', 'generation_method',
    'expires_at', 'is_used', 'used_at',
    'voided_at', 'void_reason',
    'scanned_at', 'scanned_location',
    'delivered_at', 'delivery_status',
    'delivery_exception', 'delivery_exception_description',
    'carrier_response', 'carrier_response_code',
    'label_cost', 'label_cost_currency',
    'download_count', 'last_downloaded_at',
    'reprint_count', 'last_reprinted_at',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    package_weight_kg: 'float', package_length_cm: 'float',
    package_width_cm: 'float', package_height_cm: 'float',
    package_value: 'float', shipping_cost: 'float',
    insurance_amount: 'float', label_cost: 'float',
    package_quantity: 'integer', download_count: 'integer',
    reprint_count: 'integer',
    is_prepaid: 'boolean', signature_required: 'boolean',
    adult_signature_required: 'boolean', saturday_delivery: 'boolean',
    hazardous_materials: 'boolean', is_used: 'boolean',
    metadata: 'json', tags: 'json',
  };

  static relations = {
    refundRequest: { type: 'belongsTo', model: 'RefundRequest', foreignKey: 'refund_request_id', ownerKey: 'id' },
    order: { type: 'belongsTo', model: 'Order', foreignKey: 'order_id', ownerKey: 'id' },
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
  };

  static carriers = {
    DHL: 'dhl', FEDEX: 'fedex', UPS: 'ups', USPS: 'usps',
    LOCAL_COURIER: 'local_courier', PICKUP: 'pickup',
  };

  static labelStatuses = {
    GENERATED: 'generated', DOWNLOADED: 'downloaded',
    USED: 'used', IN_TRANSIT: 'in_transit', DELIVERED: 'delivered',
    EXPIRED: 'expired', VOIDED: 'voided', ERROR: 'error',
  };

  static generateLabelNumber() { return `RMA-${Date.now().toString(36).toUpperCase()}`; }
  static generateRMAnumber() { return `RMA-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; }

  /**
   * Generate a return label
   */
  static async generate(refundRequestId, orderId, userId, labelDetails) {
    const labelNumber = this.generateLabelNumber();
    const rmaNumber = this.generateRMAnumber();

    return this.create({
      refund_request_id: refundRequestId, order_id: orderId,
      user_id: userId, merchant_id: labelDetails.merchantId,
      label_number: labelNumber, label_type: labelDetails.labelType || 'return',
      label_format: labelDetails.labelFormat || 'pdf',
      label_url: labelDetails.labelUrl, label_pdf_url: labelDetails.labelPdfUrl,
      label_status: this.labelStatuses.GENERATED,
      carrier: labelDetails.carrier || this.carriers.LOCAL_COURIER,
      carrier_service: labelDetails.carrierService,
      tracking_number: labelDetails.trackingNumber,
      tracking_url: labelDetails.trackingUrl,
      rma_number: rmaNumber, return_authorization_code: labelDetails.authorizationCode,
      sender_name: labelDetails.senderName || labelDetails.recipientName,
      sender_address_line1: labelDetails.senderAddressLine1 || labelDetails.recipientAddressLine1,
      sender_city: labelDetails.senderCity || labelDetails.recipientCity,
      sender_country: labelDetails.senderCountry || labelDetails.recipientCountry,
      sender_phone: labelDetails.senderPhone || labelDetails.recipientPhone,
      recipient_name: labelDetails.recipientName || labelDetails.merchantName,
      recipient_address_line1: labelDetails.recipientAddressLine1 || labelDetails.merchantAddressLine1,
      recipient_city: labelDetails.recipientCity || labelDetails.merchantCity,
      recipient_country: labelDetails.recipientCountry || labelDetails.merchantCountry,
      recipient_phone: labelDetails.recipientPhone || labelDetails.merchantPhone,
      package_weight_kg: labelDetails.packageWeightKg,
      package_description: labelDetails.packageDescription,
      is_prepaid: labelDetails.isPrepaid !== false,
      shipping_cost: labelDetails.shippingCost || 0,
      shipping_currency: labelDetails.shippingCurrency || 'USD',
      cost_billed_to: labelDetails.costBilledTo || 'merchant',
      generated_at: new Date().toISOString(),
      generated_by: labelDetails.generatedBy || 'system',
      generation_method: labelDetails.generationMethod || 'auto',
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      instructions: labelDetails.instructions?.substring(0, 1000),
      metadata: labelDetails.metadata || {}, tenant_id: labelDetails.tenantId,
    });
  }

  /**
   * Find label by refund request
   */
  static async findByRefundRequest(refundRequestId) {
    return this.findOne({ where: { refund_request_id: refundRequestId }, orderBy: { created_at: 'DESC' } });
  }

  /**
   * Record label download
   */
  static async recordDownload(labelId) {
    return this.update({ id: labelId }, {
      label_status: this.labelStatuses.DOWNLOADED,
      download_count: connectionPool.raw('download_count + 1'),
      last_downloaded_at: new Date().toISOString(),
    });
  }

  /**
   * Void a return label
   */
  static async voidLabel(labelId, reason) {
    return this.update({ id: labelId }, {
      label_status: this.labelStatuses.VOIDED,
      voided_at: new Date().toISOString(),
      void_reason: reason,
    });
  }
}

module.exports = ReturnLabel;