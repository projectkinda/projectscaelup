import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from './AppText';
import { DEV_FLAGS, PAYWALL_COPY, proFeaturesFor, type PaywallFeature } from '../domain/paywall';
import { colors } from '../theme/tokens';
import { typography } from '../theme/typography';

export function PaywallSheet({ visible = true, feature, onClose, bottomInset = 0 }: {
  visible?: boolean; feature: PaywallFeature; onClose: () => void; bottomInset?: number;
}) {
  const rows = proFeaturesFor(feature, Platform.OS);
  const { title, subtitle } = PAYWALL_COPY[feature];
  return <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close upgrade" onPress={onClose} style={styles.backdrop}/>
      <View testID="upgrade-sheet" style={[styles.sheet, { paddingBottom: Math.max(24, bottomInset + 16) }]}>
        <View testID="upgrade-handle" accessible={false} style={styles.handle}/>
        <View testID="upgrade-header" style={styles.header}>
          <Text testID="upgrade-title" accessibilityLabel={title} numberOfLines={1} ellipsizeMode="tail" style={styles.title}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false} accessibilityElementsHidden>
              <Path d="M6 6l12 12M18 6L6 18" fill="none" stroke={colors.ink} opacity={.8} strokeWidth={2} strokeLinecap="round"/>
            </Svg>
          </Pressable>
        </View>
        <ScrollView key={feature} testID="upgrade-scroll" style={styles.scroll} showsVerticalScrollIndicator={false} bounces={false}>
          <Text testID="upgrade-subtitle" accessibilityLabel={subtitle} numberOfLines={1} ellipsizeMode="tail" style={styles.subtitle}>{subtitle}</Text>
          <View testID="upgrade-table" style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.featureHeader}>Feature</Text><Text style={styles.freeHeader}>Free</Text><Text style={styles.proHeader}>Pro</Text>
            </View>
            {rows.map(row => <View key={row.id} testID={'pro-feature-' + row.id} accessibilityLabel={row.label + ': Free ' + row.freeValue + '. Pro ' + row.proValue} style={styles.tableRow}>
              {row.id === feature ? <View testID="upgrade-highlight" pointerEvents="none" accessible={false} style={styles.highlight}/> : null}
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.feature}>{row.label}</Text>
              <Text style={styles.freeCell}>{row.freeValue}</Text>
              <Text style={styles.proCell}>{row.proValue}</Text>
            </View>)}
          </View>
          {DEV_FLAGS.tierSwitcher ? <>
            <Pressable accessibilityRole="button" accessibilityLabel="Upgrade to Pro" accessibilityState={{ disabled: true }} disabled style={styles.primary}>
              <Text style={styles.primaryText}>Upgrade to Pro</Text>
            </Pressable>
            <Text style={styles.comingSoon}>Purchases coming soon</Text>
          </> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPress={onClose} style={({ pressed }) => [styles.notNow, pressed && styles.pressed]}>
            <Text style={styles.notNowText}>Not now</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.72)' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 20,
    backgroundColor: colors.module, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop },
  handle: { width: 36, height: 4, alignSelf: 'center', backgroundColor: colors.white, opacity: .18, borderRadius: 2, marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  title: { flex: 1, minWidth: 0, color: colors.white, ...typography.stat, fontWeight: '700' },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  pressed: { opacity: .55 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  subtitle: { marginTop: 8, color: colors.muted, ...typography.body },
  table: { marginTop: 24 },
  tableHeader: { minHeight: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  featureHeader: { flex: 1, minWidth: 0, color: colors.muted, ...typography.label, fontWeight: '700' },
  freeHeader: { width: 48, color: colors.ink, ...typography.label, textAlign: 'center', fontWeight: '700' },
  proHeader: { width: 120, color: colors.ink, ...typography.label, textAlign: 'center', fontWeight: '700' },
  tableRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.panelTop },
  feature: { flex: 1, minWidth: 0, color: colors.white, ...typography.label, fontWeight: '600' },
  freeCell: { width: 48, color: colors.muted, ...typography.label, textAlign: 'center' },
  proCell: { width: 120, color: colors.ink, ...typography.caption, textAlign: 'center' },
  highlight: { position: 'absolute', top: 0, bottom: 0, left: 8, right: 8, backgroundColor: colors.goalSurface, borderRadius: 12 },
  primary: { marginTop: 32, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  primaryText: { color: colors.muted, ...typography.body, fontWeight: '700' },
  comingSoon: { marginTop: 12, color: colors.muted, ...typography.caption, textAlign: 'center' },
  notNow: { marginTop: 8, height: 48, alignItems: 'center', justifyContent: 'center' },
  notNowText: { color: colors.ink, ...typography.label, fontWeight: '700' },
});
