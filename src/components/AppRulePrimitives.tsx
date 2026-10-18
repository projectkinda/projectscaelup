import type { ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Text } from './AppText';
import type { InstalledApp } from '../domain/appPicker';
import { ruleAppName } from '../domain/appRulesPresentation';
import { colors } from '../theme/tokens';
import { typography } from '../theme/typography';

export function RuleIcon({ name, color = colors.muted }: { name: 'clock' | 'hourglass' | 'plus' | 'lock' | 'check'; color?: string }) {
  return <Svg width={20} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {name === 'clock' ? <><Circle cx={12} cy={12} r={9}/><Path d="M12 6v6l4 3"/></>
      : name === 'hourglass' ? <Path d="M5 3h14M5 21h14M7 3v4l10 10v4M17 3v4L7 17v4"/>
      : name === 'plus' ? <Path d="M12 5v14M5 12h14"/>
      : name === 'check' ? <Path d="M5 12l4 4L19 6"/>
      : <><Rect x={5} y={10} width={14} height={11} rx={2}/><Path d="M8 10V7a4 4 0 0 1 8 0v3"/></>}
  </Svg>;
}
export function RuleAppIcon({ pkg, app }: { pkg: string; app?: InstalledApp }) {
  const name = ruleAppName(pkg, new Map(app ? [[pkg, app]] : []));
  return app?.iconBase64 ? <Image accessibilityLabel={app.displayName} source={{ uri: 'data:image/png;base64,' + app.iconBase64 }} style={ruleStyles.appIcon}/>
    : <View accessible accessibilityLabel={name} style={[ruleStyles.appIcon, ruleStyles.fallback]}>
      <Text style={ruleStyles.caption}>{name[0].toUpperCase()}</Text>
    </View>;
}
export function RuleModalShell({ visible, onClose, children, testID }: { visible: boolean; onClose: () => void; children: ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose} statusBarTranslucent>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[ruleStyles.backdrop, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <View testID={testID} accessibilityViewIsModal style={[ruleStyles.modalCard, { maxHeight: Math.max(180, height - insets.top - insets.bottom - 40) }]}>
        <ScrollView showsVerticalScrollIndicator={false} testID="rule-editor-scroll" keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={ruleStyles.modalContent}>
          {children}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
export const ruleStyles = StyleSheet.create({
  section: { marginTop: 28, gap: 10 },
  sectionTitle: { color: colors.ink, ...typography.body, fontWeight: '600' },
  title: { color: colors.ink, ...typography.heading, fontWeight: '600' },
  body: { color: colors.ink, ...typography.body },
  label: { color: colors.ink, ...typography.label, fontWeight: '600' },
  muted: { color: colors.muted, ...typography.label },
  caption: { color: colors.muted, ...typography.caption },
  error: { color: colors.mutedRust, ...typography.label },
  card: { backgroundColor: colors.module, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop, borderRadius: 18, overflow: 'hidden' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  field: { gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  chip: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop, backgroundColor: colors.panelBottom, paddingHorizontal: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: colors.rewardAmber, backgroundColor: colors.goalSurface },
  selectedText: { color: colors.rewardAmber },
  dim: { opacity: .45 },
  appIcon: { width: 32, height: 32, borderRadius: 8 },
  fallback: { backgroundColor: colors.panelTop, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  modalCard: { width: '100%', maxWidth: 370, borderRadius: 18, backgroundColor: colors.module, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop, overflow: 'hidden' },
  modalContent: { padding: 16, gap: 18 },
  actions: { flexDirection: 'row', gap: 10 },
  secondary: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop, backgroundColor: colors.module, alignItems: 'center', justifyContent: 'center', padding: 10 },
  primary: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', padding: 10 },
  primaryText: { color: colors.background, ...typography.body, fontWeight: '600' },
});
