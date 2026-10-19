const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { verifyQa } = require('./verify-qa-build.cjs');
const root = path.resolve(__dirname, '..');
function snapshot() {
  const result = {};
  function visit(directory) {
    if (!fs.existsSync(directory)) return;
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) visit(file);
      else { const stat = fs.statSync(file); result[path.relative(root, file).replaceAll('\\', '/')] = {
        size: stat.size, modifiedUtc: stat.mtime.toISOString(), sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      }; }
    }
  }
  for (const variant of ['release', 'debug']) visit(path.join(root, 'android/app/build/outputs/apk', variant));
  return result;
}
function main() {
  const before = snapshot();
  const windows = process.platform === 'win32';
  // First-time dex merging needs more than the project's 2 GiB default.
  // Scope memory/workers to QA; leave Gradle properties and release untouched.
  const args = [':app:assembleQa', '--console=plain', '--max-workers=2', '-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m'];
  const build = spawnSync(windows ? 'cmd.exe' : './gradlew', windows ? ['/d', '/c', 'gradlew.bat', ...args] : args, {
    cwd: path.join(root, 'android'), stdio: 'inherit', windowsHide: true,
    env: { ...process.env, NODE_ENV: 'production', EXPO_PUBLIC_TEST_TOOLS: '1', EXPO_PUBLIC_BUILD_VARIANT: 'qa' },
  });
  if (build.error) throw build.error;
  if (build.status !== 0) throw Error('assembleQa failed: ' + build.status);
  const after = snapshot();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('QA unexpectedly changed release/debug APK outputs');
  const verified = verifyQa();
  const directory = path.join(root, 'artifacts/qa');
  fs.mkdirSync(directory, { recursive: true });
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  const stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes());
  const destination = path.join(directory, 'ScaleUp-qa-' + verified.versionName + '-' + stamp + '.apk');
  fs.copyFileSync(verified.apk, destination);
  // Delete only older QA APK files in this exact directory, never any Gradle output.
  const retained = fs.readdirSync(directory).filter(name => /^ScaleUp-qa-[a-zA-Z0-9._-]+-\d{8}-\d{4}\.apk$/.test(name))
    .map(name => ({ name, time: fs.statSync(path.join(directory, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time || b.name.localeCompare(a.name));
  for (const item of retained.slice(3)) fs.unlinkSync(path.join(directory, item.name));
  const size = fs.statSync(destination).size;
  fs.writeFileSync(path.join(directory, 'build-report.json'), JSON.stringify({ ...verified, apk: destination, size, releaseAndDebugOutputsUnchanged: true, before, after }, null, 2) + '\n');
  console.log('PASS QA output isolation: release/debug APK timestamps, sizes and SHA-256 are unchanged');
  console.log('QA APK: ' + destination);
  console.log('Size: ' + size + ' bytes (' + (size / 1048576).toFixed(2) + ' MiB)');
  console.log('Install: adb install -r "' + destination + '"');
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
