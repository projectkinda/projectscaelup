import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from './AppText';
import { DEV_FLAGS } from '../domain/paywall';
import { colors } from '../theme/tokens';
import { typography } from '../theme/typography';
function CheckMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" accessibilityLabel="Included">
      <Path
        d="M5 12.5 L10 17 L19 7"
        fill="none"
        stroke={colors.ink}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={3}
      />
    </Svg>
  );
}


export function PaywallSheet({
  visible = true,
  feature = 'coach',
  onClose,
  bottomInset = 0,
}: {
  visible?: boolean;
  feature?: 'coach' | 'app-rules';
  onClose: () => void;
  bottomInset?: number;
}) {
  const rows = [
    'Clean-focus trend',
    'Last session breakdown',
    ...(Platform.OS === 'android' ? ['Away from flagged apps'] : []),
    'Your pattern',
    'Weekly experiment',
    ...(Platform.OS === 'android' ? ['App rules'] : []),
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.paywallOverlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={feature === 'app-rules' ? 'Close App rules upgrade' : 'Close focus coach upgrade'}
          onPress={onClose}
          style={styles.paywallBackdrop}
        />
        <View
          style={[
            styles.paywallSheet,
            { maxHeight: '90%' },
            { paddingBottom: Math.max(20, bottomInset + 14) },
          ]}
        >
          <View style={styles.paywallHeader}>
            <Text style={styles.paywallTitle}>{feature === 'app-rules' ? 'Unlock App rules' : 'Get your full focus coach'}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={({ pressed }) => [
                styles.paywallClose,
                pressed && styles.textActionPressed,
              ]}
            >
              <Text style={styles.paywallCloseText}>X</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={styles.sheetBody}>
          <View style={styles.paywallTable}>
            <View style={styles.paywallTableHeader}>
              <Text style={styles.paywallFeatureHeader}>Feature</Text>
              <Text style={styles.paywallPlanHeader}>Free</Text>
              <Text style={styles.paywallPlanHeader}>Pro</Text>
            </View>
            {rows.map(row => (
              <View key={row} style={[styles.paywallTableRow, feature === 'app-rules' && row === 'App rules' && styles.highlight]}>
                <Text style={styles.paywallFeature}>{row}</Text>
                <Text style={[styles.paywallDash, row === 'App rules' && styles.ruleFree]}>{row === 'App rules' ? 'No' : '-'}</Text>
                <View style={styles.paywallCheck}>
                  {row === 'App rules' ? <Text style={styles.rulePro}>Schedules and daily limits</Text> : <CheckMark />}
                </View>
              </View>
            ))}
          </View>
          {DEV_FLAGS.tierSwitcher ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                disabled
                style={styles.paywallContinueDisabled}
              >
                <Text style={styles.paywallContinueText}>Continue</Text>
              </Pressable>
              <Text style={styles.paywallComingSoon}>Purchases coming soon</Text>
            </>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Not now"
            onPress={onClose}
            style={({ pressed }) => [
              styles.paywallNotNow,
              pressed && styles.textActionPressed,
            ]}
          >
            <Text style={styles.paywallNotNowText}>Not now</Text>
          </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}


const styles = StyleSheet.create({
  textActionPressed: { opacity: 0.55 },
  paywallOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  paywallBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  paywallSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    backgroundColor: colors.module,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  paywallHeader: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  paywallTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.white,
    ...typography.stat,
    fontWeight: '700',
  },
  paywallClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  paywallCloseText: {
    color: colors.ink,
    ...typography.stat,
    fontWeight: '700',
  },
  paywallTable: {
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  paywallTableHeader: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  paywallFeatureHeader: {
    flex: 1,
    color: colors.muted,
    ...typography.label,
    fontWeight: '700',
  },
  paywallPlanHeader: {
    width: 88,
    color: colors.ink,
    ...typography.label,
    fontWeight: '700',
    textAlign: 'center',
  },
  paywallTableRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  paywallFeature: {
    flex: 1,
    minWidth: 0,
    color: colors.white,
    ...typography.label,
    fontWeight: '600',
  },
  paywallDash: {
    width: 88,
    color: colors.muted,
    ...typography.subheading,
    textAlign: 'center',
  },
  paywallCheck: {
    width: 88,
    alignItems: 'center',
  },
  paywallContinueDisabled: {
    minHeight: 48,
    marginTop: 18,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  paywallContinueText: {
    color: colors.muted,
    ...typography.body,
    fontWeight: '700',
  },
  paywallComingSoon: {
    marginTop: 8,
    color: colors.muted,
    ...typography.caption,
    textAlign: 'center',
  },
  paywallNotNow: {
    minHeight: 42,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paywallNotNowText: {
    color: colors.ink,
    ...typography.label,
    fontWeight: '700',
  },
  highlight: { backgroundColor: colors.goalSurface },
  ruleFree: { ...typography.label },
  rulePro: { color: colors.ink, ...typography.caption, textAlign: 'center', paddingVertical: 10 },
  sheetBody: { flexGrow: 1 },
});
