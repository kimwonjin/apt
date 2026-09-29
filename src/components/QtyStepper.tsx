import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';

interface Props {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}

// 공구 만들기/참여 화면에서 공용으로 쓰는 -/+ 수량 선택기.
export function QtyStepper({ value, onChange, min = 1, max = 10 }: Props) {
  return (
    <View style={styles.stepper}>
      <Pressable
        style={[styles.btn, value <= min && styles.btnDisabled]}
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        hitSlop={8}
      >
        <Text style={styles.btnText}>−</Text>
      </Pressable>
      <Text style={styles.value}>{value}개</Text>
      <Pressable
        style={[styles.btn, value >= max && styles.btnDisabled]}
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        hitSlop={8}
      >
        <Text style={styles.btnText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  btn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.fillSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.textPrimary },
  value: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary, minWidth: 36, textAlign: 'center' },
});
