import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { RuleModalShell, ruleStyles } from './AppRulePrimitives';
import { formatRuleTime } from '../domain/appRulesPresentation';

export function RuleTimePicker({ value, label, onCancel, onSave }: { value: number; label: string; onCancel: () => void; onSave: (minutes: number) => void }) {
  const [hour, setHour] = useState(Math.floor(value / 60) % 12 || 12);
  const [minute, setMinute] = useState(Math.floor((value % 60) / 5) * 5);
  const [period, setPeriod] = useState(Math.floor(value / 60) >= 12 ? 'pm' : 'am');
  const selected = (hour % 12 + (period === 'pm' ? 12 : 0)) * 60 + minute;
  const columns = [
    { name: 'Hour', values: Array.from({ length: 12 }, (_, i) => String(i + 1)), value: String(hour), change: (v: string) => setHour(Number(v)) },
    { name: 'Minute', values: Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')), value: String(minute).padStart(2, '0'), change: (v: string) => setMinute(Number(v)) },
    { name: 'Period', values: ['am', 'pm'], value: period, change: setPeriod },
  ];
  return <RuleModalShell visible onClose={onCancel} testID="rule-time-picker">
    <Text style={ruleStyles.title}>{label}</Text>
    <Text accessibilityLiveRegion="polite" style={ruleStyles.body}>{formatRuleTime(selected)}</Text>
    <View style={styles.columns}>
      {columns.map(column => <View key={column.name} style={ruleStyles.grow}>
        <Text style={ruleStyles.muted}>{column.name}</Text>
        <ScrollView style={styles.column} contentContainerStyle={styles.options}
          contentOffset={{ x: 0, y: Math.max(0, column.values.indexOf(column.value) * 50 - 88) }} nestedScrollEnabled accessibilityRole="radiogroup" accessibilityLabel={column.name}>
          {column.values.map(item => <Pressable key={item} accessibilityRole="radio" accessibilityLabel={column.name + ' ' + item}
            accessibilityState={{ selected: item === column.value }} onPress={() => column.change(item)}
            style={[ruleStyles.chip, item === column.value && ruleStyles.selected]}>
            <Text style={[ruleStyles.body, item === column.value && ruleStyles.selectedText]}>{item}</Text>
          </Pressable>)}
        </ScrollView>
      </View>)}
    </View>
    <View style={ruleStyles.actions}>
      <Pressable accessibilityRole="button" onPress={onCancel} style={ruleStyles.secondary}><Text style={ruleStyles.body}>Cancel</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => onSave(selected)} style={ruleStyles.primary}><Text style={ruleStyles.primaryText}>Done</Text></Pressable>
    </View>
  </RuleModalShell>;
}
const styles = StyleSheet.create({
  columns: { flexDirection: 'row', gap: 8 },
  column: { maxHeight: 220, marginTop: 8 },
  options: { gap: 6, paddingBottom: 4 },
});
