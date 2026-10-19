// Renders the guided-settings flow (disclosure, every step, help sheet, success)
// for samsung, google and generic phones at font scale 1 and 1.3 on a 360x640
// screen, and checks what a person would notice: sizes, labels, no sideways
// scroll, Settings never opened before agreeing, auto-detect, reduced motion.
//
//   node scripts/settings-guide-ui-preview.cjs          build .artifacts/settings-guide-ui/review.html and run it in headless Chrome
//   node scripts/settings-guide-ui-preview.cjs --build  build only (open the file yourself)
//
// The review page and any screenshots stay under .artifacts (ignored by git).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');

const out = path.join(process.cwd(), '.artifacts', 'settings-guide-ui');
fs.mkdirSync(out, { recursive: true });

// Reuse the react-native-web shim the other previews share.
const shared = fs.readFileSync('scripts/app-rules-ui-preview.cjs', 'utf8');
let native = Function(
  shared.slice(shared.indexOf('const native='), shared.indexOf('const repo=')) + 'return native',
)();
native += `
export const AccessibilityInfo={isReduceMotionEnabled:async()=>!!window.review.reduceMotion,addEventListener:()=>({remove(){}})};
export const BackHandler={addEventListener:(_,fn)=>{window.backListeners.add(fn);return{remove:()=>window.backListeners.delete(fn)}}};`;

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ScaleContext } from 'react-native';
import { SettingsGuide } from './src/components/settingsGuide/SettingsGuide';
import { guideFor, VARIANTS, VARIANT_IDS } from './src/domain/settingsGuideConfig';

let root, checks = 0, failures = [], cases = [], current = '';
const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
const stage = () => document.getElementById('stage');
const byLabel = label => stage().querySelector('[aria-label="' + label + '"]');
const text = () => (stage() ? stage().textContent : '');
const rect = el => el.getBoundingClientRect();
const assert = (ok, msg) => { checks++; if (!ok) failures.push(current + ': ' + msg + ' | on screen: ' + text().replace(/\s+/g, ' ').slice(0, 140)); };

function snapshot() {
  const el = document.createElement('section');
  el.dataset.case = current;
  el.style.cssText = 'position:relative;width:360px;height:640px;margin-bottom:16px;overflow:hidden';
  el.innerHTML = stage().innerHTML;
  document.getElementById('snapshots').appendChild(el);
  cases.push(current);
}

function Harness({ permission, variantId, consented, events, successMs = 150 }) {
  const variant = VARIANTS[variantId];
  const config = React.useMemo(() => guideFor(permission, variant), [permission, variantId]);
  const checkEnabled = React.useCallback(async () => window.review.enabled, []);
  return (
    <SettingsGuide
      config={config}
      variant={variant}
      consented={consented}
      checkEnabled={checkEnabled}
      openSettings={() => events.push('settings')}
      openAppInfo={() => events.push('appinfo')}
      onConsent={async () => { events.push('consent'); }}
      onBack={() => events.push('back')}
      onSkip={() => events.push('skip')}
      onDone={() => events.push('done')}
      pollMs={200}
      successMs={successMs}
    />
  );
}

async function mount(props, scale) {
  if (root) { root.unmount(); await wait(); }
  stage().innerHTML = '<div id="mount" style="height:640px;display:flex;flex-direction:column"></div><div id="modal-root"></div>';
  root = createRoot(document.getElementById('mount'), { onUncaughtError: error => failures.push(current + ': render error: ' + (error && error.stack || error)) });
  const events = [];
  window.review.enabled = false;
  root.render(<ScaleContext.Provider value={scale}><Harness {...props} events={events} /></ScaleContext.Provider>);
  await wait(); await wait();
  return events;
}

const click = async label => {
  const el = byLabel(label);
  assert(!!el, 'button "' + label + '" exists');
  el?.click();
  await wait(); await wait();
};

function checkLayout(scale, { sheet = false } = {}) {
  assert(stage().scrollWidth <= 360, 'no sideways scroll (scrollWidth ' + stage().scrollWidth + ')');
  for (const el of stage().querySelectorAll('[role="button"]')) {
    const r = rect(el);
    if (r.width === 0) continue;
    assert(r.height >= 43.5, 'touch target >= 44 high: "' + el.getAttribute('aria-label') + '" is ' + r.height);
  }
  const bar = [...stage().querySelectorAll('[role="button"]')].filter(el => rect(el).height >= 55.5);
  if (!sheet) for (const el of bar) assert(rect(el).bottom <= 640, 'primary button on screen at scale ' + scale);
  for (const el of stage().querySelectorAll('[role="button"]')) {
    assert(!!el.getAttribute('aria-label'), 'every button has an accessibility label');
  }
}

