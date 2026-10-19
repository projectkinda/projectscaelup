// Inspect the exact Metro output used by Gradle, before Hermes compilation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function inspectBundle(source, variant = 'release') {
  if (!['release', 'qa'].includes(variant)) throw Error('Unknown bundle variant: ' + variant);
  const ts = require('typescript');
  const ast = ts.createSourceFile('release.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function value(node) {
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (ts.isVoidExpression(node) || ts.isIdentifier(node) && node.text === 'undefined') return undefined;
    if (ts.isParenthesizedExpression(node)) return value(node.expression);
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) return !value(node.operand);
    if (ts.isTypeOfExpression(node)) return typeof value(node.expression);
    if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) return value(node.left) === value(node.right);
      if (node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken) return value(node.left) !== value(node.right);
      if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) return value(node.left) || value(node.right);
      if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return value(node.left) && value(node.right);
    }
    throw Error('Test-tools flag was not inlined to a build-time literal: ' + node.getText(ast));
  }
  let flags;
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const props = new Map(node.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(ast).replace(/['"]/g, ''), p.initializer]));
      if (['tierSwitcher', 'forcePaidUser', 'resetOnboarding', 'iosOnboardingPreview'].every(name => props.has(name))) {
        if (flags) throw Error('Multiple DEV_FLAGS literals in release bundle');
        flags = Object.fromEntries([...props].map(([key, expr]) => [key, value(expr)]));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!flags) throw Error('DEV_FLAGS was not found in Metro release bundle');
  if (variant === 'release' && ['tierSwitcher', 'forcePaidUser', 'resetOnboarding', 'iosOnboardingPreview'].some(name => flags[name] !== false)) throw Error('Release DEV_FLAGS must all be false');
  if (variant === 'qa' && (flags.tierSwitcher !== true || ['forcePaidUser', 'resetOnboarding', 'iosOnboardingPreview'].some(name => flags[name] !== false))) throw Error('QA tierSwitcher must be true; other DEV_FLAGS must remain false');
  return flags;
}
const TOOL_SURFACES = ['Test tier (testing only)', 'Coach dev seeding', 'coach-sample-controls', 'dev-app-rules', 'App picker diagnostics', 'Live timer style:', 'Purchases coming soon', 'Restart onboarding'];
function inspectQaBundle(source) {
  const flags = inspectBundle(source, 'qa');
  for (const label of TOOL_SURFACES) if (!source.includes(label)) throw Error('QA bundle is missing test surface: ' + label);
  return { flags, surfaces: TOOL_SURFACES };
}
function variantForBundle(bundlePath) {
  const normalized = bundlePath.replaceAll('\\', '/');
  return /\/(?:generated\/assets\/react\/qa|createBundleQaJsAndAssets)\//.test(normalized) ? 'qa' : 'release';
}
if (process.argv.includes('export:embed')) {
  const outputArg = process.argv.indexOf('--bundle-output');
  if (outputArg < 0) throw Error('Missing --bundle-output for bundle verification');
  const bundlePath = path.resolve(process.argv[outputArg + 1]);
  // Determine identity from Gradle's output, never from a caller's env marker.
  const variant = variantForBundle(bundlePath);
  // Inline absent public env values deterministically. An explicit release value
  // of 1 is retained so the safety check fails, even with a stale Gradle cache.
  process.env.EXPO_PUBLIC_TEST_TOOLS ??= '0';
  process.env.EXPO_PUBLIC_BUILD_VARIANT = variant;
  process.on('exit', code => {
    if (code !== 0) return;
    try {
      const source = fs.readFileSync(bundlePath, 'utf8');
      const flags = variant === 'qa' ? inspectQaBundle(source).flags : inspectBundle(source);
      const proof = { resolvedFlags: flags,
        metroBundleSha256: crypto.createHash('sha256').update(source).digest('hex'),
        bundleCommand: 'expo export:embed --platform android --dev false' };
      if (variant === 'qa') proof.enabledSurfaces = TOOL_SURFACES;
      const proofPath = path.resolve(__dirname, '../android/app/build/' + variant + '-proof/' + variant + '-flags.json');
      fs.mkdirSync(path.dirname(proofPath), { recursive: true });
      fs.writeFileSync(path.join(path.dirname(proofPath), 'index.android.bundle.js'), source);
      fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2) + '\n');
      console.log(variant === 'qa' ? 'PASS verify-qa-bundle: tierSwitcher is true; all test surfaces included (test tools ON)' : 'PASS verify-release-bundle: all DEV_FLAGS are false (test tools OFF)');
    } catch (error) {
      console.error(variant + ' bundle verification failed:', error.message);
      process.exitCode = 1;
    }
  });
}
module.exports = { inspectBundle, inspectQaBundle, variantForBundle };
