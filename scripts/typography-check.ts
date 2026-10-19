/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}
const source = readFileSync('src/theme/typography.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} as any };
vm.runInNewContext(compiled, {
  exports: module.exports,
  require: (name: string) => {
    assert.equal(name, 'react-native');
    return { StyleSheet: { flatten: (style: unknown) => style } };
  },
});
const { typography, readableTextStyle, fontFamilies, MIN_FONT_SIZE } = module.exports;
assert.equal(MIN_FONT_SIZE, 12);
let previous = 0;
for (const role of Object.values(typography) as { fontSize: number; lineHeight: number }[]) {
  assert(role.fontSize >= 12 && role.fontSize > previous);
  assert(role.lineHeight >= role.fontSize + 6);
  previous = role.fontSize;
}
for (const fontScale of [0.85, 1, 1.3, 2]) {
  for (const requested of [undefined, 9, 11, 13, 14, 16, 32]) {
    const result = readableTextStyle({ fontSize: requested, lineHeight: 10 }, fontScale);
    assert(result.fontSize * fontScale >= 12);
    assert(result.lineHeight >= result.fontSize);
  }
}
assert.equal(readableTextStyle({ fontWeight: '700' }).fontFamily, fontFamilies.semibold);
assert.equal(readableTextStyle({ fontWeight: '400' }).fontFamily, fontFamilies.regular);
assert.equal(readableTextStyle({ fontFamily: 'GeistSemiBold' }).fontFamily, fontFamilies.semibold);
assert.equal(readableTextStyle({ fontWeight: '800' }).fontWeight, 'normal');
assert.equal(readableTextStyle().fontSize, 16);
assert.equal(readableTextStyle(typography.caption).fontSize, 12);
assert.equal(readableTextStyle(typography.label).fontSize, 13);
assert.equal(readableTextStyle(typography.body).fontSize, 16);

let checked = 0;
for (const file of files('src').filter(file => file.endsWith('.tsx'))) {
  const text = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.getText(ast) === "'react-native'" && !file.endsWith('AppText.tsx')) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) {
        assert(!['Text', 'TextInput'].includes((item.propertyName ?? item.name).text), `${file}: use AppText to enforce pairing and the minimum`);
      }
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'fontSize' && ts.isNumericLiteral(node.initializer)) {
      assert(Number(node.initializer.text) >= 12, `${file}: undersized font`);
      // The upgrade brief explicitly specifies 17sp titles and 15sp descriptions.
      const role = ts.isPropertyAssignment(node.parent.parent) ? node.parent.parent.name.getText(ast) : '';
      const paywallSizes: Record<string, number> = { listTitle: 17, description: 15 };
      assert(file.endsWith('PaywallScreen.tsx') && paywallSizes[role] === Number(node.initializer.text), `${file}: use a shared typography role`);
    }
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'fontSize') {
      const value = node.initializer;
      assert(value && ts.isJsxExpression(value) && value.expression && ts.isNumericLiteral(value.expression));
      assert(Number(value.expression.text) >= 12, `${file}: undersized SVG label`);
    }
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'adjustsFontSizeToFit') {
      assert(file.endsWith('AppText.tsx'), `${file}: text must wrap instead of shrinking`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  checked++;
}
assert(readFileSync('src/components/AppText.tsx', 'utf8').includes('adjustsFontSizeToFit={false}'));
assert(readFileSync('modules/screen-time/ios/FlaggedAppLabelView.swift', 'utf8').includes('max(12, model.size)'));
console.log(`PASS typography hierarchy, real font pairing, 12dp floor at four system scales, and ${checked} component audits`);