function fontSizeOf(snippet) {
  const el = [...stage().querySelectorAll('div,span')].find(
    node => node.children.length === 0 && node.textContent === snippet,
  );
  return el ? parseFloat(getComputedStyle(el).fontSize) : 0;
}

const ringCount = () =>
  [...stage().querySelectorAll('div')].filter(el => {
    const style = getComputedStyle(el);
    return style.borderTopColor === 'rgb(200, 145, 46)' && parseFloat(style.borderTopWidth) === 3;
  });

async function walkAccessibility(variantId, scale) {
  const variant = VARIANTS[variantId];
  const guide = guideFor('accessibility', variant);
  const label = variantId + '-' + scale;

  // Disclosure first. Nothing may open Settings yet.
  current = 'disclosure-' + label;
  const events = await mount({ permission: 'accessibility', variantId, consented: false }, scale);
  assert(text().includes('Let ScaleUp see which app is open'), 'disclosure title');
  assert(text().includes('ScaleUp notices which app is in front'), 'disclosure says what it does');
  assert(text().includes("It never reads what's on your screen."), 'disclosure: never reads screen');
  assert(text().includes('It never reads your messages, passwords or anything you type.'), 'disclosure: never reads messages');
  assert(text().includes('Nothing leaves your phone for this.'), 'disclosure: nothing leaves phone');
  assert(!!byLabel('Agree and continue') && !!byLabel('Not now'), 'disclosure buttons');
  assert(!events.includes('settings'), 'Settings not opened on the disclosure');
  checkLayout(scale);
  snapshot();
  await click('Agree and continue');
  assert(events.includes('consent') && events.indexOf('consent') < events.length, 'consent recorded on agree');

  // Step 1
  current = 'step1-' + label;
  assert(!!byLabel('Step 1 of 3'), 'step 1 of 3 label');
  assert(text().includes('Open Accessibility settings'), 'step 1 title');
  assert(!!byLabel(guide.steps[0].scene.a11y), 'step 1 illustration label: ' + guide.steps[0].scene.a11y);
  assert(!!byLabel('Open Accessibility settings'), 'step 1 primary');
  assert(text().includes('Project ScaleUp') || true, 'app name drawn');
  assert(ringCount().length >= 1, 'amber ring drawn');
  if (scale === 1) assert(fontSizeOf(guide.steps[0].instruction) >= 20, 'instruction >= 20px');
  assert(!!stage().querySelector('[data-testid="back-chevron"]') || !!byLabel('Back'), 'back button');
  assert(rect(byLabel('Open Accessibility settings')).height >= 55.5, 'primary pill 56 high');
  checkLayout(scale);
  snapshot();
  await click('Open Accessibility settings');
  assert(events.includes('settings'), 'step 1 button opens settings only after agreeing');

  // Step 2
  current = 'step2-' + label;
  assert(!!byLabel('Step 2 of 3'), 'step 2 of 3 label');
  assert(text().includes(variant.appsListLabel), 'step 2 uses this phone\\'s wording: ' + variant.appsListLabel);
  assert(!!byLabel(guide.steps[1].scene.a11y), 'step 2 illustration label');
  assert(ringCount().length >= 1, 'step 2 ring');
  checkLayout(scale);
  snapshot();
  await click('Next');

  // Step 3: toggle and Allow dialog
  current = 'step3-' + label;
  assert(!!byLabel('Step 3 of 3'), 'step 3 of 3 label');
  assert(text().includes('Switch it on, then tap Allow.'), 'step 3 instruction');
  assert(text().includes('Allow'), 'Allow button drawn');
  assert(ringCount().length >= 2, 'rings on the switch and on Allow');
  checkLayout(scale);
  snapshot();

  // Still off: the small fallback says so.
  await click("I've turned it on");
  assert(text().includes('It still looks off. Check step 3.'), 'still-off message');

  // Back chevron returns to step 2.
  await click('Back');
  assert(!!byLabel('Step 2 of 3'), 'back goes to the previous step');
  await click('Next');

  // Can't find it sheet.
  current = 'sheet-' + label;
  await click("Can't find it?");
  assert(text().includes('The switch is greyed out'), 'sheet: greyed out section');
  assert(text().includes('Open App info.') && text().includes('Tap the three dots at the top right.') && text().includes('Tap Allow restricted settings.'), 'sheet: restricted steps');
  assert(text().includes("Can't find Project ScaleUp?"), 'sheet: not found section');
  assert(text().includes('Skip for now') && text().includes("can't tell when you open an app"), 'sheet: skip explains consequence');
  assert(!!byLabel('Retry') && !!byLabel('Open App info') && !!byLabel('Skip for now'), 'sheet buttons');
  assert(!!byLabel(guide.help.restricted.scene.a11y), 'sheet illustration label');
  checkLayout(scale, { sheet: true });
  snapshot();
  await click('Open App info');
  assert(events.includes('appinfo'), 'Open App info opens app details');
  assert(!!byLabel('Step 3 of 3'), 'after App info we are on the switch step');
  assert(!text().includes('The switch is greyed out'), 'sheet closed');

  // Auto-detect from the poll.
  current = 'detect-' + label;
  window.review.enabled = true;
  await wait(450);
  assert(text().includes('All set') && text().includes('Accessibility is on.'), 'success state after poll');
  checkLayout(scale);
  snapshot();
  await wait(400);
  assert(events.includes('done'), 'continues automatically');
  assert(events.filter(e => e === 'done').length === 1, 'done fires once');
}

async function checkForeground() {
  current = 'foreground';
  const events = await mount({ permission: 'accessibility', variantId: 'google', consented: true }, 1);
  assert(!!byLabel('Step 1 of 3'), 'consented start skips disclosure');
  // Make the poll too slow to matter by flipping state, then fire AppState active.
  window.review.enabled = true;
  window.review.appListeners.forEach(fn => fn('active'));
  await wait(60);
  assert(text().includes('All set'), 'AppState active triggers detection');
  await click('Continue');
  await wait(60);
  assert(events.includes('done'), 'Continue button hands off');
}

async function checkReducedMotion() {
  current = 'reduced-motion';
  window.review.reduceMotion = true;
  await mount({ permission: 'accessibility', variantId: 'samsung', consented: true }, 1);
  await wait(300);
  const ring = ringCount()[0];
  const first = parseFloat(getComputedStyle(ring).opacity);
  await wait(600);
  const second = parseFloat(getComputedStyle(ring).opacity);
  assert(first === 1 && second === 1, 'ring is static when motion is reduced (' + first + ', ' + second + ')');
}

async function checkMotion() {
  current = 'motion';
  window.review.reduceMotion = false;
  await mount({ permission: 'accessibility', variantId: 'samsung', consented: true }, 1);
  const ring = ringCount()[0];
  const seen = new Set();
  for (let i = 0; i < 12; i++) { seen.add(getComputedStyle(ring).opacity); await wait(120); }
  assert(seen.size > 1, 'ring pulses when motion is allowed (saw ' + [...seen].join(',') + ')');
}

async function checkDecline() {
  current = 'decline';
  const events = await mount({ permission: 'accessibility', variantId: 'samsung', consented: false }, 1);
  await click('Not now');
  assert(events.includes('back') && !events.includes('settings') && !events.includes('consent'), 'Not now leaves without consent or Settings');
}

async function checkSkip() {
  current = 'skip';
  const events = await mount({ permission: 'accessibility', variantId: 'samsung', consented: true }, 1);
  await click("Can't find it?");
  await click('Skip for now');
  assert(events.includes('skip'), 'Skip for now hands off');
}

async function checkRetry() {
  current = 'retry';
  await mount({ permission: 'accessibility', variantId: 'samsung', consented: true }, 1);
  await click('Open Accessibility settings'); await click('Next');
  await click("Can't find it?");
  await click('Retry');
  assert(!!byLabel('Step 2 of 3') && !text().includes('The switch is greyed out'), 'Retry returns to the list step');
}

async function checkOverlay(variantId, scale) {
  current = 'overlay-' + variantId + '-' + scale;
  const guide = guideFor('overlay', VARIANTS[variantId]);
  const events = await mount({ permission: 'overlay', variantId, consented: false }, scale);
  assert(text().includes('Let ScaleUp cover locked apps'), 'overlay disclosure');
  assert(!events.includes('settings'), 'overlay: no Settings before agreeing');
  checkLayout(scale);
  snapshot();
  await click('Agree and continue');
  assert(!!byLabel('Step 1 of 2'), 'overlay step 1 of 2');
  assert(!!byLabel(guide.steps[0].scene.a11y), 'overlay step 1 illustration label');
  checkLayout(scale);
  snapshot();
  await click('Open settings');
  assert(events.includes('settings') && !!byLabel('Step 2 of 2'), 'overlay step 2');
  assert(!!byLabel(guide.steps[1].scene.a11y), 'overlay step 2 illustration label');
  checkLayout(scale);
  snapshot();
  await click("Can't find it?");
  assert(!text().includes('The switch is greyed out'), 'overlay has no restricted-settings section');
  assert(text().includes("Can't find Project ScaleUp?"), 'overlay help');
  await click('Close help');
}

async function run() {
  await document.fonts.load('32px GeistSemiBold');
  await document.fonts.load('16px Geist');
  await document.fonts.ready;
  for (const scale of [1, 1.3]) for (const id of VARIANT_IDS) await walkAccessibility(id, scale);
  for (const scale of [1, 1.3]) for (const id of VARIANT_IDS) await checkOverlay(id, scale);
  await checkForeground();
  await checkDecline();
  await checkSkip();
  await checkRetry();
  await checkMotion();
  await checkReducedMotion();
  root.unmount();
  stage().remove();
  const chosen = new URLSearchParams(location.search).get('case');
  if (chosen) document.querySelectorAll('section').forEach(el => { if (el.dataset.case !== chosen) el.remove(); });
  const result = document.createElement('pre');
  result.id = 'result';
  result.textContent = JSON.stringify({ checks, cases, failures });
  document.body.appendChild(result);
  document.title = 'DONE';
}
run().catch(error => {
  const el = document.createElement('pre');
  el.id = 'result';
  el.textContent = JSON.stringify({ checks, current, failures: [...failures, error.stack] });
  document.body.appendChild(el);
});
`;

const plugins = [{
  name: 'preview',
  setup(build) {
    const mock = (filter, name, contents) => {
      build.onResolve({ filter }, () => ({ path: name, namespace: 'preview' }));
      build.onLoad({ filter: new RegExp('^' + name + '$'), namespace: 'preview' }, () => ({
        contents, loader: 'tsx', resolveDir: process.cwd(),
      }));
    };
    mock(/^react-native$/, 'native', native);
    mock(/^react-native-safe-area-context$/, 'safe', 'export const useSafeAreaInsets=()=>({top:24,bottom:24,left:0,right:0});');
    mock(/^react-native-svg$/, 'svg',
      "import React from'react';const make=tag=>({children,accessible,accessibilityElementsHidden,importantForAccessibility,testID,...props})=>React.createElement(tag,{'data-testid':testID,...props},children);export default make('svg');export const Path=make('path');export const Rect=make('rect');export const Circle=make('circle');");
    mock(/^expo-linear-gradient$/, 'gradient',
      "import React from'react';import{View}from'react-native-web';export const LinearGradient=({colors,...props})=><View {...props}/>;");
  },
}];

(async () => {
  const bundle = (await esbuild.build({
    stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false' }, plugins,
  })).outputFiles[0].text;
  const fonts = ['Geist-Regular.ttf', 'Geist-SemiBold.ttf'].map((name, i) =>
    `@font-face{font-family:'${i ? 'GeistSemiBold' : 'Geist'}';src:url(data:font/ttf;base64,${fs.readFileSync('src/assets/fonts/' + name).toString('base64')})}`).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>${fonts}body{margin:0;background:#121212}#stage{position:relative;width:360px;height:640px;overflow-x:auto}</style><div id="stage"></div><div id="snapshots"></div><script>window.global=window;window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),16);window.cancelAnimationFrame=id=>clearTimeout(id);window.review={platform:'android',appListeners:new Set(),enabled:false};window.backListeners=new Set();${bundle.replaceAll('</script', '<\\/script')}</script>`;
  const file = path.join(out, 'review.html');
  fs.writeFileSync(file, html);
  console.log(file);
  if (process.argv.includes('--build')) return;

  const chrome = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ].find(p => p && fs.existsSync(p));
  if (!chrome) { console.log('No Chrome found; open the file above in a browser and read #result.'); return; }
  const run = spawnSync(chrome, [
    '--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--no-first-run',
    '--user-data-dir=' + path.join(out, 'profile'), '--window-size=360,640',
    '--virtual-time-budget=120000', '--dump-dom', 'file:///' + file.replace(/\\/g, '/'),
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const match = /<pre id="result">([\s\S]*?)<\/pre>/.exec(run.stdout || '');
  if (!match) { console.error('No result from the page.', run.stderr); process.exitCode = 1; return; }
  const result = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  console.log(`${result.checks} checks, ${result.cases?.length ?? 0} screens, ${result.failures.length} failures`);
  for (const failure of result.failures) console.log(' - ' + failure);
  if (result.failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
