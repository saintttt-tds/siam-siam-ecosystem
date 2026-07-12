// packages/shared-config/webpack-config.js
/**
 * Shared Webpack Configuration
 * 
 * Build configuration for services that need bundling.
 * Most Node.js services run without bundling, but frontend uses this.
 */
const path = require('path');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  
  target: 'node',
  
  entry: './src/index.js',
  
  output: {
    path: path.resolve(process.cwd(), 'dist'),
    filename: 'bundle.js',
    libraryTarget: 'commonjs2',
    clean: true,
  },
  
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: require('./babel-config'),
        },
      },
      {
        test: /\.json$/,
        type: 'json',
      },
    ],
  },
  
  resolve: {
    extensions: ['.js', '.json'],
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  
  externals: [
    // Don't bundle native modules
    /^@siamsiam\//,
    'pg',
    'redis',
    'amqplib',
    'bcryptjs',
    'jsonwebtoken',
    'express',
    'helmet',
    'cors',
    'compression',
  ],
  
  optimization: {
    minimize: process.env.NODE_ENV === 'production',
    nodeEnv: false,
  },
  
  devtool: process.env.NODE_ENV === 'production' ? 'source-map' : 'eval-source-map',
  
  stats: {
    colors: true,
    modules: false,
    children: false,
  },
};