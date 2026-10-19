import { beginProPurchase } from '../domain/purchases';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text, InlineText } from './AppText';
import { DEV_FLAGS, PAYWALL_COPY, PAYWALL_LAYOUT, proFeaturesFor, type PaywallFeature, type ProFeature } from '../domain/paywall';
import { colors } from '../theme/tokens';
import { typography } from '../theme/typography';

const iconPaths: Record<PaywallFeature, string> = {
  apps: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  'app-rules': 'M20 11a8 8 0 1 0-8 9 M12 7v5l3 2 M16 17h6 M16 21h4',
  coach: 'M3 18l5-5 4 3 8-11 M15 5h5v5',
  history: 'M3 11a9 9 0 1 1 2 7 M3 5v6h6 M12 7v5l4 2',
  modes: 'M4 3v6 M4 15v6 M12 3v10 M12 19v2 M20 3v2 M20 11v10 M1 9h6v6H1z M9 13h6v6H9z M17 5h6v6h-6z',
};

function FeatureIcon({ feature, active }: { feature: PaywallFeature; active: boolean }) {
  return <Svg testID={'upgrade-icon-' + feature} width={24} height={24} viewBox="0 0 24 24" accessible={false} accessibilityElementsHidden>
    <Path d={iconPaths[feature]} fill="none" stroke={active ? colors.rewardAmber : colors.white} opacity={active ? 1 : 0.9}
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>;
}

function FeatureCell({ value, pro = false, active = false }: { value: string; pro?: boolean; active?: boolean }) {
  return <View testID={pro ? 'upgrade-pro-cell' : 'upgrade-free-cell'} style={pro ? styles.proCell : styles.freeCell}>
    {value === '\u2713' ? <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false} accessibilityElementsHidden>
      <Path d="M5 12l4 4L19 6" fill="none" stroke={pro && active ? colors.rewardAmber : pro ? colors.white : colors.muted}
        strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg> : <Text numberOfLines={1} style={[styles.cellText, pro && styles.proText]}>{value}</Text>}
  </View>;
}

function FeatureList({ rows, feature }: { rows: ProFeature[]; feature: PaywallFeature }) {
  return <View testID="upgrade-list" style={styles.list}>
    {rows.map(row => <View key={row.id} testID={'pro-feature-' + row.id} style={styles.listRow}>
      <View style={styles.iconColumn}><FeatureIcon feature={row.id} active={row.id === feature}/></View>
      <View style={styles.listText}>
        <Text testID="upgrade-feature-label" numberOfLines={1} style={styles.listTitle}>{row.label}</Text>
        <Text testID="upgrade-description" style={styles.description}>{row.description}</Text>
      </View>
    </View>)}
  </View>;
}

function FeatureTable({ rows, feature }: { rows: ProFeature[]; feature: PaywallFeature }) {
  return <View testID="upgrade-table" style={styles.table}>
    <View testID="upgrade-pro-column" pointerEvents="none" accessible={false} style={styles.proColumn}/>
    <View style={styles.tableHeader}>
      <Text style={styles.featureHeader}>Feature</Text>
      <View style={styles.freeCell}><Text style={styles.columnHeader}>Free</Text></View>
      <View style={styles.proCell}><Text style={[styles.columnHeader, styles.amber]}>Pro</Text></View>
    </View>
    {rows.map(row => {
      const numeric = row.id === 'apps' || row.id === 'history';
      const free = numeric ? row.freeValue : row.freeValue === '\u2014' ? '\u2014' : '\u2713';
      const pro = numeric ? row.proValue : '\u2713';
      return <View key={row.id} testID={'pro-feature-' + row.id} style={styles.tableRow}
        accessibilityLabel={row.label + ': Free ' + (row.freeValue === '\u2014' ? 'not included' : row.freeValue) + '. Pro ' + (row.proValue === '\u2713' ? 'included' : row.proValue)}>
        {row.id === feature ? <View testID="upgrade-trigger-bar" pointerEvents="none" style={styles.triggerBar}/> : null}
        <Text testID="upgrade-feature-label" numberOfLines={1} style={styles.tableLabel}>{row.label}</Text>
        <FeatureCell value={free}/><FeatureCell value={pro} pro active={row.id === feature}/>
      </View>;
    })}
  </View>;
}

