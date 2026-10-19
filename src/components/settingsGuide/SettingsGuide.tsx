import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  AppState,
  BackHandler,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '../../screens/onboarding/DoneStep';
import { Text } from '../AppText';
import {
  type GuideAction,
  type PermissionGuideConfig,
  type VariantConfig,
} from '../../domain/settingsGuideConfig';
import {
  guideReducer,
  initialGuideState,
  type GuidePhase,
} from '../../domain/settingsGuideMachine';
import { colors, layout } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { CantFindItSheet } from './CantFindItSheet';
import { PermissionDisclosure } from './PermissionDisclosure';
import { PillButton } from './PillButton';
import { SettingsIllustration } from './SettingsIllustration';

export type SettingsGuideProps = {
  /** What to say and draw, from guideFor(permission, variant). */
  config: PermissionGuideConfig;
  variant: VariantConfig;
  /** Already agreed to this disclosure: go straight to the steps. */
  consented: boolean;
  /** Is the permission on right now? */
  checkEnabled: () => Promise<boolean>;
  /** Open the Settings page for this permission. */
  openSettings: () => void;
  /** Open this app's App info page. */
  openAppInfo: () => void;
  /** Store the person's agreement (with a time). Reject to keep them on the disclosure. */
  onConsent: () => Promise<void>;
  /** Left without finishing: back, or "Not now". */
  onBack: () => void;
  onSkip: () => void;
  /** The permission is on and the success screen is done. */
  onDone: () => void;
  pollMs?: number;
  successMs?: number;
};

/**
 * One reusable pattern for any permission that needs a trip to Settings:
 * disclosure, one drawn step at a time, auto-detect, "Can't find it?" help.
 * The flow itself lives in settingsGuideMachine; this draws it.
 */
export function SettingsGuide({
  config,
  variant,
  consented,
  checkEnabled,
  openSettings,
  openAppInfo,
  onConsent,
  onBack,
  onSkip,
  onDone,
  pollMs = 1000,
  successMs = 1200,
}: SettingsGuideProps) {
  const [state, dispatch] = useReducer(
    guideReducer,
    { consented, stepCount: config.steps.length },
    initialGuideState,
  );
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const { phase, helpOpen, step, notice } = state;

  // Hand control back once, when the flow ends.
  const handedOff = useRef<GuidePhase | null>(null);
  useEffect(() => {
    if (handedOff.current === phase) return;
    if (phase === 'done') onDone();
    else if (phase === 'skipped') onSkip();
    else if (phase === 'declined' || phase === 'exited') onBack();
    else return;
    handedOff.current = phase;
  }, [phase, onBack, onDone, onSkip]);

  // Auto-detect: when the app comes back to the front, and once a second.
  const inFlight = useRef(false);
  useEffect(() => {
    if (phase !== 'steps') return;
    let cancelled = false;
    const check = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        if (await checkEnabled()) {
          if (!cancelled) dispatch({ type: 'ENABLED_CHECKED', enabled: true, manual: false });
        }
      } catch {
        // A failed check is the same as "not yet"; the next tick tries again.
      } finally {
        inFlight.current = false;
      }
    };
    void check();
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') void check();
    });
    const timer = setInterval(() => void check(), pollMs);
    return () => {
      cancelled = true;
      subscription.remove();
      clearInterval(timer);
    };
  }, [phase, checkEnabled, pollMs]);

  // Show "All set" for a moment, then continue by itself.
  useEffect(() => {
    if (phase !== 'detected') return;
    const timer = setTimeout(() => dispatch({ type: 'FINISH' }), successMs);
    return () => clearTimeout(timer);
  }, [phase, successMs]);

  // The phone's back button walks back through the guide.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      dispatch({ type: helpOpen ? 'CLOSE_HELP' : 'BACK' });
      return true;
    });
    return () => subscription.remove();
  }, [helpOpen]);

  const agree = useCallback(async () => {
    setSaving(true);
    setSaveFailed(false);
    try {
      await onConsent();
      dispatch({ type: 'AGREE' });
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }, [onConsent]);

  const checkNow = useCallback(async () => {
    let enabled = false;
    try {
      enabled = await checkEnabled();
    } catch {
      enabled = false;
    }
    dispatch({ type: 'ENABLED_CHECKED', enabled, manual: true });
  }, [checkEnabled]);

  const runAction = (action: GuideAction) => {
    if (action !== 'next') openSettings();
    if (action !== 'openSettings') dispatch({ type: 'NEXT' });
  };

  if (phase === 'disclosure') {
    return (
      <PermissionDisclosure
        disclosure={config.disclosure}
        saving={saving}
        saveFailed={saveFailed}
        onAgree={() => void agree()}
        onDecline={() => dispatch({ type: 'DECLINE' })}
        onBack={() => dispatch({ type: 'BACK' })}
      />
    );
  }

  if (phase === 'detected' || phase === 'done') {
    return (
      <SuccessScreen
        title={config.success.title}
        body={config.success.body}
        onContinue={() => dispatch({ type: 'FINISH' })}
      />
    );
  }

  if (phase !== 'steps') {
    return null;
  }

  const current = config.steps[step];

  return (
    <View style={styles.screen}>
      <StepBody
        config={config}
        variant={variant}
        step={step}
        stepCount={config.steps.length}
        onBack={() => dispatch({ type: 'BACK' })}
        notice={notice === 'still-off' ? config.stillOffNotice : null}
        fallbackLabel={config.fallbackLabel}
        onFallback={() => void checkNow()}
        onHelp={() => dispatch({ type: 'OPEN_HELP' })}
      />
      <StepBar
        primaryLabel={current.primaryLabel}
        onPrimary={() => runAction(current.primaryAction)}
      />
      <CantFindItSheet
        visible={helpOpen}
        help={config.help}
        variant={variant}
        onClose={() => dispatch({ type: 'CLOSE_HELP' })}
        onOpenAppInfo={() => {
          openAppInfo();
          dispatch({ type: 'APP_INFO_OPENED' });
        }}
        onRetry={() => dispatch({ type: 'RETRY' })}
        onSkip={() => dispatch({ type: 'SKIP' })}
      />
    </View>
  );
}

