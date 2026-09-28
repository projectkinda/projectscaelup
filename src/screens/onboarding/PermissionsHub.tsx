import { LinearGradient } from 'expo-linear-gradient';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  type RequiredPermissionStatus,
} from '../../domain/onboardingState';
import { colors, layout } from '../../theme/tokens';

export type PermissionKind = 'camera' | 'accessibility' | 'overlay';

type PermissionsHubProps = {
  mode: 'onboarding' | 'gate';
  status: RequiredPermissionStatus;
  onOpenStep: (permission: PermissionKind) => void;
  onContinue?: () => void;
};

const ROWS: Array<{
  id: PermissionKind;
  icon: string;
  title: string;
  reason: string;
}> = [
  {
    id: 'camera',
    icon: 'C',
    title: 'Camera',
    reason: "Checks you're at your desk.",
  },
  {
    id: 'accessibility',
    icon: 'A',
    title: 'Accessibility',
    reason: 'Notices when you open the apps you picked.',
  },
  {
    id: 'overlay',
    icon: 'O',
    title: 'Display over other apps',
    reason: "Shows the lock screen on top of locked apps.",
  },
];

function isDone(status: RequiredPermissionStatus, permission: PermissionKind) {
  return status[permission];
}

export function PermissionsHub({
  mode,
  status,
  onOpenStep,
  onContinue,
}: PermissionsHubProps) {
  const insets = useSafeAreaInsets();
  const showContinue = mode === 'onboarding';

  return (
    <View style={styles.screen}>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 54,
            paddingBottom:
              insets.bottom + (showContinue ? 112 : layout.bottomNavHeight + 34),
          },
        ]}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Turn on 3 things</Text>
          <Text style={styles.subtitle}>The app needs all three to work.</Text>

          <View style={styles.permissionList}>
            {ROWS.map(row => {
              const done = isDone(status, row.id);
              return (
                <Pressable
                  key={row.id}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: done }}
                  accessibilityLabel={`${row.title}. ${done ? 'On' : 'Not on'}. ${row.reason}`}
                  disabled={done}
                  onPress={() => onOpenStep(row.id)}
                  style={({ pressed }) => [
                    styles.card,
                    pressed && styles.pressed,
                    done && styles.doneCard,
                  ]}
                >
                  <View style={styles.iconBubble}>
                    <Text style={styles.iconText}>{row.icon}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <View style={styles.rowHeader}>
                      <Text style={styles.rowTitle}>{row.title}</Text>
                      {mode === 'gate' && !done ? (
                        <Text style={styles.offLabel}>Off</Text>
                      ) : null}
                    </View>
                    <Text style={styles.rowReason}>{row.reason}</Text>
                  </View>
                  <View style={[styles.statusMark, done && styles.statusDone]}>
                    {done ? <View style={styles.checkMark} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {showContinue ? (
        <View
          style={[
            styles.bottomBar,
            { paddingBottom: insets.bottom + 18 },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !status.all }}
            disabled={!status.all}
            onPress={onContinue}
            style={({ pressed }) => [
              styles.primaryShell,
              pressed && styles.pressed,
              !status.all && styles.disabledShell,
            ]}
          >
            <LinearGradient
              colors={['#333333', '#141414']}
              pointerEvents="none"
              style={styles.primaryButton}
            >
              <Text
                style={[
                  styles.primaryLabel,
                  !status.all && styles.disabledLabel,
                ]}
              >
                Continue
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const CARD_BORDER = 'rgba(255, 255, 255, 0.12)';

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    paddingHorizontal: layout.horizontalPadding,
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '600',
  },
  permissionList: {
    marginTop: 40,
    gap: 12,
  },
  card: {
    minHeight: 92,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: colors.module,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  doneCard: {
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  iconText: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    flexShrink: 1,
    color: colors.ink,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  rowReason: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  offLabel: {
    color: colors.mutedRust,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  statusMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.26)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDone: {
    borderColor: colors.ink,
  },
  checkMark: {
    width: 12,
    height: 7,
    marginTop: -1,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.ink,
    transform: [{ rotate: '-45deg' }],
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: 14,
    backgroundColor: colors.background,
  },
  primaryShell: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    height: 53,
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: colors.warmWhite,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  disabledShell: {
    opacity: 0.44,
  },
  disabledLabel: {
    color: 'rgba(253, 251, 246, 0.6)',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.995 }],
  },
});
