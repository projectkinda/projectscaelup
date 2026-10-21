import { Platform } from 'react-native';

// Subscription terms shown on the paywall. Price and period come from RevenueCat
// (the store's own localised values) once billing is wired up; never hardcode them.
// Until then they stay null and the disclosure line is hidden in release builds.

export const SUBSCRIPTION_TERMS: { price: string | null; period: string | null } = {
  price: null,
  period: null,
};

export function storeName(platform: string = Platform.OS): string {
  return platform === 'ios' ? 'the App Store' : 'Google Play';
}

/** "{price} per {period}. Renews automatically until you cancel in {store}." */
export function subscriptionDisclosure(
  terms: { price: string | null; period: string | null } = SUBSCRIPTION_TERMS,
  platform: string = Platform.OS,
  showPlaceholders: boolean = typeof __DEV__ !== 'undefined' && __DEV__,
): string | null {
  if (!(terms.price && terms.period) && !showPlaceholders) return null;
  return `${terms.price ?? '{price}'} per ${terms.period ?? '{period}'}. Renews automatically until you cancel in ${storeName(platform)}.`;
}
