import { Alert } from 'react-native';

// TODO: RevenueCat replaces this single purchase entry point when billing launches.
export function beginProPurchase(): void {
  Alert.alert("Pro isn't available yet", "Purchases open soon. We'll let you know when Pro launches.", [{ text: 'OK' }]);
}
