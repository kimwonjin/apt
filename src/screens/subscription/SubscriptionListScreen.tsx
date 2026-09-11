import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAppState } from '../../state/AppStateContext';
import { supabase } from '../../lib/supabase';
import { AppHeader } from '../../components/AppHeader';
import { TIME_SLOT_LABEL, TimeSlot } from '../../lib/discount';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
function slotLabel(slot: TimeSlot) {
  const { name, hint } = TIME_SLOT_LABEL[slot];
  return `${name} (${hint})`;
}

interface GroupRow {
  id: string;
  weekday: number;
  time_slot: string;
  min_headcount: number;
  pickup_place: string | null;
  menus: { name: string } | { name: string }[] | null;
  restaurants: { name: string } | { name: string }[] | null;
}

// 탭 D "요일 다이어트 밥이". 파일럿 최소 구현: 빌딩의 구독그룹 목록 + 구독 on/off.
// 회차별 결제취소(D-3)·모드 선택(D-2)·이력(D-5)은 후속.
export function SubscriptionListScreen() {
  const navigation = useNavigation();
  const { buildingId } = useAppState();
  const [rows, setRows] = useState<GroupRow[]>([]);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!buildingId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const [{ data: groups }, { data: subs }] = await Promise.all([
      supabase
        .from('subscription_groups')
        .select('id, weekday, time_slot, min_headcount, pickup_place, menus(name), restaurants(name)')
        .eq('building_id', buildingId)
        .eq('active', true)
        .order('weekday'),
      user
        ? supabase.from('subscriptions').select('group_id').eq('user_id', user.id).eq('active', true)
        : Promise.resolve({ data: [] as { group_id: string }[] }),
    ]);
    setRows((groups ?? []) as GroupRow[]);
    setSubscribedIds(new Set((subs ?? []).map((s: any) => s.group_id)));
    setLoading(false);
  }, [buildingId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const toggle = async (groupId: string) => {
    if (busy) return;
    setBusy(groupId);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(null);
      return;
    }
    if (subscribedIds.has(groupId)) {
      await supabase.from('subscriptions').delete().eq('user_id', user.id).eq('group_id', groupId);
      setBusy(null);
      refresh();
      return;
    }
    // 구독도 실제 결제 승인이 필요해서 등록된 카드(billing_key)가 있어야 신청 가능.
    const { data: pm } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('user_id', user.id)
      .not('billing_key', 'is', null)
      .limit(1)
      .maybeSingle();
    if (!pm) {
      setBusy(null);
      Alert.alert('카드 등록이 필요해요', '구독하려면 먼저 결제수단(카드)을 등록해주세요.', [
        { text: '취소', style: 'cancel' },
        { text: '등록하러 가기', onPress: () => (navigation as any).getParent()?.navigate('내정보', { screen: 'PaymentMethods' }) },
      ]);
      return;
    }
    await supabase
      .from('subscriptions')
      .upsert({ user_id: user.id, group_id: groupId, payment_method_id: pm.id, active: true }, { onConflict: 'user_id,group_id' });
    setBusy(null);
    refresh();
  };

  const name = (v: GroupRow['menus']) => (Array.isArray(v) ? v[0]?.name : v?.name) ?? '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="요일 다이어트 밥이" />
      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>아직 우리 빌딩에 개설된 구독이 없어요.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => {
            const on = subscribedIds.has(item.id);
            return (
              <View style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>
                    매주 {WEEKDAYS[item.weekday]}요일 · {name(item.restaurants)}
                  </Text>
                  <Text style={styles.sub}>
                    {name(item.menus)} · {slotLabel(item.time_slot as TimeSlot)} · 최소 {item.min_headcount}명
                  </Text>
                  {item.pickup_place && <Text style={styles.sub}>픽업: {item.pickup_place}</Text>}
                </View>
                <Pressable
                  style={[styles.btn, on && styles.btnOn]}
                  onPress={() => toggle(item.id)}
                  disabled={busy === item.id}
                >
                  <Text style={[styles.btnText, on && styles.btnTextOn]}>{on ? '구독중' : '구독'}</Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: screenPadding },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary, textAlign: 'center' },
  listContent: { padding: screenPadding },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  sub: { fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 },
  btn: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary },
  btnOn: { backgroundColor: colors.primary },
  btnText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.semibold },
  btnTextOn: { color: colors.white },
});
