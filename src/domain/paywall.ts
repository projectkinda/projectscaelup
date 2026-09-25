export const DEV_FLAGS = {
  forcePaidUser: false,
};

// TEMP STUB - replace this single function with a real RevenueCat entitlement
// check once that integration lands.
export function isPaidUser(): boolean {
  return DEV_FLAGS.forcePaidUser;
}
