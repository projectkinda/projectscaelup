import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '../AppText';
import {
  type HelpConfig,
  type VariantConfig,
} from '../../domain/settingsGuideConfig';
import { colors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { PillButton } from './PillButton';
import { SettingsIllustration } from './SettingsIllustration';

type Props = {
  visible: boolean;
  help: HelpConfig;
  variant: VariantConfig;
  onClose: () => void;
  onOpenAppInfo: () => void;
  onRetry: () => void;
  onSkip: () => void;
};

const LINE = 'rgba(255, 255, 255, 0.12)';

/** "Can't find it?": greyed-out switch, missing app, or skip. */
export function CantFindItSheet({
  visible,
  help,
  variant,
  onClose,
  onOpenAppInfo,
  onRetry,
  onSkip,
}: Props) {
  const { restricted, notFound, skip } = help;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close help"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text accessibilityRole="header" style={styles.title}>
              Can't find it?
            </Text>
            <PillButton kind="text" label="Close" onPress={onClose} />
          </View>
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
          >
            {restricted ? (
              <Section heading={restricted.heading}>
                <Text style={styles.text}>{restricted.intro}</Text>
                {restricted.steps.map((step, index) => (
                  <View key={step} style={styles.stepRow}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={[styles.text, styles.stepText]}>{step}</Text>
                  </View>
                ))}
                <SettingsIllustration scene={restricted.scene} variant={variant} />
                <PillButton label={restricted.openLabel} onPress={onOpenAppInfo} />
              </Section>
            ) : null}

            <Section heading={notFound.heading}>
              <Text style={styles.text}>{notFound.body}</Text>
              <PillButton label={notFound.retryLabel} onPress={onRetry} />
            </Section>

            <Section heading={skip.heading} last>
              <Text style={styles.text}>{skip.consequence}</Text>
              <PillButton kind="text" label={skip.label} onPress={onSkip} />
            </Section>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Section({
  heading,
  last = false,
  children,
}: {
  heading: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, !last && styles.sectionDivider]}>
      <Text accessibilityRole="header" style={styles.heading}>
        {heading}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: LINE,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 8,
  },
  title: { flex: 1, color: colors.ink, ...typography.metric, fontWeight: '800' },
  body: { paddingBottom: 8 },
  section: { gap: 14, paddingVertical: 20 },
  sectionDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE },
  heading: { color: colors.ink, ...typography.heading, fontWeight: '800' },
  text: { color: colors.ink, ...typography.body },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  stepNumberText: { color: colors.background, ...typography.body, fontWeight: '800' },
  stepText: { flex: 1 },
});
