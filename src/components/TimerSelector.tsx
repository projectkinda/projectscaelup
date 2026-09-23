import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { TimeModule } from './TimeModule';
import { colors, useScale } from '../theme/tokens';

type TimerSelectorProps = {
  hours: number;
  minutes: number;
  onHoursChange: (value: number) => void;
  onMinutesChange: (value: number) => void;
};

const BASE_CHASSIS_HEIGHT = 204;
const BASE_GAP = 16;
const BASE_COLON_WIDTH = 24;
const BASE_COLON_HEIGHT = 76;
const BASE_COLON_DOT = { width: 8, height: 9, gap: 13 };

export function TimerSelector({
  hours,
  minutes,
  onHoursChange,
  onMinutesChange,
}: TimerSelectorProps) {
  const scale = useScale();

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[colors.panelTop, colors.panelBottom]}
        style={[
          styles.chassis,
          {
            height: BASE_CHASSIS_HEIGHT * scale,
            gap: BASE_GAP * scale,
            paddingHorizontal: BASE_GAP * scale,
          },
        ]}
      >
        <TimeModule
          label="Hours"
          value={hours}
          max={23}
          scale={scale}
          onChange={onHoursChange}
        />
        <View
          style={[
            styles.colon,
            {
              width: BASE_COLON_WIDTH * scale,
              height: BASE_COLON_HEIGHT * scale,
              gap: BASE_COLON_DOT.gap * scale,
            },
          ]}
          accessibilityElementsHidden
        >
          <View
            style={[
              styles.colonDot,
              {
                width: BASE_COLON_DOT.width * scale,
                height: BASE_COLON_DOT.height * scale,
              },
            ]}
          />
          <View
            style={[
              styles.colonDot,
              {
                width: BASE_COLON_DOT.width * scale,
                height: BASE_COLON_DOT.height * scale,
              },
            ]}
          />
        </View>
        <TimeModule
          label="Minutes"
          value={minutes}
          max={55}
          step={5}
          scale={scale}
          onChange={onMinutesChange}
        />
      </LinearGradient>
      <Text style={styles.hint}>Swipe to set time</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', alignItems: 'center' },
  chassis: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 12,
  },
  colon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  colonDot: {
    borderRadius: 1,
    backgroundColor: colors.white,
    shadowColor: colors.white,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 7,
    elevation: 4,
  },
  hint: {
    height: 18,
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
  },
});
