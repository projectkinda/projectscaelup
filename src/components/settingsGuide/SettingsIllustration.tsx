import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Text } from '../AppText';
import {
  APP_ICON_COLORS,
  type SceneRow,
  type SceneSpec,
  type SettingsLook,
  type VariantConfig,
} from '../../domain/settingsGuideConfig';
import { colors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { useReduceMotion } from './useReduceMotion';

// A DRAWING of a Settings page, not a screenshot: Views and vectors only,
// rebuilt from a SceneSpec so it stays sharp and needs no bitmap.
// Drawing text grows with the phone's font size, but only a little, so the
// picture keeps its shape. The whole drawing has one spoken description.

const LINE = 'rgba(255, 255, 255, 0.12)';
const MAX_FONT_GROWTH = 1.15;
const RING_GAP = 4;

type Props = { scene: SceneSpec; variant: VariantConfig };

export function SettingsIllustration({ scene, variant }: Props) {
  const reduceMotion = useReduceMotion();
  const pulse = usePulse(reduceMotion);
  const look = variant.look;
  const rowRadius = look === 'cards' ? 18 : 12;

  const rows = scene.rows.map((row, index) => (
    <Row
      key={`${row.label}-${index}`}
      row={row}
      highlighted={scene.highlight === index}
      pulse={pulse}
      radius={rowRadius}
      divider={look !== 'flat' && index < scene.rows.length - 1}
    />
  ));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={scene.a11y}
      style={[styles.page, look === 'cards' && styles.pageRounded]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.drawing}
      >
        <Header title={scene.title} look={look} kebab={scene.kebab} />
        {look === 'cards' ? <View style={styles.group}>{rows}</View> : <View>{rows}</View>}

        {scene.menu ? (
          <View style={styles.menu}>
            {scene.menu.items.map((item, index) => (
              <View key={item} style={styles.menuItem}>
                <Text maxFontSizeMultiplier={MAX_FONT_GROWTH} style={styles.rowLabel}>
                  {item}
                </Text>
                {index === scene.menu?.highlight ? <Ring pulse={pulse} radius={8} /> : null}
              </View>
            ))}
          </View>
        ) : null}

        {scene.dialog ? (
          <View style={styles.dialog}>
            <Text maxFontSizeMultiplier={MAX_FONT_GROWTH} style={styles.dialogTitle}>
              {scene.dialog.title}
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_GROWTH} style={styles.dialogBody}>
              {scene.dialog.body}
            </Text>
            <View style={styles.dialogButtons}>
              <Text maxFontSizeMultiplier={MAX_FONT_GROWTH} style={styles.dialogDeny}>
                {scene.dialog.deny}
              </Text>
              <View style={styles.allow}>
                <Text maxFontSizeMultiplier={MAX_FONT_GROWTH} style={styles.dialogAllow}>
                  {scene.dialog.allow}
                </Text>
                <Ring pulse={pulse} radius={12} />
                <TapHint right={14} />
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Header({
  title,
  look,
  kebab,
}: {
  title: string;
  look: SettingsLook;
  kebab?: boolean;
}) {
  const big = look !== 'divided';
  return (
    <View style={[styles.header, big && styles.headerBig]}>
      <View style={styles.headerTop}>
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path
            d="M15 5l-7 7 7 7"
            fill="none"
            stroke={colors.ink}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        {big ? (
          <View style={styles.flex} />
        ) : (
          <Text maxFontSizeMultiplier={MAX_FONT_GROWTH} numberOfLines={1} style={styles.titleSmall}>
            {title}
          </Text>
        )}
        {kebab ? (
          <Svg width={20} height={20} viewBox="0 0 24 24">
            {[5, 12, 19].map(cy => (
              <Circle key={cy} cx={12} cy={cy} r={2} fill={colors.ink} />
            ))}
          </Svg>
        ) : null}
      </View>
      {big ? (
        <Text maxFontSizeMultiplier={MAX_FONT_GROWTH} style={styles.titleBig}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}

function Row({
  row,
  highlighted,
  pulse,
  radius,
  divider,
}: {
  row: SceneRow;
  highlighted: boolean;
  pulse: Animated.Value;
  radius: number;
  divider: boolean;
}) {
  return (
    <View style={[styles.row, divider && styles.rowDivider]}>
      {row.appIcon ? <AppIcon size={32} /> : null}
      <View style={styles.flex}>
        <Text maxFontSizeMultiplier={MAX_FONT_GROWTH} style={styles.rowLabel}>
          {row.label}
        </Text>
        {row.detail ? (
          <Text maxFontSizeMultiplier={MAX_FONT_GROWTH} style={styles.rowDetail}>
            {row.detail}
          </Text>
        ) : null}
      </View>
      {row.toggle ? <Toggle on={row.toggle === 'on'} /> : null}
      {highlighted ? (
        <>
          <Ring pulse={pulse} radius={radius} />
          <TapHint />
        </>
      ) : null}
    </View>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <View style={[styles.toggle, on ? styles.toggleOn : styles.toggleOff]}>
      <View style={[styles.knob, on ? styles.knobOn : styles.knobOff]} />
    </View>
  );
}

/** The app's own icon, redrawn as a vector: a rounded tile with its chevron. */
export function AppIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect width={100} height={100} rx={26} fill={APP_ICON_COLORS.tile} />
      <Path
        d="M24 74 L43 38 Q50 26 57 38 L76 74"
        fill="none"
        stroke={APP_ICON_COLORS.mark}
        strokeWidth={15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Amber ring around the thing to tap; pulses unless motion is reduced. */
function Ring({ pulse, radius }: { pulse: Animated.Value; radius: number }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, { borderRadius: radius + RING_GAP, opacity: pulse }]}
    />
  );
}

/** Arrow pointing up at the ringed row. */
function TapHint({ right = 56 }: { right?: number }) {
  return (
    <View pointerEvents="none" style={[styles.hint, { right }]}>
      <Svg width={34} height={34} viewBox="0 0 34 34">
        <Path
          d="M17 31 V8 M7 18 L17 8 L27 18"
          fill="none"
          stroke={colors.rewardAmber}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

function usePulse(reduceMotion: boolean) {
  const value = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    value.setValue(1);
    if (reduceMotion) {
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 0.45,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, value]);

  return value;
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: colors.module,
    padding: 14,
  },
  pageRounded: { borderRadius: 28 },
  drawing: { minHeight: 150 },
  flex: { flex: 1, minWidth: 0 },
  header: { paddingBottom: 8 },
  headerBig: { paddingBottom: 10 },
  headerTop: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleSmall: { flex: 1, color: colors.ink, ...typography.subheading, fontWeight: '600' },
  titleBig: { marginTop: 6, color: colors.ink, ...typography.stat, fontWeight: '600' },
  group: { borderRadius: 22, backgroundColor: colors.panelBottom, paddingHorizontal: 6 },
  row: {
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE },
  rowLabel: { color: colors.ink, ...typography.body },
  rowDetail: { color: colors.muted, ...typography.label },
  toggle: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center', paddingHorizontal: 3 },
  toggleOff: { borderWidth: 2, borderColor: colors.muted },
  toggleOn: { backgroundColor: colors.pine },
  knob: { width: 16, height: 16, borderRadius: 8 },
  knobOff: { backgroundColor: colors.muted, alignSelf: 'flex-start' },
  knobOn: { backgroundColor: colors.background, alignSelf: 'flex-end' },
  ring: {
    position: 'absolute',
    top: -RING_GAP,
    bottom: -RING_GAP,
    left: -RING_GAP,
    right: -RING_GAP,
    borderWidth: 3,
    borderColor: colors.rewardAmber,
  },
  hint: { position: 'absolute', right: 56, bottom: -34 },
  menu: {
    position: 'absolute',
    top: 38,
    right: 4,
    width: 210,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: colors.panelTop,
    padding: 6,
  },
  menuItem: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  dialog: {
    marginTop: 22,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: colors.panelTop,
    padding: 14,
  },
  dialogTitle: { color: colors.ink, ...typography.subheading, fontWeight: '600' },
  dialogBody: { marginTop: 6, color: colors.ink, ...typography.label },
  dialogButtons: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 28,
  },
  dialogDeny: { color: colors.muted, ...typography.body, fontWeight: '600' },
  allow: { paddingHorizontal: 14, paddingVertical: 8 },
  dialogAllow: { color: colors.ink, ...typography.body, fontWeight: '600' },
});
