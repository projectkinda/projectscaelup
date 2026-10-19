import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '../../screens/onboarding/DoneStep';
import { Text } from '../AppText';
import { type PermissionGuideConfig } from '../../domain/settingsGuideConfig';
import { colors, layout } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { PillButton } from './PillButton';

type Props = {
  disclosure: PermissionGuideConfig['disclosure'];
  saving: boolean;
  saveFailed: boolean;
  onAgree: () => void;
  onDecline: () => void;
  onBack: () => void;
};

/**
 * The in-app disclosure shown before anyone is sent to Settings. Google Play
 * wants it prominent, in plain words, with a clear yes and a clear no.
 */
export function PermissionDisclosure({
  disclosure,
  saving,
  saveFailed,
  onAgree,
  onDecline,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 26, paddingBottom: 24 },
        ]}
      >
        <View style={styles.content}>
          <BackButton onPress={onBack} />
          <Text accessibilityRole="header" style={styles.title}>
            {disclosure.title}
          </Text>
          <Text style={styles.body}>{disclosure.does}</Text>

          <Text accessibilityRole="header" style={styles.heading}>
            {disclosure.doesNotHeading}
          </Text>
          {disclosure.doesNot.map(line => (
            <View key={line} style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={[styles.body, styles.bulletText]}>{line}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.barInner}>
          {saveFailed ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              Could not save your choice. Try again.
            </Text>
          ) : null}
          <PillButton
            label={disclosure.agreeLabel}
            onPress={onAgree}
            disabled={saving}
          />
          <PillButton kind="text" label={disclosure.declineLabel} onPress={onDecline} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    paddingHorizontal: layout.horizontalPadding,
  },
  title: {
    marginTop: 24,
    color: colors.ink,
    ...typography.title,
    fontWeight: '800',
  },
  body: { marginTop: 16, color: colors.ink, ...typography.subheading },
  heading: { marginTop: 28, color: colors.ink, ...typography.heading, fontWeight: '800' },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 26,
    backgroundColor: colors.pine,
  },
  bulletText: { flex: 1 },
  bar: {
    alignItems: 'center',
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: 12,
    backgroundColor: colors.background,
  },
  barInner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 4 },
  error: { color: colors.rewardAmber, ...typography.body, fontWeight: '600', textAlign: 'center' },
});
