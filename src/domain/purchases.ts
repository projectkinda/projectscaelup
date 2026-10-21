import { Alert } from 'react-native';

// TODO: RevenueCat replaces this single purchase entry point when billing launches.
export function beginProPurchase(): void {
  Alert.alert("Pro isn't available yet", "Purchases open soon. We'll let you know when Pro launches.", [{ text: 'OK' }]);
}

// TODO: RevenueCat replaces this with the real restore call; Settings and the paywall share it.
export function restorePurchases(): void {
  Alert.alert('Restore purchases', 'RevenueCat is not connected yet. This button is ready for the restore call when billing is added.');
}
