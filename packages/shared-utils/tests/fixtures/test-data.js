/**
 * Test Fixtures
 * Shared test data used across unit and integration tests
 */

module.exports = {
  users: {
    validUser: {
      id: 'user_123',
      name: 'John Doe',
      email: 'john.doe@example.com',
      phone: '+263771234567',
      role: 'customer',
      isActive: true,
    },
    adminUser: {
      id: 'admin_456',
      name: 'Admin User',
      email: 'admin@siamsiam.com',
      phone: '+263771234568',
      role: 'admin',
      isActive: true,
    },
  },

  transactions: {
    validTransaction: {
      id: 'txn_789',
      userId: 'user_123',
      amount: 100.00,
      currency: 'USD',
      method: 'ecocash',
      status: 'completed',
      reference: 'REF123456',
      createdAt: '2024-01-01T00:00:00Z',
    },
  },

  orders: {
    validOrder: {
      id: 'order_101',
      userId: 'user_123',
      status: 'delivered',
      subtotal: 200.00,
      tax: 30.00,
      shippingCost: 10.00,
      total: 240.00,
      currency: 'USD',
      deliveredAt: '2024-01-01T00:00:00Z',
      items: [
        {
          id: 'item_1',
          name: 'Product A',
          price: 100.00,
          quantity: 2,
          category: 'electronics',
          taxRate: 15,
        },
      ],
    },
  },

  referral: {
    validReferral: {
      id: 'ref_202',
      referrerId: 'user_123',
      code: 'SIAMABC123',
      programId: 'default',
      status: 'active',
    },
  },

  locations: {
    harare: { lat: -17.825, lon: 31.033 },
    bulawayo: { lat: -20.150, lon: 28.583 },
    johannesburg: { lat: -26.204, lon: 28.047 },
  },

  paymentMethods: [
    'ecocash',
    'onemoney',
    'telecash',
    'bank_transfer',
    'card',
    'paypal',
    'wallet',
  ],

  currencies: ['USD', 'ZWL', 'ZAR', 'BWP', 'KES', 'NGN'],

  validPhones: {
    ZW: ['+263771234567', '0771234567', '771234567'],
    ZA: ['+27821234567', '0821234567'],
    KE: ['+254712345678', '0712345678'],
  },

  validEmails: [
    'user@example.com',
    'john.doe@company.co.zw',
    'test.user@sub.domain.com',
  ],

  invalidEmails: [
    'notanemail',
    '@nodomain',
    'no@domain',
    '',
    null,
  ],

  securityTestData: {
    sqlInjectionAttempts: [
      "' OR '1'='1",
      "1; DROP TABLE users;",
      "' UNION SELECT * FROM users--",
    ],
    xssAttempts: [
      '<script>alert("XSS")</script>',
      'javascript:alert("XSS")',
      '<img src="x" onerror="alert(1)">',
    ],
  },
};