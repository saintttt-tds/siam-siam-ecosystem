/**
 * Refunds Module Index
 * 
 * Complete refund processing system with policy management,
 * eligibility checking, amount calculation, and method routing.
 */

module.exports = {
  refundPolicyEngine: require('./refund-policy-engine'),
  refundEligibilityChecker: require('./refund-eligibility-checker'),
  refundAmountCalculator: require('./refund-amount-calculator'),
  refundTimelineCalculator: require('./refund-timeline-calculator'),
  refundMethodRouter: require('./refund-method-router'),
  restockingFeeCalculator: require('./restocking-fee-calculator'),
  partialRefundCalculator: require('./partial-refund-calculator'),
};