/** A single modal owned by PaywallProvider; the caller stays mounted beneath it. */
export function PaywallScreen({ visible = true, feature, onClose, topInset = 0, bottomInset = 0 }: {
  visible?: boolean; feature: PaywallFeature; onClose: () => void; topInset?: number; bottomInset?: number;
}) {
  const rows = proFeaturesFor(feature, Platform.OS);
  const { title, subtitle } = PAYWALL_COPY[feature];
  return <Modal visible={visible} presentationStyle="fullScreen" animationType="slide" statusBarTranslucent onRequestClose={onClose}>
    <View testID="upgrade-screen" style={styles.screen}>
      <View testID="upgrade-close-row" collapsable={false} style={[styles.closeRow, { paddingTop: topInset + 16 }]}>
        <Pressable testID="upgrade-close" accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Svg width={24} height={24} viewBox="0 0 24 24" accessible={false} accessibilityElementsHidden>
            <Path d="M6 6l12 12M18 6L6 18" fill="none" stroke={colors.ink} strokeWidth={1.75} strokeLinecap="round"/>
          </Svg>
        </Pressable>
      </View>
      <ScrollView key={feature} testID="upgrade-scroll" style={styles.scroll} contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false} bounces={false} removeClippedSubviews={false}>
        {/* Natural-height hero text stays measurable inside the bounded scroll viewport. */}
        <View testID="upgrade-hero" collapsable={false} style={styles.hero}>
          <Text testID="upgrade-title" textBreakStrategy="simple" style={styles.title}>{title.split(/(\bPro\b)/).map((part, index) => part === 'Pro'
            ? <InlineText key={index} style={styles.amber}>{part}</InlineText> : part)}</Text>
          <Text testID="upgrade-subtitle" style={styles.subtitle}>{subtitle}</Text>
        </View>
        {PAYWALL_LAYOUT === 'list' ? <FeatureList rows={rows} feature={feature}/> : <FeatureTable rows={rows} feature={feature}/>}
      </ScrollView>
      <View testID="upgrade-footer" style={[styles.footer, { paddingBottom: Math.max(24, bottomInset + 16) }]}>
        <Pressable testID="upgrade-primary" accessibilityRole="button" accessibilityLabel="Upgrade to Pro" onPress={beginProPurchase}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Upgrade to Pro</Text>
        </Pressable>
        {DEV_FLAGS.tierSwitcher ? <Text style={styles.comingSoon}>Purchases coming soon</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPress={onClose} style={({ pressed }) => [styles.notNow, pressed && styles.pressed]}>
          <Text style={styles.notNowText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1, minHeight: 0 },
  content: { flexGrow: 0, paddingHorizontal: 24, paddingBottom: 16 },
  closeRow: { flexShrink: 0, paddingHorizontal: 24, alignItems: 'flex-start', paddingBottom: 40 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: .55 },
  hero: { flexShrink: 0, alignItems: 'center', marginBottom: 40 },
  title: { ...typography.title, lineHeight: 44, fontWeight: '700', color: colors.white, textAlign: 'center', textAlignVertical: 'top', includeFontPadding: true, width: '100%', flexShrink: 0, paddingVertical: 4 },
  amber: { color: colors.rewardAmber },
  subtitle: { ...typography.body, lineHeight: 24, color: colors.muted, textAlign: 'center', maxWidth: 320, marginTop: 12 },
  list: { flexShrink: 0 },
  listRow: { flexDirection: 'row', gap: 8, paddingVertical: 14, flexShrink: 0 },
  iconColumn: { width: 24, alignItems: 'flex-start', paddingTop: 1 },
  listText: { flex: 1, minWidth: 0 },
  listTitle: { ...typography.body, fontSize: 17, lineHeight: 24, fontWeight: '600', color: colors.white },
  description: { ...typography.body, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: 4 },
  table: { flexShrink: 0, borderRadius: 24, padding: 8, backgroundColor: colors.panelBottom,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  proColumn: { position: 'absolute', right: 8, width: 104, top: 6, bottom: 6, backgroundColor: colors.rewardAmber, opacity: .06, borderRadius: 16 },
  tableHeader: { height: 48, flexDirection: 'row', alignItems: 'center' },
  featureHeader: { flex: 1, minWidth: 0, paddingLeft: 0, color: colors.muted, ...typography.caption },
  columnHeader: { color: colors.muted, ...typography.label },
  tableRow: { height: 56, flexDirection: 'row', alignItems: 'center' },
  tableLabel: { flex: 1, minWidth: 0, paddingLeft: 0, color: colors.white, ...typography.caption, fontWeight: '500' },
  triggerBar: { position: 'absolute', left: -5, width: 3, height: 16, backgroundColor: colors.rewardAmber, borderRadius: 2 },
  freeCell: { width: 80, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  proCell: { width: 104, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  cellText: { color: colors.muted, ...typography.label, textAlign: 'center' },
  proText: { color: colors.white },
  footer: { flexShrink: 0, paddingTop: 16, paddingHorizontal: 24, backgroundColor: colors.background },
  primary: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  primaryText: { color: colors.background, ...typography.body, fontWeight: '700' },
  comingSoon: { marginTop: 12, color: colors.muted, ...typography.caption, textAlign: 'center' },
  notNow: { marginTop: 4, height: 48, alignItems: 'center', justifyContent: 'center' },
  notNowText: { color: colors.muted, ...typography.label },
});
