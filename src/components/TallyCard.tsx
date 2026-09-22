import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import TallyEmpty from '../assets/icons/tally-empty.svg';
import TallyFirst from '../assets/icons/tally-first.svg';
import TallySecond from '../assets/icons/tally-second.svg';
import { colors } from '../theme/tokens';

export function TallyCard({ sessionCount }: { sessionCount: number }) {
  return (
    <View style={styles.section}>
      <LinearGradient colors={['#333333', '#141414']} style={styles.card}>
        {Array.from({ length: 20 }, (_, index) => {
          const Mark =
            index === 0 ? TallyFirst : index === 1 ? TallySecond : TallyEmpty;
          return <Mark key={index} width={50.554} height={40} />;
        })}
      </LinearGradient>
      <View style={styles.copy}>
        <Text testID="session-count" style={styles.sessionCount}>
          {sessionCount} sessions
        </Text>
        <Text style={styles.streak}>1 week of showing up</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { width: '100%', alignItems: 'center', gap: 8 },
  card: {
    width: '100%',
    minHeight: 200,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
    columnGap: 8,
    justifyContent: 'space-between',
  },
  copy: { alignItems: 'center', gap: 4 },
  sessionCount: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700',
  },
  streak: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
});
