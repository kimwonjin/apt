import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';
import { formatPrice } from '../../lib/format';

type Props = NativeStackScreenProps<MyPageStackParamList, 'Settlement'>;

const COMMISSION_RATE = 0.001; // 판매량의 0.1% (대표 확정)

interface Row {
  groupBuyId: string;
  title: string;
  sales: number;
  commission: number;
  payout: number;
}

// 실제 PG 정산 데이터가 들어오기 전까지는 paid=true인 참여를 기준으로 계산한 값이다.
// PG 연동 후에는 이 계산을 PG의 정산 API 응답으로 교체하면 된다.
export function SettlementScreen({ navigation }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }
        const { data: groupbuys } = await supabase
          .from('groupbuys')
          .select('id, title, price')
          .eq('leader_id', user.id);

        const results: Row[] = [];
        for (const gb of groupbuys ?? []) {
          const { data: parts } = await supabase
            .from('participations')
            .select('qty')
            .eq('groupbuy_id', gb.id)
            .eq('paid', true);
          const totalQty = (parts ?? []).reduce((sum, p) => sum + p.qty, 0);
          if (totalQty === 0) continue;
          const sales = totalQty * gb.price;
          const commission = Math.round(sales * COMMISSION_RATE);
          results.push({ groupBuyId: gb.id, title: gb.title, sales, commission, payout: sales - commission });
        }
        if (!cancelled) {
          setRows(results);
          setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const totalPayout = rows.reduce((sum, r) => sum + r.payout, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>정산 내역</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>정산 예정 총액</Text>
        <Text style={styles.totalValue}>{formatPrice(totalPayout)}</Text>
        <Text style={styles.totalNote}>수수료 판매량의 {(COMMISSION_RATE * 100).toFixed(1)}% 차감</Text>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>결제 완료된 공구가 없어요.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.groupBuyId}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>{item.title}</Text>
              <Row label="판매액" value={formatPrice(item.sales)} />
              <Row label="수수료" value={`-${formatPrice(item.commission)}`} />
              <Row label="정산액" value={formatPrice(item.payout)} emphasize />
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
    </SafeAreaView>
  );
}

function Row({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, emphasize && styles.rowValueEmphasize]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: screenPadding, paddingVertical: spacing.sm },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  totalCard: { marginHorizontal: screenPadding, backgroundColor: colors.primaryLight, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  totalLabel: { fontSize: fontSize.md, color: colors.primaryDark },
  totalValue: { fontSize: fontSize.display, fontWeight: fontWeight.heavy, color: colors.primaryDark, marginTop: 2 },
  totalNote: { fontSize: fontSize.base, color: colors.primaryDark, marginTop: 2, opacity: 0.7 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary },
  listContent: { padding: screenPadding, paddingTop: spacing.xs },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  rowLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  rowValue: { fontSize: fontSize.md, color: colors.textPrimary },
  rowValueEmphasize: { fontWeight: fontWeight.bold, color: colors.primary },
});
