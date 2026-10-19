// Inspect the exact Metro output used by Gradle, before Hermes compilation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const initialTestTools = process.env.EXPO_PUBLIC_TEST_TOOLS === '1';
function inspectBundle(source) {
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
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) return value(node.left) === value(node.right);
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
  if (flags.forcePaidUser !== false || flags.resetOnboarding !== false || flags.iosOnboardingPreview !== false) throw Error('Non-release entitlement/onboarding defaults');
  return flags;
}
if (process.argv.includes('export:embed')) {
  const bundlePath = path.resolve(process.argv[process.argv.indexOf('--bundle-output') + 1]);
  process.on('exit', code => {
    if (code !== 0) return;
    try {
      const source = fs.readFileSync(bundlePath, 'utf8');
      const flags = inspectBundle(source);
      if (flags.tierSwitcher !== initialTestTools) throw Error('Expo bundle disagrees with shell EXPO_PUBLIC_TEST_TOOLS (check .env files)');
      const proof = { shellTestToolsEnabled: initialTestTools, resolvedFlags: flags,
        metroBundleSha256: crypto.createHash('sha256').update(source).digest('hex'),
        bundleCommand: 'expo export:embed --platform android --dev false' };
      const proofPath = path.resolve(__dirname, '../android/app/build/release-proof/test-tools.json');
      fs.mkdirSync(path.dirname(proofPath), { recursive: true });
      fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2) + '\n');
      console.log('Verified release bundle: test tools ' + (flags.tierSwitcher ? 'ON (TEST APK)' : 'OFF (store configuration)'));
    } catch (error) {
      console.error('Release bundle verification failed:', error.message);
      process.exitCode = 1;
    }
  });
}
module.exports = { inspectBundle };
