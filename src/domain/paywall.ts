export const FREE_TIER_APP_CAP = 3;
export const FREE_HISTORY_DAYS = 14;
export type PaywallFeature = 'apps' | 'app-rules' | 'coach' | 'history' | 'modes';
export type ProFeature = { id: PaywallFeature; label: string; freeValue: string; proValue: string; platforms: readonly string[] };
/** Product gates: picker cap, Android rules entitlement, basic coach, history cutoff,
 * and paid-only custom-mode availability. There is no numeric custom-mode count cap. */
export const PRO_FEATURES: readonly ProFeature[] = [
  { id: 'apps', label: 'Flagged apps', freeValue: String(FREE_TIER_APP_CAP), proValue: 'Unlimited', platforms: ['android', 'ios', 'web'] },
  { id: 'app-rules', label: 'App rules', freeValue: 'No', proValue: 'Schedules and daily limits', platforms: ['android'] },
  { id: 'coach', label: 'Focus coach', freeValue: 'Basic', proValue: 'Trends, patterns, weekly experiment', platforms: ['android', 'ios', 'web'] },
  { id: 'history', label: 'Full history', freeValue: FREE_HISTORY_DAYS + ' days', proValue: 'Everything', platforms: ['android', 'ios', 'web'] },
  { id: 'modes', label: 'Custom modes', freeValue: 'No', proValue: 'More modes', platforms: ['android', 'ios', 'web'] },
];
export const PAYWALL_COPY: Record<PaywallFeature, { title: string; subtitle: string }> = {
  apps: { title: 'Add more apps with Pro', subtitle: 'Free covers ' + FREE_TIER_APP_CAP + ' flagged apps. Pro removes the limit.' },
  'app-rules': { title: 'Unlock App rules', subtitle: 'Schedule app blocks and set daily limits with Pro.' },
  coach: { title: 'Get your full focus coach', subtitle: 'Go beyond basic notes with trends, patterns and weekly experiments.' },
  history: { title: 'See your full history', subtitle: 'Free covers ' + FREE_HISTORY_DAYS + ' days. Pro shows your full history.' },
  modes: { title: 'Create more modes with Pro', subtitle: 'Custom modes are available with Pro.' },
};
export function proFeaturesFor(feature: PaywallFeature, platform: string): ProFeature[] {
  const rows = PRO_FEATURES.filter(row => row.platforms.includes(platform));
  return [...rows.filter(row => row.id === feature), ...rows.filter(row => row.id !== feature)];
}
export function flaggedAppSlots(paid: boolean, savedCount: number): number {
  return paid ? Number.POSITIVE_INFINITY : Math.max(0, FREE_TIER_APP_CAP - savedCount);
}
export function canAddFlaggedApp(paid: boolean, savedCount: number): boolean {
  return flaggedAppSlots(paid, savedCount) > 0;
}
/** Preserve existing selections, including after downgrade; only additions are clamped. */
export function toggleAllFlaggedApps(current: readonly string[], visible: readonly string[], remainingSlots: number): string[] {
  const candidates = [...new Set(visible)];
  if (candidates.length && candidates.every(id => current.includes(id))) return current.filter(id => !candidates.includes(id));
  const next = [...current];
  for (const id of candidates) if (!next.includes(id) && next.length < remainingSlots) next.push(id);
  return next;
}
export function appCapPromptAction(alreadyShown: boolean): 'sheet' | 'flash' {
  return alreadyShown ? 'flash' : 'sheet';
}

export const DEV_FLAGS = {
  forcePaidUser: false,
  // MUST be false for store release. When false, the switcher is hidden, the
  // override is ignored and cleared, and isPaidUser() behaves as it does for
  // real users.
  tierSwitcher: true,
  resetOnboarding: false,
  // Runs the iPhone onboarding and permissions gate before the App.tsx
  // bypass comes out. Pair with resetOnboarding to see it from the start.
  iosOnboardingPreview: false,
};

export const TIER_SWITCHER_ENABLED = DEV_FLAGS.tierSwitcher;

export type TestTierOverride = 'free' | 'paid' | null;

let testTierOverride: TestTierOverride = null;
const tierListeners = new Set<(tier: TestTierOverride) => void>();

if (TIER_SWITCHER_ENABLED && typeof __DEV__ !== 'undefined' && !__DEV__) {
  console.warn(
    'RELEASE WARNING: DEV_FLAGS.tierSwitcher is true. Set tierSwitcher=false and forcePaidUser=false before store release.',
  );
}

export function getTestTierOverride(): TestTierOverride {
  return TIER_SWITCHER_ENABLED ? testTierOverride : null;
}

export function setTestTierOverride(tier: TestTierOverride): void {
  const next = TIER_SWITCHER_ENABLED ? tier : null;
  if (testTierOverride === next) {
    return;
  }

  testTierOverride = next;
  tierListeners.forEach(listener => listener(testTierOverride));
}

export function subscribeToTier(
  listener: (tier: TestTierOverride) => void,
): () => void {
  tierListeners.add(listener);
  return () => tierListeners.delete(listener);
}

// TEMP STUB - replace this single function with a real RevenueCat entitlement
// check once that integration lands.
export function isPaidUser(): boolean {
  if (TIER_SWITCHER_ENABLED && testTierOverride !== null) {
    return testTierOverride === 'paid';
  }

  return DEV_FLAGS.forcePaidUser;
}
