import { typography } from '../../theme/typography';
import { Text } from '../../components/AppText';
import { PillButton } from '../../components/settingsGuide/PillButton';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  type RequiredPermissionStatus,
} from '../../domain/onboardingState';
import { colors, layout } from '../../theme/tokens';
import { BackButton } from './DoneStep';

export type PermissionKind = 'camera' | 'accessibility' | 'overlay' | 'screenTime';

type PermissionsHubProps = {
  mode: 'onboarding' | 'gate';
  status: RequiredPermissionStatus;
  onBack?: () => void;
  onOpenStep: (permission: PermissionKind) => void;
  onContinue?: () => void;
};

type PermissionRow = {
  id: PermissionKind;
  icon: string;
  title: string;
  reason: string;
};

const CAMERA_ROW: PermissionRow = {
  id: 'camera',
  icon: 'C',
  title: 'Camera',
  reason: "Checks you're at your desk.",
};

const ANDROID_ROWS: PermissionRow[] = [
  CAMERA_ROW,
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

// iPhone has no overlay step: Apple draws the lock screen itself.
const IOS_ROWS: PermissionRow[] = [
  CAMERA_ROW,
  {
    id: 'screenTime',
    icon: 'S',
    title: 'Screen Time',
    reason: 'Notices the apps you pick and locks them afterwards.',
  },
];

const ROWS = Platform.OS === 'ios' ? IOS_ROWS : ANDROID_ROWS;
const HEADING =
  Platform.OS === 'ios'
    ? { title: 'Turn on 2 things', subtitle: 'The app needs both to work.' }
    : { title: 'Turn on 3 things', subtitle: 'The app needs all three to work.' };

function isDone(status: RequiredPermissionStatus, permission: PermissionKind) {
  return status[permission];
}

export function PermissionsHub({
  mode,
  status,
  onBack,
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
          {onBack ? <BackButton onPress={onBack} /> : null}
          <Text style={styles.title}>{HEADING.title}</Text>
          <Text style={styles.subtitle}>{HEADING.subtitle}</Text>

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
          <PillButton label="Continue" disabled={!status.all} onPress={() => onContinue?.()} />
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
    ...typography.title,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 10,
    color: colors.muted,
    ...typography.subheading,
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
    ...typography.subheading,
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
    ...typography.subheading,
    fontWeight: '800',
  },
  rowReason: {
    marginTop: 4,
    color: colors.muted,
    ...typography.label,
    fontWeight: '600',
  },
  offLabel: {
    color: colors.mutedRust,
    ...typography.label,
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
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.995 }],
  },
});
