// Screen Time extension; the logic lives in modules/screen-time/core.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: 'shield-config',
  name: 'ShieldConfiguration',
  bundleIdentifier: '.ShieldConfiguration',
  deploymentTarget: '18.0',
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': ['group.com.projectscaleup.app'],
  },
});
