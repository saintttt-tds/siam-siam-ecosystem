/**
 * Shared Models - Main Entry Point
 * 
 * Central registry of all database models used across
 * the SiamSiam ecosystem. Each model represents a
 * database table with its schema, relationships,
 * and business logic methods.
 */

module.exports = {
  // Base model and mixins
  BaseModel: require('./base-model'),
  SoftDeleteMixin: require('./soft-delete-mixin'),
  ArchiveMixin: require('./archive-mixin'),
  AuditMixin: require('./audit-mixin'),
  EncryptionMixin: require('./encryption-mixin'),

  // User & Authentication
  User: require('./user'),
  UserSession: require('./user-session'),
  UserDevice: require('./user-device'),
  MfaMethod: require('./mfa-method'),
  MfaBackupCode: require('./mfa-backup-code'),

  // Financial
  Transaction: require('./transaction'),
  TransactionLog: require('./transaction-log'),
  Wallet: require('./wallet'),
  WalletTransaction: require('./wallet-transaction'),
  ExchangeRate: require('./exchange-rate'),

  // Commerce
  Product: require('./product'),
  Order: require('./order'),
  OrderItem: require('./order-item'),
  Address: require('./address'),
  Merchant: require('./merchant'),

  // Delivery
  Delivery: require('./delivery'),
  DeliveryTracking: require('./delivery-tracking'),
  Driver: require('./driver'),
  Drone: require('./drone'),

  // Notifications
  Notification: require('./notification'),
  NotificationTemplate: require('./notification-template'),

  // Admin & Audit
  AdminAuditLog: require('./admin-audit-log'),
  AdminRole: require('./admin-role'),
  SecurityEvent: require('./security-event'),

  // Developer API
  Developer: require('./developer'),
  ApiApplication: require('./api-application'),
  ApiKey: require('./api-key'),
  ApiRequestLog: require('./api-request-log'),
  WebhookEndpoint: require('./webhook-endpoint'),
  WebhookDelivery: require('./webhook-delivery'),

  // Complaints
  Complaint: require('./complaint'),
  ComplaintEscalation: require('./complaint-escalation'),

  // USSD
  UssdSession: require('./ussd-session'),
  UssdTransaction: require('./ussd-transaction'),
  UssdMenu: require('./ussd-menu'),

  // Corporate
  CorporateEntity: require('./corporate-entity'),
  CorporateDirector: require('./corporate-director'),
  CorporateDocument: require('./corporate-document'),

  // FX Trading
  FxTrade: require('./fx-trade'),
  FxQuote: require('./fx-quote'),
  FxLimit: require('./fx-limit'),
  FxCollateral: require('./fx-collateral'),
  FxSettlement: require('./fx-settlement'),
  FxHedge: require('./fx-hedge'),

  // Bill Payments
  BillPayment: require('./bill-payment'),
  Biller: require('./biller'),
  BillerCategory: require('./biller-category'),
  SchoolFeesPayment: require('./school-fees-payment'),
  School: require('./school'),
  Student: require('./student'),
  SchoolTerm: require('./school-term'),

  // POS
  PosDevice: require('./pos-device'),
  PosTransaction: require('./pos-transaction'),
  PosOfflineQueue: require('./pos-offline-queue'),

  // Gift & Proxy
  GiftOrder: require('./gift-order'),
  GiftRegistry: require('./gift-registry'),
  ProxyPurchase: require('./proxy-purchase'),

  // Refunds
  RefundPolicy: require('./refund-policy'),
  RefundRequest: require('./refund-request'),
  RefundApproval: require('./refund-approval'),

  // Referral
  Referral: require('./referral'),
  ReferralCommission: require('./referral-commission'),

  // Unified Account
  UnifiedAccount: require('./unified-account'),
  PlatformLink: require('./platform-link'),
  SsoSession: require('./sso-session'),

  // Data Lifecycle
  ArchivedRecord: require('./archived-record'),
  RecoveryToken: require('./recovery-token'),
  PurgeLog: require('./purge-log'),
  RetentionPolicy: require('./retention-policy'),

  // Configuration
  Country: require('./country'),
  Currency: require('./currency'),
  CustomDomain: require('./custom-domain'),
  StoreTheme: require('./store-theme'),
  StoreVerification: require('./store-verification'),
};