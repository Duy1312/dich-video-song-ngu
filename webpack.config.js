const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const commonConfig = {
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: { loader: 'babel-loader', options: { presets: ['@babel/preset-env'] } },
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({ filename: '[name].css' }),
  ],
};

const chromeConfig = {
  ...commonConfig,
  name: 'chrome',
  entry: {
    'background/service-worker': './src/background/service-worker.js',
    'content/index': './src/content/index.js',
    'popup/popup': './src/popup/popup.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist/chrome'),
    filename: '[name].js',
    clean: true,
  },
  plugins: [
    ...commonConfig.plugins,
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/popup/popup.html', to: 'popup/popup.html' },
        { from: 'icons', to: 'icons' },
        { from: '_locales', to: '_locales' },
      ],
    }),
  ],
};

module.exports = [chromeConfig];
