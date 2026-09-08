import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';
import { formatPrice } from '../../lib/format';

type Props = NativeStackScreenProps<MyPageStackParamList, 'MyParticipations'>;

interface Row {
  id: string;
  qty: number;
  paid: boolean;
  received: boolean;
  groupbuy: { id: string; title: string; price: number; status: string } | null;
  hasReview: boolean;
}

export function MyParticipationsScreen({ navigation }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setMyUserId(user.id);

    const [{ data: parts }, { data: reviews }] = await Promise.all([
      supabase
        .from('participations')
        .select('id, qty, paid, received, groupbuys(id, title, price, status)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('reviews').select('groupbuy_id').eq('author_id', user.id),
    ]);

    const reviewedIds = new Set((reviews ?? []).map((r) => r.groupbuy_id));
    setRows(
      (parts ?? []).map((p: any) => ({
        id: p.id,
        qty: p.qty,
        paid: p.paid,
        received: p.received,
        groupbuy: p.groupbuys,
        hasReview: p.groupbuys ? reviewedIds.has(p.groupbuys.id) : false,
      }))
    );
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const markReceived = async (participationId: string) => {
    await supabase.from('participations').update({ received: true }).eq('id', participationId);
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
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>{item.groupbuy?.title ?? '(삭제된 공구)'}</Text>
              <Text style={styles.sub}>
                {item.qty}개 · {formatPrice((item.groupbuy?.price ?? 0) * item.qty)}
              </Text>
              <Text style={styles.status}>
                {item.paid ? '결제 완료' : '목표 인원 달성 시 결제'} · {item.received ? '수령 완료' : '수령 전'}
              </Text>
              <View style={styles.actions}>
                {!item.received && (
                  <Pressable style={styles.actionBtn} onPress={() => markReceived(item.id)}>
                    <Text style={styles.actionBtnText}>수령 확인</Text>
                  </Pressable>
                )}
                {item.received && !item.hasReview && item.groupbuy && (
                  <Pressable
                    style={[styles.actionBtn, styles.actionBtnPrimary]}
                    onPress={() =>
                      navigation.navigate('ReviewWrite', {
                        groupBuyId: item.groupbuy!.id,
                        groupBuyTitle: item.groupbuy!.title,
                      })
                    }
                  >
                    <Text style={styles.actionBtnPrimaryText}>후기 쓰기</Text>
                  </Pressable>
                )}
                {item.hasReview && <Text style={styles.reviewedText}>후기 작성 완료</Text>}
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
  },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: screenPadding },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary },
  listContent: { padding: screenPadding, paddingTop: spacing.xs },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  sub: { fontSize: fontSize.md, color: colors.textSecondary },
  status: { fontSize: fontSize.base, color: colors.textTertiary },
  actions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, alignItems: 'center' },
  actionBtn: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.fillSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium },
  actionBtnPrimary: { backgroundColor: colors.primary },
  actionBtnPrimaryText: { fontSize: fontSize.md, color: colors.white, fontWeight: fontWeight.semibold },
  reviewedText: { fontSize: fontSize.md, color: colors.textTertiary },
});
