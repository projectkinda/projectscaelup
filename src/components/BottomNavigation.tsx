import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import HistoryIcon from '../assets/icons/history.svg';
import HomeIcon from '../assets/icons/home.svg';
import SettingsIcon from '../assets/icons/settings.svg';
import { colors, layout } from '../theme/tokens';

type NavItem = {
  id: string;
  label: string;
  Icon: React.FC<SvgProps>;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'history', label: 'History', Icon: HistoryIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

type BottomNavigationProps = {
  activeItem?: string;
  backgroundColor?: string;
  bottomInset: number;
  onSelect?: (id: string) => void;
};

export function BottomNavigation({
  activeItem = 'home',
  backgroundColor = colors.background,
  bottomInset,
  onSelect,
}: BottomNavigationProps) {
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor, height: layout.bottomNavHeight + bottomInset },
      ]}
    >
      <View style={styles.content}>
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = id === activeItem;
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onSelect?.(id)}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <Icon
                width={24}
                height={24}
                color={active ? colors.ink : colors.muted}
                opacity={active ? 1 : 0.72}
              />
              <Text style={[styles.label, active && styles.activeLabel]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  content: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    paddingHorizontal: 12,
    paddingTop: 9,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  item: {
    flex: 1,
    height: 58,
    paddingTop: 6,
    alignItems: 'center',
    gap: 4,
  },
  pressed: { opacity: 0.55 },
  label: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '600',
  },
  activeLabel: { color: colors.ink, fontWeight: '700' },
});
