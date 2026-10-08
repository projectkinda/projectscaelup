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
