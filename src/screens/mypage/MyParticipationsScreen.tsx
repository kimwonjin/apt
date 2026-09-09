import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';
import { formatPrice } from '../../lib/format';
import { priceAfterDiscount } from '../../lib/discount';

type Props = NativeStackScreenProps<MyPageStackParamList, 'MyParticipations'>;

interface Row {
  id: string;
  holdStatus: string;
  chargedAmount: number | null;
  pickedUp: boolean;
  groupbuy: {
    id: string;
    title: string;
    base_price: number;
    status: string;
    discount_percent: number;
  } | null;
}

const HOLD_LABEL: Record<string, string> = {
  held: '결제 대기 (마감 시 확정)',
  captured: '결제 완료',
  released: '결제 취소됨',
  failed: '결제 실패',
};

export function MyParticipationsScreen({ navigation }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('participations')
      .select('id, hold_status, charged_amount, picked_up, groupbuys(id, title, base_price, status, discount_percent)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setRows(
      (data ?? []).map((p: any) => ({
        id: p.id,
        holdStatus: p.hold_status,
        chargedAmount: p.charged_amount,
        pickedUp: p.picked_up,
        groupbuy: p.groupbuys,
      }))
    );
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const markPickedUp = async (id: string) => {
    await supabase.from('participations').update({ picked_up: true }).eq('id', id);
    refresh();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>나의 참여 공구</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>참여한 공구가 없어요.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const gb = item.groupbuy;
            const amount =
              item.chargedAmount ??
              (gb ? priceAfterDiscount(gb.base_price, gb.discount_percent) : 0);
            return (
              <Pressable
                style={styles.card}
                onPress={() =>
                  gb && (navigation as any).getParent()?.navigate('홈', { screen: 'GroupBuyDetail', params: { groupBuyId: gb.id } })
                }
              >
                <Text style={styles.title}>{gb?.title ?? '(삭제된 공구)'}</Text>
                <Text style={styles.sub}>{formatPrice(amount)}</Text>
                <Text style={styles.status}>
                  {HOLD_LABEL[item.holdStatus] ?? item.holdStatus} · {item.pickedUp ? '수령 완료' : '수령 전'}
                </Text>
                {item.holdStatus === 'captured' && !item.pickedUp && (
                  <Pressable style={styles.actionBtn} onPress={() => markPickedUp(item.id)}>
                    <Text style={styles.actionBtnText}>로비에서 수령 확인</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: screenPadding, paddingVertical: spacing.sm },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: screenPadding },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary },
  listContent: { padding: screenPadding, paddingTop: spacing.xs },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  sub: { fontSize: fontSize.md, color: colors.textSecondary },
  status: { fontSize: fontSize.base, color: colors.textTertiary },
  actionBtn: { marginTop: spacing.xs, minHeight: 36, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  actionBtnText: { fontSize: fontSize.md, color: colors.white, fontWeight: fontWeight.semibold },
});
