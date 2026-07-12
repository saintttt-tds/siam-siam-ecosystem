// packages/shared-config/babel-config.js
/**
 * Shared Babel Configuration
 * 
 * Transpilation configuration for consistent JavaScript output.
 */
module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: '18.0.0',
        },
        modules: 'commonjs',
        useBuiltIns: 'usage',
        corejs: 3,
      },
    ],
  ],
  plugins: [
    '@babel/plugin-proposal-optional-chaining',
    '@babel/plugin-proposal-nullish-coalescing-operator',
    [
      '@babel/plugin-transform-runtime',
      {
        regenerator: true,
      },
    ],
  ],
  env: {
    test: {
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    },
    production: {
      plugins: [
        'transform-remove-console',
        'transform-remove-debugger',
      ],
    },
  },
  sourceMaps: true,
  retainLines: true,
};