function StepBody({
  config,
  variant,
  step,
  stepCount,
  onBack,
  notice,
  fallbackLabel,
  onFallback,
  onHelp,
}: {
  config: PermissionGuideConfig;
  variant: VariantConfig;
  step: number;
  stepCount: number;
  onBack: () => void;
  notice: string | null;
  fallbackLabel: string;
  onFallback: () => void;
  onHelp: () => void;
}) {
  const insets = useSafeAreaInsets();
  const current = config.steps[step];

  return (
    <ScrollView
      bounces={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]}
    >
      <View style={styles.content}>
        <View style={styles.topRow}>
          <BackButton onPress={onBack} />
          <ProgressDots step={step} stepCount={stepCount} />
          <View style={styles.topSpacer} />
        </View>

        <Text style={styles.stepTitle} accessibilityRole="header">
          {current.title}
        </Text>
        <Text style={styles.instruction}>{current.instruction}</Text>

        <View style={styles.illustration}>
          <SettingsIllustration scene={current.scene} variant={variant} />
        </View>

        {notice ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {notice}
          </Text>
        ) : null}

        <View style={styles.secondary}>
          <PillButton kind="text" label={fallbackLabel} onPress={onFallback} />
          <PillButton kind="text" label="Can't find it?" onPress={onHelp} />
        </View>
      </View>
    </ScrollView>
  );
}

function ProgressDots({ step, stepCount }: { step: number; stepCount: number }) {
  return (
    <View
      accessible
      accessibilityLabel={`Step ${step + 1} of ${stepCount}`}
      style={styles.progress}
    >
      <View style={styles.dots}>
        {Array.from({ length: stepCount }, (_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index < step && styles.dotDone,
              index === step && styles.dotActive,
            ]}
          />
        ))}
      </View>
      <Text style={styles.stepLabel}>{`Step ${step + 1} of ${stepCount}`}</Text>
    </View>
  );
}

function StepBar({
  primaryLabel,
  onPrimary,
}: {
  primaryLabel: string;
  onPrimary: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.barInner}>
        <PillButton label={primaryLabel} onPress={onPrimary} />
      </View>
    </View>
  );
}

function SuccessScreen({
  title,
  body,
  onContinue,
}: {
  title: string;
  body: string;
  onContinue: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <View style={[styles.successBody, { paddingTop: insets.top + 26 }]}>
        <Svg
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          width={96}
          height={96}
          viewBox="0 0 96 96"
        >
          <Circle cx={48} cy={48} r={44} fill="none" stroke={colors.pine} strokeWidth={4} />
          <Path
            d="M30 49 L43 62 L67 36"
            fill="none"
            stroke={colors.pine}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.successTitle}>
          {title}
        </Text>
        <Text style={styles.instruction}>{body}</Text>
      </View>
      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.barInner}>
          <PillButton label="Continue" onPress={onContinue} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, alignItems: 'center', paddingBottom: 24 },
  content: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    paddingHorizontal: layout.horizontalPadding,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topSpacer: { width: 44 },
  progress: { alignItems: 'center', gap: 6 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255, 255, 255, 0.24)' },
  dotDone: { backgroundColor: colors.pine },
  dotActive: { width: 24, backgroundColor: colors.ink },
  stepLabel: { color: colors.muted, ...typography.label, fontWeight: '600' },
  stepTitle: { marginTop: 12, color: colors.ink, ...typography.metric, fontWeight: '800' },
  instruction: { marginTop: 8, color: colors.ink, ...typography.heading },
  illustration: { marginTop: 16 },
  notice: {
    marginTop: 20,
    color: colors.rewardAmber,
    ...typography.subheading,
    fontWeight: '600',
  },
  bar: {
    alignItems: 'center',
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: 12,
    backgroundColor: colors.background,
  },
  barInner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 4 },
  secondary: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  successBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.horizontalPadding,
    gap: 8,
  },
  successTitle: { marginTop: 16, color: colors.ink, ...typography.display, fontWeight: '800' },
});
