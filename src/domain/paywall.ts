export const DEV_FLAGS = {
  forcePaidUser: false,
  resetOnboarding: false,
  // Runs the iPhone onboarding and permissions gate before the App.tsx
  // bypass comes out. Pair with resetOnboarding to see it from the start.
  iosOnboardingPreview: false,
};

// TEMP STUB - replace this single function with a real RevenueCat entitlement
// check once that integration lands.
export function isPaidUser(): boolean {
  return DEV_FLAGS.forcePaidUser;
}
