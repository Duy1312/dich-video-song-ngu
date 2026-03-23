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

const commonEntries = {
  'background/service-worker': './src/background/service-worker.js',
  'content/index': './src/content/index.js',
  'popup/popup': './src/popup/popup.js',
};

const commonCopyPatterns = [
  { from: 'src/popup/popup.html', to: 'popup/popup.html' },
  { from: 'src/popup/popup.css', to: 'popup/popup.css' },
  { from: 'icons', to: 'icons' },
  { from: '_locales', to: '_locales' },
];

const chromeConfig = {
  ...commonConfig,
  name: 'chrome',
  entry: { ...commonEntries },
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
        ...commonCopyPatterns,
      ],
    }),
  ],
};

const firefoxConfig = {
  ...commonConfig,
  name: 'firefox',
  entry: { ...commonEntries },
  output: {
    path: path.resolve(__dirname, 'dist/firefox'),
    filename: '[name].js',
    clean: true,
  },
  plugins: [
    ...commonConfig.plugins,
    new CopyPlugin({
      patterns: [
        { from: 'manifest.firefox.json', to: 'manifest.json' },
        ...commonCopyPatterns,
      ],
    }),
  ],
};

const edgeConfig = {
  ...commonConfig,
  name: 'edge',
  entry: { ...commonEntries },
  output: {
    path: path.resolve(__dirname, 'dist/edge'),
    filename: '[name].js',
    clean: true,
  },
  plugins: [
    ...commonConfig.plugins,
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        ...commonCopyPatterns,
      ],
    }),
  ],
};

module.exports = [chromeConfig, firefoxConfig, edgeConfig];
