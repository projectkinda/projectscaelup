// Removes the `audio` background mode from the iOS Info.plist.
//
// expo-audio's config plugin adds it by default (enableBackgroundPlayback is on
// so Android gets a playback service). The app only plays its session-end chime
// in the foreground, and App Review rejects apps that declare a background mode
// they don't use (guideline 2.5.4). Done here rather than with
// `enableBackgroundPlayback: false` so Android's manifest is left untouched.
//
// Expo runs mods last-registered-first, so register this plugin BEFORE
// "expo-audio" in app.json for it to run after expo-audio's mod.
const { withInfoPlist } = require('expo/config-plugins');

module.exports = function withIosNoBackgroundAudio(config) {
  return withInfoPlist(config, plistConfig => {
    const modes = plistConfig.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      const remaining = modes.filter(mode => mode !== 'audio');
      if (remaining.length > 0) {
        plistConfig.modResults.UIBackgroundModes = remaining;
      } else {
        delete plistConfig.modResults.UIBackgroundModes;
      }
    }
    return plistConfig;
  });
};
