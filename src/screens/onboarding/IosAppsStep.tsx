import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  FlaggedAppsView,
  ScreenTime,
  type ScreenTimeStatus,
} from '../../../modules/screen-time';
import { FREE_TIER_APP_CAP } from '../../data/settingsRepository';
import { isPaidUser } from '../../domain/paywall';
import { colors, layout } from '../../theme/tokens';
import { BackButton } from './DoneStep';
import { PrimaryBar } from './WelcomeStep';

type IosAppsStepProps = {
  onBack: () => void;
  onContinue: () => void;
};

/**
 * iPhone apps step. Apps are chosen in Apple's picker, which hides the choice
 * from us: we can't pre-check the usual suspects, only suggest them, and we
 * only ever learn how many apps were picked.
 */
export function IosAppsStep({ onBack, onContinue }: IosAppsStepProps) {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<ScreenTimeStatus | null>(() =>
    ScreenTime.getStatus(),
  );
  const [revision, setRevision] = useState(0);
  const [isPicking, setIsPicking] = useState(false);
  const paidUser = isPaidUser();

  const hasAccess = status?.authorization === 'approved';
  const hasApps = (status?.flaggedAppCount ?? 0) > 0;

  const pickApps = async () => {
    setIsPicking(true);
    try {
      const next = await ScreenTime.presentFlaggedAppsPicker(
        paidUser ? null : FREE_TIER_APP_CAP,
      );
      if (next) {
        setStatus(next);
        setRevision(value => value + 1);
      }
    } catch (error) {
      Alert.alert(
        'Unable to open the app picker',
        error instanceof Error ? error.message : 'Try again in a moment.',
      );
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 26,
            paddingBottom: insets.bottom + 112,
          },
        ]}
      >
        <BackButton onPress={onBack} />
        <Text style={styles.title}>
          {paidUser ? 'Pick your apps' : `Pick up to ${FREE_TIER_APP_CAP} apps`}
        </Text>
        <Text style={styles.subtitle}>
          The ones that pull you away most. Start with Instagram, Snapchat and
          TikTok. You can change this any time in Settings.
        </Text>

        <View style={styles.pickerArea}>
          {hasApps ? (
            <FlaggedAppsView revision={revision} style={styles.strip} />
          ) : null}
          {hasAccess ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: isPicking, disabled: isPicking }}
              disabled={isPicking}
              onPress={pickApps}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            >
              {isPicking ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <Text style={styles.buttonText}>
                  {hasApps ? 'Change apps' : 'Choose apps'}
                </Text>
              )}
            </Pressable>
          ) : (
            <Text style={styles.hint}>
              Screen Time is off. Go back and turn it on to pick apps.
            </Text>
          )}
        </View>
      </View>
      <PrimaryBar
        label="Continue"
        disabled={!hasAccess || !hasApps || isPicking}
        onPress={onContinue}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.horizontalPadding,
  },
  title: {
    marginTop: 42,
    color: colors.ink,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  hint: {
    color: colors.mutedRust,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  pickerArea: {
    marginTop: 32,
    gap: 16,
  },
  strip: {
    height: 56,
  },
  button: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  buttonText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
