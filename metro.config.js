const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer.babelTransformerPath = require.resolve(
  'react-native-svg-transformer/expo',
);
config.resolver.assetExts = config.resolver.assetExts.filter(
  extension => extension !== 'svg',
);
config.resolver.sourceExts.push('svg');

// expo-sqlite's web backend loads wa-sqlite's WASM binary as an asset;
// Metro doesn't treat .wasm as an asset type by default.
config.resolver.assetExts.push('wasm');

// expo-sqlite's web backend runs SQLite in a worker over SharedArrayBuffer,
// which browsers only expose to cross-origin-isolated pages.
const { enhanceMiddleware } = config.server;
config.server.enhanceMiddleware = (middleware, metroServer) => {
  const withEnhancer = enhanceMiddleware
    ? enhanceMiddleware(middleware, metroServer)
    : middleware;

  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    withEnhancer(req, res, next);
  };
};

module.exports = config;
