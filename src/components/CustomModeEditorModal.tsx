import { warn } from '../domain/releaseLog';
import { CUSTOM_MODE_DEFAULT_MINUTES, isValidDefaultMinutes, TIMER_MAX_MINUTES } from '../domain/modeDurations';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, TextInput } from './AppText';
import { saveCustomMode, type CustomMode } from '../data/settingsRepository';
import { CUSTOM_MODE_EDITOR_INTRO, cameraDistanceText, lookAwayDescription, modeFrameRange } from '../domain/customModeCopy';
import { colors } from '../theme/tokens';
import { typography } from '../theme/typography';

const MIN_GRACE_SECONDS = 3;
const MAX_GRACE_SECONDS = 90;
const CARD_BORDER = 'rgba(255, 255, 255, 0.12)';

export function CustomModeEditorModal({
  visible,
  mode,
  onCancel,
  onSaved,
}: {
  visible: boolean;
  mode: CustomMode | null;
  onCancel: () => void;
  onSaved: (mode: CustomMode) => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [defaultMinutesText, setDefaultMinutesText] = useState(String(CUSTOM_MODE_DEFAULT_MINUTES));
  const [gracePeriodSeconds, setGracePeriodSeconds] = useState(12);
  const [trackWidth, setTrackWidth] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setName(mode?.name ?? '');
    setDefaultMinutesText(String(mode?.defaultMinutes ?? CUSTOM_MODE_DEFAULT_MINUTES));
    setGracePeriodSeconds(mode?.gracePeriodSeconds ?? 12);
    setIsSaving(false);
  }, [mode, visible]);

  const clampedName = name.trim().slice(0, 20);
  const progress =
    (gracePeriodSeconds - MIN_GRACE_SECONDS) /
    (MAX_GRACE_SECONDS - MIN_GRACE_SECONDS);

  const setGraceFromPosition = (locationX: number) => {
    if (trackWidth <= 0) {
      return;
    }

    const rawProgress = Math.max(0, Math.min(1, locationX / trackWidth));
    const nextValue = Math.round(
      MIN_GRACE_SECONDS +
        rawProgress * (MAX_GRACE_SECONDS - MIN_GRACE_SECONDS),
    );
    setGracePeriodSeconds(nextValue);
  };

  const submit = async () => {
    if (clampedName.length === 0) {
      Alert.alert('Name required', 'Add a name for this custom mode.');
      return;
    }

    const defaultMinutes = Number(defaultMinutesText);
    if (defaultMinutesText.trim() === '' || !isValidDefaultMinutes(defaultMinutes)) {
      Alert.alert('Invalid session length', 'Enter a whole number of minutes from 0 to ' + TIMER_MAX_MINUTES + '.');
      return;
    }

    setIsSaving(true);
    try {
      const savedMode = await saveCustomMode({
        id: mode?.id,
        name: clampedName,
        defaultMinutes,
        gracePeriodSeconds,
      });
      await onSaved(savedMode);
    } catch (error) {
      warn('Failed to save custom mode:', error);
      Alert.alert('Unable to save mode', 'Try again in a moment.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      testID="custom-mode-editor"
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onCancel}
    >
      <View style={styles.modalBackdrop}>
        <LinearGradient
          colors={['#333333', '#141414']}
          style={styles.modeEditorCard}
        >
          <ScrollView showsVerticalScrollIndicator={false} testID="custom-mode-editor-scroll" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modeEditorContent}>
          <Text style={styles.modeEditorTitle}>
            {mode ? 'Edit custom mode' : 'Create custom mode'}
          </Text>
          <Text style={styles.rowDetail}>{CUSTOM_MODE_EDITOR_INTRO}</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              accessibilityLabel="Mode name"
              value={name}
              onChangeText={value => setName(value.slice(0, 20))}
              placeholder="Focus mode"
              placeholderTextColor={colors.muted}
              maxLength={20}
              style={styles.textInput}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Default session length</Text>
            <TextInput
              accessibilityLabel="Default session length in minutes"
              keyboardType="number-pad"
              value={defaultMinutesText}
              onChangeText={setDefaultMinutesText}
              style={styles.textInput}
            />
            <Text style={styles.rowDetail}>Where the timer starts when you pick this mode. You can always change it.</Text>
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.sliderHeader}>
              <Text style={styles.fieldLabel}>Look-away allowance</Text>
              <Text style={styles.sliderValue}>
                {gracePeriodSeconds} sec
              </Text>
            </View>
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel="Look-away allowance"
              accessibilityValue={{ min: MIN_GRACE_SECONDS, max: MAX_GRACE_SECONDS, now: gracePeriodSeconds, text: gracePeriodSeconds + ' seconds' }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={event => setGracePeriodSeconds(current => Math.max(MIN_GRACE_SECONDS, Math.min(MAX_GRACE_SECONDS, current + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))}
              onPress={event =>
                setGraceFromPosition(event.nativeEvent.locationX)
              }
              onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}
              style={styles.sliderTrack}
            >
              <View
                style={[
                  styles.sliderFill,
                  { width: `${Math.round(progress * 100)}%` },
                ]}
              />
              <View
                style={[
                  styles.sliderThumb,
                  { left: `${Math.round(progress * 100)}%` },
                ]}
              />
            </Pressable>
            <View style={styles.sliderEnds}><Text style={styles.rowDetail}>Strict</Text><Text style={styles.rowDetail}>Relaxed</Text></View>
            <Text style={styles.rowDetail}>{lookAwayDescription(gracePeriodSeconds)}</Text>
            <Text style={styles.rowDetail}>
              Camera distance: {cameraDistanceText(modeFrameRange(gracePeriodSeconds))}
            </Text>
          </View>

          <View style={styles.modalActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [
                styles.secondaryAction,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryActionText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={submit}
              disabled={isSaving}
              style={({ pressed }) => [
                styles.primaryAction,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryActionText}>
                {isSaving ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          </View>
          </ScrollView>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  rowDetail: {
    marginTop: 2,
    color: colors.muted,
    ...typography.caption,
  },
  pressed: { opacity: 0.55 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  sliderEnds: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  modeEditorContent: { gap: 18 },
  modeEditorCard: {
    maxHeight: '90%',
    width: '100%',
    maxWidth: 370,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 18,
    gap: 18,
  },
  modeEditorTitle: {
    color: colors.ink,
    ...typography.heading,
    fontWeight: '700',
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.ink,
    ...typography.label,
    fontWeight: '700',
  },
  textInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: colors.module,
    color: colors.ink,
    paddingHorizontal: 12,
    ...typography.body,
    fontWeight: '600',
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sliderValue: {
    color: colors.rewardAmber,
    ...typography.label,
    fontWeight: '700',
  },
  sliderTrack: {
    height: 36,
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.module,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: 'hidden',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(200, 145, 46, 0.34)',
  },
  sliderThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    backgroundColor: colors.rewardAmber,
    borderWidth: 2,
    borderColor: colors.warmWhite,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: colors.module,
  },
  secondaryActionText: {
    color: colors.ink,
    ...typography.body,
    fontWeight: '700',
  },
  primaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  primaryActionText: {
    color: colors.background,
    ...typography.body,
    fontWeight: '700',
  },
});
