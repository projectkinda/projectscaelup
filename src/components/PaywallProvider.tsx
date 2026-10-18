import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PaywallFeature } from '../domain/paywall';
import { PaywallSheet } from './PaywallSheet';

type Paywall = { show: (feature: PaywallFeature) => void };
const PaywallContext = createContext<Paywall | null>(null);

/** One overlay above the mounted tabs; showing it never changes navigation. */
export function PaywallProvider({ children }: { children: ReactNode }) {
  const [feature, setFeature] = useState<PaywallFeature | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback((next: PaywallFeature) => setFeature(next), []);
  const value = useMemo(() => ({ show }), [show]);
  return <PaywallContext.Provider value={value}>
    {children}
    {feature !== null ? <PaywallSheet feature={feature} bottomInset={insets.bottom} onClose={() => setFeature(null)}/> : null}
  </PaywallContext.Provider>;
}

export function usePaywall(): Paywall {
  const paywall = useContext(PaywallContext);
  if (!paywall) throw new Error('usePaywall requires the root PaywallProvider.');
  return paywall;
}
