import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { useAppState } from '../../state/AppStateContext';
import { supabase } from '../../lib/supabase';
import { formatPrice } from '../../lib/format';
import { TIME_SLOT_LABEL, TimeSlot } from '../../lib/discount';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<MyPageStackParamList, 'SubscriptionAdmin'>;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const TIME_SLOTS: TimeSlot[] = ['offpeak', 'peak'];

interface RestaurantRow {
  id: string;
  name: string;
}
interface MenuRow {
  id: string;
  name: string;
  base_price: number;
  min_headcount: number;
}
interface GroupRow {
  id: string;
  weekday: number;
  time_slot: TimeSlot;
  min_headcount: number;
  pickup_place: string | null;
  deadline_time: string;
  active: boolean;
  menus: { name: string } | { name: string }[] | null;
  restaurants: { name: string } | { name: string }[] | null;
}

// 탭 D "요일 다이어트 밥이" 구독 그룹 관리. 매주 같은 요일·시간대에 자동으로 공구가
// 열리는 정기 구독 상품을 운영자가 등록한다(materialize_subscription_runs가 매일 실체화).
export function SubscriptionAdminScreen({ navigation }: Props) {
  const { buildingId } = useAppState();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuRow | null>(null);
  const [weekday, setWeekday] = useState(1);
  const [slot, setSlot] = useState<TimeSlot>('offpeak');
  const [minHeadcount, setMinHeadcount] = useState('3');
  const [pickupPlace, setPickupPlace] = useState('1층 로비');
  const [deadlineTime, setDeadlineTime] = useState('09:00');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!buildingId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: g }, { data: r }] = await Promise.all([
      supabase
        .from('subscription_groups')
        .select('id, weekday, time_slot, min_headcount, pickup_place, deadline_time, active, menus(name), restaurants(name)')
        .eq('building_id', buildingId)
        .order('weekday'),
      supabase.from('restaurants').select('id, name').eq('status', 'active').order('name'),
    ]);
    setGroups((g ?? []) as GroupRow[]);
    setRestaurants(r ?? []);
    setLoading(false);
  }, [buildingId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    if (!restaurantId) {
      setMenus([]);
      setMenu(null);
      return;
    }
    supabase
      .from('menus')
      .select('id, name, base_price, min_headcount')
      .eq('restaurant_id', restaurantId)
      .eq('active', true)
      .order('name')
      .then(({ data }) => setMenus(data ?? []));
  }, [restaurantId]);

  useEffect(() => {
    if (menu) setMinHeadcount(String(menu.min_headcount));
  }, [menu]);

  const isValid = !!buildingId && !!restaurantId && !!menu && /^\d{2}:\d{2}$/.test(deadlineTime) && Number(minHeadcount) >= 3;

  const addGroup = async () => {
    if (!isValid || !menu || busy) return;
    setBusy(true);
    setErrorMsg(null);
    const { error } = await supabase.from('subscription_groups').insert({
      building_id: buildingId,
      restaurant_id: restaurantId,
      menu_id: menu.id,
      weekday,
      time_slot: slot,
      min_headcount: Number(minHeadcount) || 3,
      pickup_place: pickupPlace.trim() || null,
      deadline_time: deadlineTime,
    });
    setBusy(false);
    if (error) {
      setErrorMsg(error.message.includes('duplicate') || error.code === '23505' ? '이미 같은 요일·시간대·메뉴 구독이 있어요.' : error.message);
      return;
    }
    setRestaurantId(null);
    setMenu(null);
    setPickupPlace('1층 로비');
    setDeadlineTime('09:00');
    refresh();
  };

  const toggleActive = async (row: GroupRow) => {
    await supabase.from('subscription_groups').update({ active: !row.active }).eq('id', row.id);
    refresh();
  };

  const name = (v: GroupRow['menus']) => (Array.isArray(v) ? v[0]?.name : v?.name) ?? '';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>구독 그룹 관리</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionLabel}>등록된 구독 그룹</Text>
          {groups.length === 0 ? (
            <Text style={styles.note}>아직 없어요. 아래에서 새로 등록하세요.</Text>
          ) : (
            groups.map((g) => (
              <View key={g.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowText}>
                    매주 {WEEKDAYS[g.weekday]}요일 · {name(g.restaurants)} · {name(g.menus)}
                  </Text>
                  <Text style={styles.rowSub}>
                    {TIME_SLOT_LABEL[g.time_slot].name}({TIME_SLOT_LABEL[g.time_slot].hint}) · 최소 {g.min_headcount}명 ·{' '}
                    {g.deadline_time.slice(0, 5)} 마감{g.pickup_place ? ` · ${g.pickup_place}` : ''}
                  </Text>
                </View>
                <Switch value={g.active} onValueChange={() => toggleActive(g)} trackColor={{ true: colors.primary }} />
              </View>
            ))
          )}

          <Text style={styles.sectionLabel}>새 구독 그룹 등록</Text>
          <Field label="식당">
            <View style={styles.chipRow}>
              {restaurants.map((r) => (
                <Chip key={r.id} label={r.name} active={restaurantId === r.id} onPress={() => setRestaurantId(r.id)} />
              ))}
            </View>
          </Field>

          {restaurantId && (
            <Field label="메뉴">
              {menus.length === 0 ? (
                <Text style={styles.note}>이 식당에 등록된 메뉴가 없어요.</Text>
              ) : (
                <View style={styles.chipRow}>
                  {menus.map((m) => (
                    <Chip key={m.id} label={`${m.name} ${formatPrice(m.base_price)}`} active={menu?.id === m.id} onPress={() => setMenu(m)} />
                  ))}
                </View>
              )}
            </Field>
          )}

          <Field label="요일">
            <View style={styles.chipRow}>
              {WEEKDAYS.map((w, i) => (
                <Chip key={w} label={`${w}요일`} active={weekday === i} onPress={() => setWeekday(i)} />
              ))}
            </View>
          </Field>

          <Field label="주문 시간대">
            <View style={styles.chipRow}>
              {TIME_SLOTS.map((s) => (
                <Chip
                  key={s}
                  label={TIME_SLOT_LABEL[s].name}
                  sublabel={`(${TIME_SLOT_LABEL[s].hint})`}
                  active={slot === s}
                  onPress={() => setSlot(s)}
                />
              ))}
            </View>
          </Field>

          <View style={styles.formRow}>
            <Field label="최소 성사 인원">
              <TextInput
                style={styles.input}
                value={minHeadcount}
                onChangeText={setMinHeadcount}
                keyboardType="number-pad"
                placeholderTextColor={colors.textDisabled}
              />
            </Field>
            <Field label="마감 시각 (HH:MM)">
              <TextInput
                style={styles.input}
                value={deadlineTime}
                onChangeText={setDeadlineTime}
                placeholder="09:00"
                placeholderTextColor={colors.textDisabled}
              />
            </Field>
          </View>

          <Field label="로비 픽업 장소">
            <TextInput style={styles.input} value={pickupPlace} onChangeText={setPickupPlace} placeholderTextColor={colors.textDisabled} />
          </Field>

          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

          <Pressable style={[styles.addBtn, !isValid && styles.addBtnDisabled]} onPress={addGroup} disabled={!isValid || busy}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.addBtnText}>+ 구독 그룹 등록</Text>}
          </Pressable>

          <Text style={styles.note}>
            등록하면 매주 그 요일 새벽에 자동으로 공구가 열리고, 스킵 안 한 구독자는 자동 참여돼요.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, sublabel, active, onPress }: { label: string; sublabel?: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {sublabel && <Text style={[styles.chipSubtext, active && styles.chipTextActive]}>{sublabel}</Text>}
    </Pressable>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md },
  rowText: { fontSize: fontSize.md, color: colors.textPrimary, fontWeight: fontWeight.medium },
  rowSub: { fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 },
  field: { gap: spacing.xs, marginTop: spacing.sm, flex: 1 },
  fieldLabel: { fontSize: fontSize.base, color: colors.textSecondary, fontWeight: fontWeight.medium },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.fillSubtle, alignItems: 'center' },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium },
  chipSubtext: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  chipTextActive: { color: colors.white, fontWeight: fontWeight.semibold },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: minTouchSize,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  errorText: { color: colors.danger, fontSize: fontSize.md, marginTop: spacing.sm },
  addBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: spacing.md },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: colors.white, fontWeight: fontWeight.semibold, fontSize: fontSize.md },
});
