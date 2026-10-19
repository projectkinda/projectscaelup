const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { inspectBundle, inspectQaBundle } = require('./verify-release-bundle.cjs');
const root = path.resolve(__dirname, '..');
function aaptPath() {
  const properties = path.join(root, 'android/local.properties');
  const localSdk = fs.existsSync(properties) ? fs.readFileSync(properties, 'utf8').match(/^sdk\.dir=(.+)$/m)?.[1].trim().replace(/\\(.)/g, '$1') : undefined;
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || localSdk;
  if (!sdk) throw Error('Set ANDROID_HOME to the SDK used by Gradle.');
  const versions = fs.readdirSync(path.join(sdk, 'build-tools')).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const executable = versions.map(version => path.join(sdk, 'build-tools', version, process.platform === 'win32' ? 'aapt.exe' : 'aapt')).find(file => fs.existsSync(file));
  if (!executable) throw Error('Android build-tools aapt was not found.');
  return executable;
}
function apkInfo(apk) {
  const badging = execFileSync(aaptPath(), ['dump', 'badging', apk], { encoding: 'utf8', windowsHide: true });
  const pkg = badging.match(/^package: name='([^']+)'[^\n]*versionName='([^']+)'/m);
  if (!pkg) throw Error('Unable to read APK package/version with aapt');
  return { packageId: pkg[1], versionName: pkg[2], label: badging.match(/^application-label:'([^']+)'/m)?.[1], badging };
}
function verifyQa() {
  const proofDir = path.join(root, 'android/app/build/qa-proof');
  const source = fs.readFileSync(path.join(proofDir, 'index.android.bundle.js'), 'utf8');
  const proof = JSON.parse(fs.readFileSync(path.join(proofDir, 'qa-flags.json'), 'utf8'));
  const { flags, surfaces } = inspectQaBundle(source);
  let releaseRejectedQa = false;
  try { inspectBundle(source); } catch (error) { if (!/must all be false/.test(error.message)) throw error; releaseRejectedQa = true; }
  if (!releaseRejectedQa) throw Error('The release safety check accepted the QA bundle');
  console.log('PASS release safety check rejects the actual tools-enabled QA Metro bundle');
  if (crypto.createHash('sha256').update(source).digest('hex') !== proof.metroBundleSha256) throw Error('QA Metro source no longer matches its build proof');
  if (JSON.stringify(flags) !== JSON.stringify(proof.resolvedFlags)) throw Error('QA flag proof does not match the bundle');
  for (const file of [
    'android/app/build/generated/source/buildConfig/qa/com/projectscaleup/app/BuildConfig.java',
    'modules/live-timer/android/build/generated/source/buildConfig/qa/expo/modules/livetimer/BuildConfig.java',
  ]) if (!/TEST_TOOLS_ENABLED = true;/.test(fs.readFileSync(path.join(root, file), 'utf8'))) throw Error(file + ': native tools are not enabled');
  const appConfig = fs.readFileSync(path.join(root, 'android/app/build/generated/source/buildConfig/qa/com/projectscaleup/app/BuildConfig.java'), 'utf8');
  if (!/DEBUG = false;/.test(appConfig)) throw Error('QA must not be debuggable or depend on Metro');
  const apk = path.join(root, 'android/app/build/outputs/apk/qa/app-qa.apk');
  const info = apkInfo(apk);
  if (info.packageId !== 'com.projectscaleup.app.qa' || info.label !== 'ScaleUp QA' || !info.versionName.endsWith('-qa')) throw Error('Incorrect QA identity: ' + JSON.stringify(info));
  const assets = execFileSync(aaptPath(), ['list', apk], { encoding: 'utf8', windowsHide: true });
  if (!assets.split(/\r?\n/).includes('assets/index.android.bundle')) throw Error('QA APK has no embedded JavaScript bundle');
  const releaseSource = path.join(root, 'android/app/build/release-proof/index.android.bundle.js');
  if (fs.existsSync(releaseSource)) {
    inspectBundle(fs.readFileSync(releaseSource, 'utf8'));
    for (const file of [
      'android/app/build/generated/source/buildConfig/release/com/projectscaleup/app/BuildConfig.java',
      'modules/live-timer/android/build/generated/source/buildConfig/release/expo/modules/livetimer/BuildConfig.java',
    ]) if (!/TEST_TOOLS_ENABLED = false;/.test(fs.readFileSync(path.join(root, file), 'utf8'))) throw Error(file + ': release native tools must be disabled');
    console.log('PASS existing release proof: all JS flags and both native test-tools flags are false');
  } else console.log('No existing release proof to recheck; QA does not build or modify release.');
  console.log('PASS verify:qa: bundled JS, QA native tools ON, package=' + info.packageId + ', label=' + info.label);
  console.log('QA enabled surfaces: ' + surfaces.join(', '));
  return { apk, packageId: info.packageId, versionName: info.versionName, label: info.label, flags };
}
if (require.main === module) { try { verifyQa(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { verifyQa, apkInfo };
