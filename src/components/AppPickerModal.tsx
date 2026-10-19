import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './AppText';
import { AppPickerList } from './AppPickerList';
import { BackButton } from '../screens/onboarding/DoneStep';
import { usePickerBack } from './usePickerBack';
import { usePaywall } from './PaywallProvider';
import type { InstalledApp } from '../domain/appPicker';
import { appCapPromptAction } from '../domain/paywall';
import { colors } from '../theme/tokens';
import { typography } from '../theme/typography';

export function AppPickerModal({ apps, isSaving, query, remainingSlots, selectedAppIdentifiers, visible,
  onCancel, onChangeQuery, onSave, onToggleAllVisible, onToggleApp,
  variant = 'default', loadError, isLoading, onRetry, freeAppLimit, onUpgrade, installedAppCount = apps.length,
}: {
  variant?: 'default' | 'rule';
  installedAppCount?: number;
  freeAppLimit?: { cap: number; savedCount: number }; onUpgrade?: () => void;
  loadError?: string; isLoading?: boolean; onRetry?: () => void;
  apps: InstalledApp[]; isSaving: boolean; query: string; remainingSlots: number; selectedAppIdentifiers: string[]; visible: boolean;
  onCancel: () => void; onChangeQuery: (value: string) => void; onSave: () => void;
  onToggleAllVisible: (apps: InstalledApp[]) => void; onToggleApp: (app: InstalledApp) => void;
}) {
  const insets = useSafeAreaInsets();
  const { isVisible: paywallVisible } = usePaywall();
  const { back, keyboardVisible } = usePickerBack(query, () => onChangeQuery(''), onCancel, visible && !paywallVisible);
  const promptShown = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    promptShown.current = false; setFlashing(false);
    return () => { if (flashTimer.current) clearTimeout(flashTimer.current); };
  }, [visible]);
  const showFreeLimit = Platform.OS === 'android' && variant === 'default' && !!freeAppLimit;
  const upgrade = () => { Keyboard.dismiss(); promptShown.current = true; onUpgrade?.(); };
  const capAttempt = () => {
    if (!showFreeLimit) return;
    if (appCapPromptAction(promptShown.current) === 'sheet') upgrade();
    else {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      setFlashing(true); flashTimer.current = setTimeout(() => setFlashing(false), 500);
    }
  };
  useEffect(() => {
    if (!visible || paywallVisible || installedAppCount > 0 || !onRetry) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && !isLoading) onRetry();
    });
    return () => subscription.remove();
  }, [visible, paywallVisible, installedAppCount, isLoading, onRetry]);
  const selectedCount = selectedAppIdentifiers.length;
  return <Modal visible={visible && !paywallVisible} animationType="slide" presentationStyle="fullScreen"
    statusBarTranslucent navigationBarTranslucent onRequestClose={back}>
    <KeyboardAvoidingView testID="app-picker-modal" behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + 16, paddingBottom: keyboardVisible ? 12 : Math.max(24, insets.bottom + 16) }]}>
        <View style={styles.header}>
          <BackButton onPress={back} />
          <Text style={styles.title}>Add apps</Text>
        </View>
        <Text style={styles.subtitle}>Add apps from phone</Text>
        {isLoading ? <ActivityIndicator color={colors.muted} accessibilityLabel="Loading apps" /> : null}
        {loadError ? <View accessibilityLiveRegion="polite">
          <Text style={styles.muted}>{loadError}</Text>
          <Pressable accessibilityRole="button" disabled={isLoading} onPress={onRetry} style={styles.retry}><Text style={styles.muted}>Retry</Text></Pressable>
        </View> : null}
        <AppPickerList apps={apps} installedAppCount={installedAppCount} loading={isLoading} onRetry={onRetry} query={query} onChangeQuery={onChangeQuery} selectedIds={selectedAppIdentifiers}
          onToggle={packageName => { const app = apps.find(item => item.packageName === packageName); if (app) onToggleApp(app); }}
          maxSelectable={remainingSlots} onToggleAllVisible={onToggleAllVisible} onDisabledPress={showFreeLimit ? capAttempt : undefined} />
        <View testID="app-picker-footer" style={styles.footer}>
          {showFreeLimit ? <View testID="free-app-cap-banner" accessibilityLiveRegion="polite" style={[styles.counter, flashing && styles.capFlash]}>
            <Text style={styles.muted}>{Math.min(freeAppLimit.cap, freeAppLimit.savedCount + selectedCount)} of {freeAppLimit.cap} free apps</Text>
          </View> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Add selected apps" disabled={selectedCount === 0 || isSaving}
            onPress={onSave} style={({ pressed }) => [styles.addButton, (pressed || selectedCount === 0 || isSaving) && styles.pressed]}>
            {isSaving ? <ActivityIndicator color={colors.background} /> : <Text style={styles.addText}>Add</Text>}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, ...typography.title, color: colors.ink, fontWeight: '700' },
  subtitle: { ...typography.body, color: colors.muted, marginTop: 12, marginBottom: 20 },
  footer: { flexShrink: 0, paddingTop: 12, gap: 8 },
  counter: { minHeight: 32, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  capFlash: { borderColor: colors.rewardAmber, backgroundColor: colors.goalSurface },
  muted: { ...typography.label, color: colors.muted },
  addButton: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  addText: { ...typography.body, fontWeight: '700', color: colors.background },
  retry: { minHeight: 44, justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
