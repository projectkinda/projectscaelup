/// <reference types="node" />
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FREE_TIER_APP_CAP, FREE_HISTORY_DAYS, PRO_FEATURES, PAYWALL_COPY, proFeaturesFor, type PaywallFeature } from '../src/domain/paywall';
const features: PaywallFeature[] = ['apps', 'app-rules', 'coach', 'history', 'modes'];
assert.deepEqual(PRO_FEATURES.map(row => row.id), features);
assert.equal(PRO_FEATURES.find(row => row.id === 'apps')!.freeValue, String(FREE_TIER_APP_CAP));
assert.equal(PRO_FEATURES.find(row => row.id === 'history')!.freeValue, FREE_HISTORY_DAYS + ' days');
assert.equal(PRO_FEATURES.find(row => row.id === 'coach')!.freeValue, 'Basic');
assert.equal(PRO_FEATURES.find(row => row.id === 'modes')!.freeValue, 'No');
for (const platform of ['android', 'ios']) for (const feature of features) {
  const rows = proFeaturesFor(feature, platform);
  const expected = PRO_FEATURES.filter(row => row.platforms.includes(platform));
  assert.deepEqual(rows.map(row => row.id), [...expected.filter(row => row.id === feature), ...expected.filter(row => row.id !== feature)].map(row => row.id));
  assert.equal(rows.some(row => row.id === 'app-rules'), platform === 'android');
  assert(PAYWALL_COPY[feature].title && PAYWALL_COPY[feature].subtitle);
}
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
}
const sourceFiles = ['App.tsx', ...files('src').filter(file => /\.tsx?$/.test(file))];
const sources = sourceFiles.map(file => ({ file, code: readFileSync(file, 'utf8') }));
const instances = sources.flatMap(({ file, code }) => [...code.matchAll(/<PaywallSheet\b/g)].map(() => file.replaceAll('\\', '/')));
assert.deepEqual(instances, ['src/components/PaywallProvider.tsx']);
const removedScreen = 'Paywall' + 'StubScreen';
for (const { file, code } of sources) {
  assert(!code.includes(removedScreen), file);
  assert(!code.includes('This is a premium' + ' feature'), file);
  assert(!/onNavigate\(['"]paywall['"]\)/.test(code), file);
}
assert(!existsSync('src/screens/' + removedScreen + '.tsx'));
const root = readFileSync('App.tsx', 'utf8');
assert.equal((root.match(/<PaywallProvider>/g) ?? []).length, 1);
assert(!root.includes("'paywall'"), 'removed route must not remain in app root');
assert(readFileSync('src/data/historyRepository.ts', 'utf8').includes('subtractDays(today, FREE_HISTORY_DAYS)'));
assert(readFileSync('src/domain/focusCoachCardSections.ts', 'utf8').includes('notes: notes.slice(0, 1)'));
assert(readFileSync('src/data/modesRepository.ts', 'utf8').includes('if (!paidUser)'));
for (const [file, feature] of [['src/screens/SettingsScreen.tsx', 'apps'], ['src/screens/HistoryScreen.tsx', 'coach'], ['src/screens/HistoryScreen.tsx', 'history'], ['src/screens/HomeScreen.tsx', 'modes'], ['src/components/AppRulesSection.tsx', 'app-rules']]) {
  assert(readFileSync(file, 'utf8').includes("paywall.show('" + feature + "')"), file + ': ' + feature);
}
console.log('PASS canonical feature values/order/platforms/copy, gate references, five callers, one host and no obsolete route/screen/surface');
