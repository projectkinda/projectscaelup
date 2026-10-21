import { runInNewContext } from 'node:vm';
import { transpileModule, ModuleKind } from 'typescript';
﻿/// <reference types="node" />
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FREE_TIER_APP_CAP, FREE_HISTORY_DAYS, PRO_FEATURES, PAYWALL_COPY, PAYWALL_LAYOUT, proFeaturesFor, type PaywallFeature } from '../src/domain/paywall';
const features: PaywallFeature[] = ['apps', 'app-rules', 'coach', 'history', 'modes'];
assert.equal(PAYWALL_LAYOUT, 'list');
assert(PRO_FEATURES.find(row => row.id === 'apps')!.description.includes(String(FREE_TIER_APP_CAP)));
assert(PRO_FEATURES.find(row => row.id === 'history')!.description.includes(FREE_HISTORY_DAYS + ' days'));
assert(!existsSync('src/components/Paywall' + 'Sheet.tsx'));
assert.deepEqual(PRO_FEATURES.map(row => row.id), features);
assert.equal(PRO_FEATURES.find(row => row.id === 'apps')!.freeValue, String(FREE_TIER_APP_CAP));
assert.equal(PRO_FEATURES.find(row => row.id === 'history')!.freeValue, FREE_HISTORY_DAYS + ' days');
assert.equal(PRO_FEATURES.find(row => row.id === 'coach')!.freeValue, 'Basic');
assert.equal(PRO_FEATURES.find(row => row.id === 'modes')!.freeValue, '\u2014');
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
const instances = sources.flatMap(({ file, code }) => [...code.matchAll(/<PaywallScreen\b/g)].map(() => file.replaceAll('\\', '/')));
assert.deepEqual(instances, ['src/components/PaywallProvider.tsx']);
const removedScreen = 'Paywall' + 'StubScreen';
for (const { file, code } of sources) {
  assert(!code.includes(removedScreen), file);
  assert(!code.includes('Paywall' + 'Sheet'), file);
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

const purchase = { exports: {} as any }; const calls: unknown[][] = [];
runInNewContext(transpileModule(readFileSync('src/domain/purchases.ts', 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, {
  exports: purchase.exports, require: () => ({ Alert: { alert: (...args: unknown[]) => calls.push(args) } }),
});
purchase.exports.beginProPurchase();
assert.equal(calls[0][0], "Pro isn't available yet");
assert.equal(calls[0][1], "Purchases open soon. We'll let you know when Pro launches.");
assert.equal((calls[0][2] as any[])[0].text, 'OK');
assert.deepEqual(sources.filter(({code}) => /onPress=\{beginProPurchase\}/.test(code)).map(({file}) => file.replaceAll('\\', '/')), ['src/components/PaywallScreen.tsx']);
console.log('PASS single purchase entry point uses the launch alert');

// Legal pages and links. Always: structure and link wiring. Under RELEASE=1 (set it for
// store builds): no unfilled placeholder in the hosted HTML and no legal link with a null URL.
{
  const release = process.env.RELEASE === '1' || process.env.RELEASE === 'true';
  const siteDir = 'docs/store/site';
  const pages = ['index.html', 'terms.html', 'privacy.html', 'support.html'];
  for (const page of pages) {
    const html = readFileSync(join(siteDir, page), 'utf8');
    assert(!/(src|href)=["']https?:\/\//.test(html) && !/<script/i.test(html), page + ': no external assets or scripts');
    for (const [, href] of html.matchAll(/href="([^"#]+)(?:#[^"]*)?"/g)) {
      if (!href.startsWith('mailto:')) assert(existsSync(join(siteDir, href)), page + ': broken relative link ' + href);
    }
    if (release) {
      assert(!html.includes('\u26A0'), page + ': contains a \u26A0 placeholder (RELEASE)');
      assert(!/\[PLACEHOLDER\]|\[[A-Z][A-Z /,]+[A-Z]\]/.test(html), page + ': contains a [PLACEHOLDER] token (RELEASE)');
    }
  }
  const legalCode = readFileSync('src/config/legal.ts', 'utf8');
  for (const surface of ['src/screens/SettingsScreen.tsx', 'src/components/PaywallScreen.tsx', 'src/components/settingsGuide/PermissionDisclosure.tsx']) {
    assert(/config\/legal/.test(readFileSync(surface, 'utf8')), surface + ' uses src/config/legal');
  }
  const legal = { exports: {} as any };
  runInNewContext(transpileModule(legalCode, { compilerOptions: { module: ModuleKind.CommonJS, resolveJsonModule: true } }).outputText, {
    exports: legal.exports, require: (id: string) => id.endsWith('app.json') ? { expo: { version: '0' } } : { DEV_FLAGS: { tierSwitcher: false } },
  });
  const { LEGAL_PAGES, legalEntries, UNHOSTED_CAPTION } = legal.exports;
  for (const [key, page] of Object.entries<any>(LEGAL_PAGES)) {
    if (release) assert(page.url, 'legal link "' + page.label + '" (' + key + ') has a null URL (RELEASE)');
  }
  // Null url: hidden with test tools off (release behaviour); shown, captioned and non-navigating with them on.
  assert.equal(UNHOSTED_CAPTION, 'Not hosted yet');
  for (const [key, page] of Object.entries<any>(LEGAL_PAGES)) {
    if (page.url) continue;
    assert(!legalEntries([key], false).some((entry: any) => entry.page === key), key + ': row must be hidden with test tools off');
    const shown = legalEntries([key], true).filter((entry: any) => entry.page === key);
    assert.equal(shown.length, 1, key + ': row must show with test tools on');
    assert.equal(shown[0].url, null, key + ': unhosted row carries no url');
  }
  assert.equal(legalEntries(undefined, false).length, Object.values<any>(LEGAL_PAGES).filter(page => page.url).length, 'release shows only hosted pages');
  assert.equal(legalEntries(undefined, true).length, 3);
  assert.equal(legalEntries(['privacy', 'terms'], true).map((entry: any) => entry.page).join(), 'privacy,terms');
  const settingsSrc = readFileSync('src/screens/SettingsScreen.tsx', 'utf8');
  const paywallSrc = readFileSync('src/components/PaywallScreen.tsx', 'utf8');
  const disclosureSrc = readFileSync('src/components/settingsGuide/PermissionDisclosure.tsx', 'utf8');
  for (const [name, src] of [['Settings', settingsSrc], ['Paywall', paywallSrc], ['Disclosure', disclosureSrc]]) {
    assert(src.includes('legalEntries(') && src.includes('UNHOSTED_CAPTION'), name + ' renders unhosted entries via legalEntries/UNHOSTED_CAPTION');
    assert(!src.includes('legalUrl('), name + ' must not read legalUrl directly');
    assert(src.split('Linking.openURL(entry.url!)').length === 2, name + ': only the hosted branch navigates');
  }
  assert(settingsSrc.includes("'about-unhosted-' + entry.page"), 'Settings unhosted row is present');
  const unhostedRow = settingsSrc.slice(settingsSrc.indexOf("'about-unhosted-'"), settingsSrc.indexOf('UNHOSTED_CAPTION}'));
  assert(!unhostedRow.includes('onPress'), 'Settings unhosted row has no navigation');
  const sub = { exports: {} as any };
  runInNewContext(transpileModule(readFileSync('src/config/subscription.ts', 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, {
    exports: sub.exports, require: () => ({ Platform: { OS: 'android' } }),
  });
  const { subscriptionDisclosure, SUBSCRIPTION_TERMS } = sub.exports;
  assert.equal(subscriptionDisclosure({ price: '$4.99', period: 'month' }, 'android', false), '$4.99 per month. Renews automatically until you cancel in Google Play.');
  assert.equal(subscriptionDisclosure({ price: '$4.99', period: 'month' }, 'ios', false), '$4.99 per month. Renews automatically until you cancel in the App Store.');
  assert.equal(subscriptionDisclosure({ price: null, period: null }, 'android', false), null);
  if (release) assert(SUBSCRIPTION_TERMS.price === null || /\d/.test(SUBSCRIPTION_TERMS.price), 'price must come from the store, not be hardcoded text');
  console.log('PASS legal pages, links and subscription disclosure' + (release ? ' (RELEASE)' : ' (dev; set RELEASE=1 to enforce placeholders and URLs)'));
}
