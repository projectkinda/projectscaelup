// Adopts the UIScene life cycle on iOS. iOS 27 refuses to launch apps that
// don't (SIGTRAP in _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption).
//
// Expo SDK 57's bare template still uses the app-delegate life cycle; SDK 58's
// template adopts scenes via Expo's ExpoAppSceneDelegate. This plugin applies
// the SDK 58 template changes so `expo prebuild --clean` keeps the fix.
// Every step is idempotent and no-ops on a template that already has it, so the
// plugin is safe to leave in place after upgrading; delete it once on SDK 58.
const fs = require('fs');
const path = require('path');
const {
  IOSConfig,
  withAppDelegate,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');

const SCENE_DELEGATE_FILE = 'SceneDelegate.swift';
const SCENE_DELEGATE_SOURCE = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
      },
    ],
  },
};

const withSceneManifest = config =>
  withInfoPlist(config, mod => {
    mod.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return mod;
  });

// The scene delegate creates the window, so the app delegate must stop doing
// it and expose its React Native factory. Deep links now arrive through the
// scene delegate, which forwards them to RCTLinkingManager itself.
function patchAppDelegate(source) {
  let result = source;

  if (!result.includes('ExpoReactNativeFactoryProvider')) {
    result = replaceOrThrow(
      result,
      /class AppDelegate: ExpoAppDelegate \{/,
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      'AppDelegate class declaration',
    );
  }

  if (result.includes('window = UIWindow(frame: UIScreen.main.bounds)')) {
    result = replaceOrThrow(
      result,
      /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)[\s\S]*?#endif\n\n?/,
      '    // The window is created and React Native is started by `SceneDelegate` under the\n' +
        '    // scene-based life cycle (required by the iOS 27 SDK).\n',
      'AppDelegate window creation',
    );
  }

  result = result.replace(
    /\n  \/\/ Linking API\n[\s\S]*?\n  \}\n(?=\n  \/\/ Universal Links)/,
    '',
  );
  result = result.replace(/\n\n  \/\/ Universal Links\n[\s\S]*?\n  \}\n(?=\})/, '\n');

  return result;
}

function replaceOrThrow(source, pattern, replacement, description) {
  if (!pattern.test(source)) {
    throw new Error(
      `[withIosSceneLifecycle] Couldn't find the ${description} in AppDelegate.swift. ` +
        'The Expo template changed; update this plugin.',
    );
  }
  return source.replace(pattern, replacement);
}

const withAppDelegateForScenes = config =>
  withAppDelegate(config, mod => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('[withIosSceneLifecycle] Only Swift AppDelegates are supported.');
    }
    mod.modResults.contents = patchAppDelegate(mod.modResults.contents);
    return mod;
  });

const withSceneDelegateFile = config =>
  withXcodeProject(config, mod => {
    const { projectRoot, platformProjectRoot } = mod.modRequest;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const relativePath = path.join(projectName, SCENE_DELEGATE_FILE);
    const absolutePath = path.join(platformProjectRoot, relativePath);

    if (!fs.existsSync(absolutePath)) {
      fs.writeFileSync(absolutePath, SCENE_DELEGATE_SOURCE);
    }

    if (!mod.modResults.hasFile(relativePath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: relativePath,
        groupName: projectName,
        project: mod.modResults,
      });
    }
    return mod;
  });

module.exports = config =>
  withSceneDelegateFile(withAppDelegateForScenes(withSceneManifest(config)));
module.exports.patchAppDelegate = patchAppDelegate;
