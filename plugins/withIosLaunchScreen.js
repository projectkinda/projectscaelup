// Makes the iOS launch screen a solid background matching the app, so launch
// goes straight from #121212 to the first frame with no flash.
//
// Without expo-splash-screen, prebuild's launch storyboard uses the system
// background colour and references logo images that don't exist. Adopting
// expo-splash-screen would also change Android's splash theme, so it's left for
// a joint change; this plugin covers iOS only. Idempotent: the storyboard is
// regenerated whole.
//
// Usage: ["./plugins/withIosLaunchScreen", { "backgroundColor": "#121212" }]
const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod } = require('expo/config-plugins');

function hexToRgb(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!match) {
    throw new Error(`[withIosLaunchScreen] Expected backgroundColor as #RRGGBB, got ${hex}`);
  }
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(channel => (channel / 255).toFixed(4));
}

// Keeps the ids of Expo's template so anything that looks the view controller
// up (for example a future expo-splash-screen) still finds it.
function launchStoryboard([red, green, blue]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="24093.7" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="EXPO-VIEWCONTROLLER-1">
    <device id="retina6_12" orientation="portrait" appearance="dark"/>
    <dependencies>
        <deployment identifier="iOS"/>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="24053.1"/>
        <capability name="Safe area layout guides" minToolsVersion="9.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <scene sceneID="EXPO-SCENE-1">
            <objects>
                <viewController storyboardIdentifier="SplashScreenViewController" id="EXPO-VIEWCONTROLLER-1" sceneMemberID="viewController">
                    <view key="view" userInteractionEnabled="NO" contentMode="scaleToFill" insetsLayoutMarginsFromSafeArea="NO" id="EXPO-ContainerView" userLabel="ContainerView">
                        <rect key="frame" x="0.0" y="0.0" width="393" height="852"/>
                        <autoresizingMask key="autoresizingMask" flexibleMaxX="YES" flexibleMaxY="YES"/>
                        <viewLayoutGuide key="safeArea" id="Rmq-lb-GrQ"/>
                        <color key="backgroundColor" red="${red}" green="${green}" blue="${blue}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="EXPO-PLACEHOLDER-1" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
            <point key="canvasLocation" x="0.0" y="0.0"/>
        </scene>
    </scenes>
</document>
`;
}

module.exports = (config, { backgroundColor } = {}) =>
  withDangerousMod(config, [
    'ios',
    mod => {
      const { projectRoot, platformProjectRoot } = mod.modRequest;
      const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
      const storyboard = path.join(platformProjectRoot, projectName, 'SplashScreen.storyboard');
      fs.writeFileSync(storyboard, launchStoryboard(hexToRgb(backgroundColor)));
      return mod;
    },
  ]);
