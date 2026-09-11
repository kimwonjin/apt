import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { useAppState } from '../../state/AppStateContext';
import { supabase } from '../../lib/supabase';
import { formatPrice, weekLabel, weekStart } from '../../lib/format';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<MyPageStackParamList, 'RestaurantSettlement'>;

interface RestaurantEmbed {
  name: string;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
}
interface ParticipationRow {
  qty: number;
  hold_status: string;
  charged_amount: number | null;
}
interface GroupBuyRow {
  id: string;
  deadline: string;
  settled_at: string | null;
  restaurant_id: string;
  restaurants: RestaurantEmbed | RestaurantEmbed[] | null;
  participations: ParticipationRow[];
}

interface Bucket {
  key: string; // weekStartISO + restaurantId
  weekMonday: Date;
  restaurantId: string;
  restaurant: RestaurantEmbed | null;
  amount: number;
  groupBuyIds: string[];
  allSettled: boolean;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function buildBuckets(rows: GroupBuyRow[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const gb of rows) {
    const amount = gb.participations
      .filter((p) => p.hold_status === 'captured')
      .reduce((sum, p) => sum + (p.charged_amount ?? 0), 0);
    if (amount === 0) continue; // 실제로 결제된 게 없으면 정산할 것도 없음
    const monday = weekStart(gb.deadline);
    const key = `${monday.toISOString().slice(0, 10)}_${gb.restaurant_id}`;
    const existing = map.get(key);
    if (existing) {
      existing.amount += amount;
      existing.groupBuyIds.push(gb.id);
      existing.allSettled = existing.allSettled && !!gb.settled_at;
    } else {
      map.set(key, {
        key,
        weekMonday: monday,
        restaurantId: gb.restaurant_id,
        restaurant: one(gb.restaurants),
        amount,
        groupBuyIds: [gb.id],
        allSettled: !!gb.settled_at,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.weekMonday.getTime() - a.weekMonday.getTime());
}

// 손님 결제는 우리(플랫폼) 쪽으로 먼저 모이고, 식당엔 주 단위로 모아서 계좌이체 해주는 구조.
// 은행 자동송금 연동 전까지는 운영자가 직접 이체하고 여기서 "정산 완료" 체크만 한다.
export function RestaurantSettlementScreen({ navigation }: Props) {
  const { buildingId } = useAppState();
  const [rows, setRows] = useState<GroupBuyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!buildingId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('groupbuys')
      .select(
        'id, deadline, settled_at, restaurant_id, restaurants(name, bank_name, account_number, account_holder), participations(qty, hold_status, charged_amount)'
      )
      .eq('building_id', buildingId)
      .eq('status', 'success')
      .order('deadline', { ascending: false })
      .limit(300);
    setRows((data ?? []) as GroupBuyRow[]);
    setLoading(false);
  }, [buildingId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const buckets = useMemo(() => buildBuckets(rows), [rows]);
  const pending = buckets.filter((b) => !b.allSettled);
  const done = buckets.filter((b) => b.allSettled);

  const copyAccount = async (r: RestaurantEmbed | null) => {
    if (!r?.account_number) {
      Alert.alert('계좌 정보가 없어요', '식당·메뉴 관리에서 정산 계좌를 먼저 등록해주세요.');
      return;
    }
    await Clipboard.setStringAsync(`${r.bank_name ?? ''} ${r.account_number} ${r.account_holder ?? ''}`.trim());
    Alert.alert('복사했어요', '은행 앱에 붙여넣기 해서 이체하세요.');
  };

  const toggleSettled = async (bucket: Bucket) => {
    setBusyKey(bucket.key);
    await supabase
      .from('groupbuys')
      .update({ settled_at: bucket.allSettled ? null : new Date().toISOString() })
      .in('id', bucket.groupBuyIds);
    setBusyKey(null);
    refresh();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>식당 정산 관리</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.note}>결제된 금액을 주(월~일) · 식당 단위로 모았어요. 계좌로 이체 후 완료 체크하세요.</Text>

          <Text style={styles.sectionLabel}>정산 필요 ({pending.length})</Text>
          {pending.length === 0 ? (
            <Text style={styles.note}>정산할 게 없어요.</Text>
          ) : (
            pending.map((b) => (
              <BucketCard key={b.key} bucket={b} busy={busyKey === b.key} onCopy={() => copyAccount(b.restaurant)} onToggle={() => toggleSettled(b)} />
            ))
          )}

          {done.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>정산 완료 ({done.length})</Text>
              {done.map((b) => (
                <BucketCard key={b.key} bucket={b} busy={busyKey === b.key} onCopy={() => copyAccount(b.restaurant)} onToggle={() => toggleSettled(b)} />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function BucketCard({ bucket, busy, onCopy, onToggle }: { bucket: Bucket; busy: boolean; onCopy: () => void; onToggle: () => void }) {
  const r = bucket.restaurant;
  const hasAccount = !!r?.account_number;
  return (
    <View style={[styles.card, bucket.allSettled && styles.cardDone]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{r?.name ?? '식당'}</Text>
        <View style={[styles.badge, bucket.allSettled ? styles.badgeDone : styles.badgePending]}>
          <Text style={[styles.badgeText, bucket.allSettled ? styles.badgeTextDone : styles.badgeTextPending]}>
            {bucket.allSettled ? '정산완료' : '정산필요'}
          </Text>
        </View>
      </View>
      <Text style={styles.weekLabel}>{weekLabel(bucket.weekMonday)}</Text>
      <Text style={styles.amount}>{formatPrice(bucket.amount)}</Text>
      <Text style={styles.cardLine}>
        {hasAccount ? `${r?.bank_name ?? ''} ${r?.account_number} ${r?.account_holder ?? ''}` : '계좌 정보 미등록'}
      </Text>
      <View style={styles.cardActions}>
        <Pressable style={styles.actionBtn} onPress={onCopy}>
          <Text style={styles.actionBtnText}>📋 계좌 복사</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, bucket.allSettled && styles.actionBtnGhost]} onPress={onToggle} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={styles.actionBtnText}>{bucket.allSettled ? '완료 취소' : '이체 완료로 표시'}</Text>}
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
  note: { fontSize: fontSize.base, color: colors.textTertiary },
  sectionLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginTop: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: 4, marginTop: spacing.xs, borderWidth: 1, borderColor: colors.dangerLight },
  cardDone: { borderColor: colors.divider, opacity: 0.75 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  weekLabel: { fontSize: fontSize.base, color: colors.textTertiary },
  amount: { fontSize: fontSize.xl, fontWeight: fontWeight.heavy, color: colors.primary },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  badgePending: { backgroundColor: colors.dangerLight },
  badgeDone: { backgroundColor: colors.fillSubtle },
  badgeText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  badgeTextPending: { color: colors.danger },
  badgeTextDone: { color: colors.textSecondary },
  cardLine: { fontSize: fontSize.md, color: colors.textSecondary },
  cardActions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' },
  actionBtn: { paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.fillSubtle },
  actionBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.divider },
  actionBtnText: { fontSize: fontSize.base, color: colors.primary, fontWeight: fontWeight.medium },
});
