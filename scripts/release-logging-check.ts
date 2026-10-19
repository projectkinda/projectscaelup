/// <reference types="node" />
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(join(directory, item.name)) : /\.tsx?$/.test(item.name) ? [join(directory, item.name)] : []);
}
let consoleSites = 0, guardedSites = 0, previousSites = 0;
const allowedConsole = new Set(['src/domain/paywall.ts', 'src/domain/releaseLog.ts', 'src/domain/focusCoachCopyRules.ts']);
function countConsole(source: string) {
  const ast = ts.createSourceFile('source.tsx', source, 99, true, 4); let count = 0;
  function visit(n: ts.Node) { if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.expression.getText(ast) === 'console') count++; ts.forEachChild(n, visit); }
  visit(ast); return count;
}
for (const path of ['App.tsx', ...files('src')]) {
  const file = path.replaceAll('\\', '/'), source = readFileSync(path, 'utf8');
  try { previousSites += countConsole(execFileSync('git', ['show', 'HEAD:' + file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch { /* New files have no HEAD entry. */ }
  const ast = ts.createSourceFile(file, source, 99, true, 4);
  function visit(n: ts.Node) {
    if (ts.isCallExpression(n)) {
      if (ts.isPropertyAccessExpression(n.expression) && n.expression.expression.getText(ast) === 'console') {
        consoleSites++; assert(allowedConsole.has(file), file + ': use the detail-guarded logger');
        if (!file.endsWith('releaseLog.ts')) assert(n.arguments.every(arg => ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)), file + ': direct console data');
      }
      if (ts.isIdentifier(n.expression) && n.expression.text === 'warn') {
        guardedSites++;
        const message = n.arguments[0];
        assert(message && (ts.isStringLiteral(message) || ts.isNoSubstitutionTemplateLiteral(message) ||
          file === 'src/domain/usageTrackingModule.ts' && ts.isTemplateExpression(message) && message.templateSpans.every(span => ts.isIdentifier(span.expression) && span.expression.text === 'methodName')), file + ': release message must not contain user values');
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(ast);
}
for (const enabled of [false, true]) {
  const module = { exports: {} as any }, calls: unknown[][] = [];
  runInNewContext(ts.transpileModule(readFileSync('src/domain/releaseLog.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: module.exports, require: () => ({ DEV_FLAGS: { tierSwitcher: enabled } }), console: { warn: (...args: unknown[]) => calls.push(args) } });
  const sensitive = { packageName: 'example.private.app', userText: 'private mode name', sessionHistory: [1, 2, 3] };
  module.exports.warn('Could not save app data:', sensitive);
  assert.equal(calls[0].length, enabled ? 2 : 1);
  assert.equal(calls[0][0], 'Could not save app data:');
  if (enabled) assert.equal(calls[0][1], sensitive);
}
console.log(`PASS logging audit: ${previousSites} console calls in HEAD; ${consoleSites} direct console sites now, ${guardedSites} detail-guarded warnings; store logs omit user/native/SQL payloads`);
