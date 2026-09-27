import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { FlaggedAppsView, ScreenTime, type ScreenTimeStatus } from '../../modules/screen-time';
import { FREE_TIER_APP_CAP } from '../data/settingsRepository';
import { colors } from '../theme/tokens';

type IosFlaggedAppsProps = {
  status: ScreenTimeStatus | null;
  paidUser: boolean;
  onStatusChange: (status: ScreenTimeStatus) => void;
};

/**
 * Flagged apps on iOS. The apps are chosen in Apple's picker and drawn by iOS;
 * this component only knows how many there are. By default their use is
 * tracked silently during sessions (like Android); strict mode locks them
 * instead (see docs/ios-screen-time-design.md).
 */
export function IosFlaggedApps({ status, paidUser, onStatusChange }: IosFlaggedAppsProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  if (!status) {
    return <Text style={styles.message}>Screen Time isn't available on this device.</Text>;
  }

  const hasAccess = status.authorization === 'approved';
  const hasApps = status.flaggedAppCount > 0;

  const run = async (task: () => Promise<ScreenTimeStatus | null>) => {
    setIsBusy(true);
    try {
      const next = await task();
      if (next) {
        onStatusChange(next);
        setRevision(value => value + 1);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const setStrictMode = (enabled: boolean) =>
    run(async () => {
      try {
        return await ScreenTime.setStrictMode(enabled);
      } catch (error) {
        Alert.alert('Unable to change strict mode', errorMessage(error));
        return null;
      }
    });

  const pickApps = () =>
    run(async () => {
      try {
        return await ScreenTime.presentFlaggedAppsPicker(paidUser ? null : FREE_TIER_APP_CAP);
      } catch (error) {
        Alert.alert('Unable to open the app picker', errorMessage(error));
        return null;
      }
    });

  // Revoking access voids Apple's app tokens, so after granting it again the
  // picker opens with the saved list for the user to confirm (feedback F4).
  const allowAccess = () =>
    run(async () => {
      try {
        const granted = await ScreenTime.requestAuthorization();
        if (granted?.authorization !== 'approved') {
          return granted;
        }
        return await ScreenTime.presentFlaggedAppsPicker(paidUser ? null : FREE_TIER_APP_CAP);
      } catch {
        // Declining is a normal choice, so explain rather than log it.
        Alert.alert(
          'Screen Time access is needed',
          'Allow Project ScaleUp in Settings › Screen Time to track distracting apps during focus sessions.',
        );
        return ScreenTime.getStatus();
      }
    });

  if (!hasAccess) {
    return (
      <View style={styles.stack}>
        <Text style={styles.message}>
          {hasApps
            ? `Screen Time access is off, so tracking is paused. Your ${status.flaggedAppCount} flagged ${plural(status.flaggedAppCount, 'app')} are saved.`
            : 'Track distracting apps during focus sessions and lock them afterwards. This needs Screen Time access.'}
        </Text>
        <ActionButton
          label={hasApps ? 'Turn Screen Time back on' : 'Allow Screen Time access'}
          busy={isBusy}
          onPress={allowAccess}
        />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {hasApps ? (
        <FlaggedAppsView revision={revision} style={styles.strip} />
      ) : (
        <Text style={styles.message}>No distracting apps selected yet.</Text>
      )}
      {status.canEditFlaggedApps ? (
        <ActionButton label={hasApps ? 'Edit flagged apps' : 'Choose apps'} busy={isBusy} onPress={pickApps} />
      ) : (
        <Text style={styles.message}>Flagged apps can't be changed during a focus session or lockdown.</Text>
      )}
      {hasApps ? (
        <View style={styles.optionRow}>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Strict mode</Text>
            <Text style={styles.message}>
              {status.strictMode
                ? 'Flagged apps are locked during sessions. Opening one anyway counts as a distraction.'
                : 'Off: use any app during a session. A minute in a flagged app counts as a distraction.'}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Strict mode"
            value={status.strictMode}
            disabled={isBusy || !status.canEditFlaggedApps}
            onValueChange={setStrictMode}
            trackColor={{ true: colors.rewardAmber }}
          />
        </View>
      ) : null}
    </View>
  );
}

function ActionButton({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

function plural(count: number, word: string) {
  return count === 1 ? word : `${word}s`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Try again in a moment.';
}

const styles = StyleSheet.create({
  stack: {
    paddingVertical: 12,
    gap: 12,
  },
  strip: {
    height: 56,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
  },
  optionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  buttonText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
