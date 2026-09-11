import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { useAppState } from '../../state/AppStateContext';
import { supabase } from '../../lib/supabase';
import { formatPrice } from '../../lib/format';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<MyPageStackParamList, 'OrderQueue'>;

interface ParticipationRow {
  qty: number;
  charged_amount: number | null;
}
interface OrderRow {
  id: string;
  title: string;
  pickup_place: string | null;
  pickup_time: string | null;
  deadline: string;
  order_sent_at: string | null;
  restaurants: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null;
  menus: { name: string } | { name: string }[] | null;
  participations: ParticipationRow[];
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

// 공구 성사 → 식당에 주문 전달 → 로비 픽업, 이 사이 운영자가 할 일을 정리해주는 화면.
// 파일럿이라 배달앱/문자 자동연동은 없음 — 주문서를 복사해서 운영자가 직접 전화·카톡으로 전달.
export function OrderQueueScreen({ navigation }: Props) {
  const { buildingId } = useAppState();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!buildingId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('groupbuys')
      .select(
        'id, title, pickup_place, pickup_time, deadline, order_sent_at, restaurants(name, phone), menus(name), participations(qty, charged_amount)'
      )
      .eq('building_id', buildingId)
      .eq('status', 'success')
      .order('deadline', { ascending: false })
      .limit(50);
    setOrders((data ?? []) as OrderRow[]);
    setLoading(false);
  }, [buildingId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const orderSheetText = (o: OrderRow) => {
    const restaurant = one(o.restaurants);
    const menu = one(o.menus);
    const qty = o.participations.reduce((sum, p) => sum + p.qty, 0);
    const amount = o.participations.reduce((sum, p) => sum + (p.charged_amount ?? 0), 0);
    return [
      `[빌딩공구 주문 요청]`,
      `식당: ${restaurant?.name ?? '-'}`,
      `메뉴: ${menu?.name ?? o.title} × ${qty}개`,
      `합계: ${formatPrice(amount)}`,
      `픽업 장소: ${o.pickup_place ?? '1층 로비'}`,
      `픽업 시각: ${o.pickup_time ?? '마감 직후'}`,
    ].join('\n');
  };

  const copyOrder = async (o: OrderRow) => {
    await Clipboard.setStringAsync(orderSheetText(o));
    Alert.alert('복사했어요', '카톡이나 문자에 붙여넣기 하세요.');
  };

  const callRestaurant = (o: OrderRow) => {
    const phone = one(o.restaurants)?.phone;
    if (!phone) {
      Alert.alert('전화번호가 없어요', '식당·메뉴 관리에서 전화번호를 먼저 등록해주세요.');
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  const toggleSent = async (o: OrderRow) => {
    setBusyId(o.id);
    await supabase
      .from('groupbuys')
      .update({ order_sent_at: o.order_sent_at ? null : new Date().toISOString() })
      .eq('id', o.id);
    setBusyId(null);
    refresh();
  };

  const pending = orders.filter((o) => !o.order_sent_at);
  const sent = orders.filter((o) => o.order_sent_at);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>주문 요청 관리</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionLabel}>전달 필요 ({pending.length})</Text>
          {pending.length === 0 ? (
            <Text style={styles.note}>전달할 주문이 없어요.</Text>
          ) : (
            pending.map((o) => (
              <OrderCard key={o.id} order={o} busy={busyId === o.id} onCopy={() => copyOrder(o)} onCall={() => callRestaurant(o)} onToggle={() => toggleSent(o)} />
            ))
          )}

          {sent.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>전달 완료 ({sent.length})</Text>
              {sent.map((o) => (
                <OrderCard key={o.id} order={o} busy={busyId === o.id} onCopy={() => copyOrder(o)} onCall={() => callRestaurant(o)} onToggle={() => toggleSent(o)} />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function OrderCard({
  order,
  busy,
  onCopy,
  onCall,
  onToggle,
}: {
  order: OrderRow;
  busy: boolean;
  onCopy: () => void;
  onCall: () => void;
  onToggle: () => void;
}) {
  const restaurant = one(order.restaurants);
  const menu = one(order.menus);
  const qty = order.participations.reduce((sum, p) => sum + p.qty, 0);
  const amount = order.participations.reduce((sum, p) => sum + (p.charged_amount ?? 0), 0);
  const sent = !!order.order_sent_at;

  return (
    <View style={[styles.card, sent && styles.cardSent]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{restaurant?.name ?? order.title}</Text>
        <View style={[styles.badge, sent ? styles.badgeSent : styles.badgePending]}>
          <Text style={[styles.badgeText, sent ? styles.badgeTextSent : styles.badgeTextPending]}>{sent ? '전달완료' : '전달전'}</Text>
        </View>
      </View>
      <Text style={styles.cardLine}>
        {menu?.name ?? order.title} × {qty}개 · {formatPrice(amount)}
      </Text>
      <Text style={styles.cardLine}>
        픽업: {order.pickup_place ?? '1층 로비'} · {order.pickup_time ?? '마감 직후'}
      </Text>
      <View style={styles.cardActions}>
        <Pressable style={styles.actionBtn} onPress={onCall}>
          <Text style={styles.actionBtnText}>📞 전화</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={onCopy}>
          <Text style={styles.actionBtnText}>📋 주문서 복사</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, sent && styles.actionBtnGhost]} onPress={onToggle} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={styles.actionBtnText}>{sent ? '전달 취소' : '전달 완료로 표시'}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: screenPadding, paddingVertical: spacing.sm },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: screenPadding, gap: spacing.xs },
  sectionLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginTop: spacing.md },
  note: { fontSize: fontSize.base, color: colors.textTertiary, marginTop: spacing.xs },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: 4, marginTop: spacing.xs, borderWidth: 1, borderColor: colors.dangerLight },
  cardSent: { borderColor: colors.divider, opacity: 0.75 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  badgePending: { backgroundColor: colors.dangerLight },
  badgeSent: { backgroundColor: colors.fillSubtle },
  badgeText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  badgeTextPending: { color: colors.danger },
  badgeTextSent: { color: colors.textSecondary },
  cardLine: { fontSize: fontSize.md, color: colors.textSecondary },
  cardActions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' },
  actionBtn: { paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.fillSubtle },
  actionBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.divider },
  actionBtnText: { fontSize: fontSize.base, color: colors.primary, fontWeight: fontWeight.medium },
});
