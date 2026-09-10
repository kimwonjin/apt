import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../../navigation/types';
import { useAppState } from '../../state/AppStateContext';
import { supabase } from '../../lib/supabase';
import { formatPrice } from '../../lib/format';
import { buildDiscountTable, chargeAmount, DEFAULT_DISCOUNT_TABLE, DiscountTable, discountPercent, TIME_SLOT_LABEL, TimeSlot } from '../../lib/discount';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'GroupBuyCreate'>;

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

// 마감 시각을 고르면 그게 곧 할인 시간대(time_slot)가 된다 — 이를수록(오프피크) 할인율이 높다.
const DEADLINE_OPTIONS: { hour: number; slot: TimeSlot }[] = [
  { hour: 10, slot: 'offpeak' },
  { hour: 12, slot: 'peak' },
];
const PREVIEW_TIERS = [4, 5, 10, 20];

export function GroupBuyCreateScreen({ navigation }: Props) {
  const { buildingId } = useAppState();
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuRow | null>(null);
  const [discountTable, setDiscountTable] = useState<DiscountTable>(DEFAULT_DISCOUNT_TABLE);
  const [deadlineHour, setDeadlineHour] = useState<number | null>(null);
  const [minHeadcount, setMinHeadcount] = useState('3');
  const [pickupPlace, setPickupPlace] = useState('1층 로비');
  const [pickupTime, setPickupTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('restaurants')
      .select('id, name')
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => {
        setRestaurants(data ?? []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!restaurantId) {
      setMenus([]);
      return;
    }
    setMenu(null);
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
    if (!menu) {
      setDiscountTable(DEFAULT_DISCOUNT_TABLE);
      return;
    }
    supabase
      .from('menu_discount_tiers')
      .select('time_slot, min_headcount, discount_percent')
      .eq('menu_id', menu.id)
      .then(({ data }) => setDiscountTable(buildDiscountTable(data ?? []) ?? DEFAULT_DISCOUNT_TABLE));
  }, [menu]);

  // 오늘 그 시각이 이미 지났으면(또는 30분 미만 남았으면) 내일 같은 시각으로 넘긴다.
  // 안 그러면 오후엔 '10시 이전/12시 이전' 둘 다 항상 과거가 돼서 공구를 아예 못 만든다.
  const deadline = useMemo(() => {
    if (deadlineHour == null) return null;
    const d = new Date();
    d.setHours(deadlineHour, 0, 0, 0);
    if (d.getTime() <= Date.now() + 30 * 60 * 1000) d.setDate(d.getDate() + 1);
    return d;
  }, [deadlineHour]);
  const isDeadlineTomorrow = !!deadline && deadline.getDate() !== new Date().getDate();
  const selectedOption = DEADLINE_OPTIONS.find((o) => o.hour === deadlineHour) ?? null;
  const slot: TimeSlot = selectedOption?.slot ?? 'peak';

  const minHc = Math.max(Number(minHeadcount) || 0, 3);
  const isValid =
    !!buildingId && !!menu && deadline !== null && deadline.getTime() > Date.now() + 30 * 60 * 1000 && minHc >= 3;

  const handleSubmit = async () => {
    if (!isValid || !menu || !deadline || !buildingId) return;
    setSubmitting(true);
    setErrorMsg(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setErrorMsg('로그인 세션이 없습니다.');
      setSubmitting(false);
      return;
    }

    const { data, error } = await supabase
      .from('groupbuys')
      .insert({
        creator_id: user.id,
        building_id: buildingId,
        restaurant_id: restaurantId,
        menu_id: menu.id,
        title: menu.name,
        base_price: menu.base_price,
        time_slot: slot,
        min_headcount: minHc,
        deadline: deadline.toISOString(),
        pickup_place: pickupPlace.trim() || null,
        pickup_time: pickupTime.trim() || null,
      })
      .select('id')
      .single();

    if (error || !data) {
      setErrorMsg(error?.message ?? '개설에 실패했어요.');
      setSubmitting(false);
      return;
    }

    // 개설자는 자동으로 1번 참여자 (B-4)
    const { data: pm } = await supabase.from('payment_methods').select('id').eq('user_id', user.id).limit(1).maybeSingle();
    const pmId = pm?.id ?? (await supabase.from('payment_methods').insert({ user_id: user.id, label: '테스트카드 •••• 1234' }).select('id').single()).data?.id;
    await supabase.rpc('join_groupbuy', { gb_id: data.id, pm_id: pmId ?? null, want_qty: 1 });

    setSubmitting(false);
    navigation.replace('GroupBuyDetail', { groupBuyId: data.id });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>공구 만들기</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Field label="식당">
            {restaurants.length === 0 ? (
              <Text style={styles.note}>등록된 제휴 식당이 없어요. 운영자에게 문의하세요.</Text>
            ) : (
              <View style={styles.row}>
                {restaurants.map((r) => (
                  <Chip key={r.id} label={r.name} active={restaurantId === r.id} onPress={() => setRestaurantId(r.id)} />
                ))}
              </View>
            )}
          </Field>

          {restaurantId && (
            <Field label="메뉴">
              {menus.length === 0 ? (
                <Text style={styles.note}>이 식당에 등록된 메뉴가 없어요.</Text>
              ) : (
                <View style={styles.row}>
                  {menus.map((m) => (
                    <Chip key={m.id} label={`${m.name} ${formatPrice(m.base_price)}`} active={menu?.id === m.id} onPress={() => setMenu(m)} />
                  ))}
                </View>
              )}
            </Field>
          )}

          <Field label="주문 시간대 — 이를수록 할인율이 높아요">
            <View style={styles.row}>
              {DEADLINE_OPTIONS.map((o) => (
                <Chip
                  key={o.hour}
                  label={TIME_SLOT_LABEL[o.slot].name}
                  sublabel={`(${TIME_SLOT_LABEL[o.slot].hint})`}
                  active={deadlineHour === o.hour}
                  onPress={() => setDeadlineHour(o.hour)}
                />
              ))}
            </View>
            {deadline && (
              <Text style={styles.note}>
                {isDeadlineTomorrow ? '내일' : '오늘'} {deadlineHour}시 마감으로 잡혀요.
              </Text>
            )}
          </Field>

          <Field label="최소 성사 인원 (3명 이상)">
            <TextInput
              style={styles.input}
              value={minHeadcount}
              onChangeText={setMinHeadcount}
              keyboardType="number-pad"
              placeholder="3"
              placeholderTextColor={colors.textDisabled}
            />
          </Field>

          <Field label="로비 픽업 장소">
            <TextInput style={styles.input} value={pickupPlace} onChangeText={setPickupPlace} placeholderTextColor={colors.textDisabled} />
          </Field>
          <Field label="수령 예정 시각 (표시용)">
            <TextInput
              style={styles.input}
              value={pickupTime}
              onChangeText={setPickupTime}
              placeholder="12:30경"
              placeholderTextColor={colors.textDisabled}
            />
          </Field>

          {menu && (
            <View style={styles.previewBox}>
              <Text style={styles.previewTitle}>인원별 예상 가격 ({TIME_SLOT_LABEL[slot].name})</Text>
              {PREVIEW_TIERS.map((n) => (
                <View key={n} style={styles.previewRow}>
                  <Text style={styles.previewLabel}>{n < 5 ? `${n}명 (최소 미만)` : `${n}명`}</Text>
                  <Text style={styles.previewValue}>
                    {formatPrice(chargeAmount(menu.base_price, n, slot, discountTable))}
                    <Text style={styles.previewPct}> ({discountPercent(n, slot, discountTable)}%↓)</Text>
                  </Text>
                </View>
              ))}
            </View>
          )}

          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
        </ScrollView>
      )}

      <View style={styles.ctaBar}>
        <Pressable style={[styles.cta, (!isValid || submitting) && styles.ctaDisabled]} disabled={!isValid || submitting} onPress={handleSubmit}>
          <Text style={styles.ctaText}>{submitting ? '개설 중...' : '이 조건으로 공구 만들기'}</Text>
        </Pressable>
      </View>
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
  headerTitle: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.textPrimary },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: screenPadding, paddingBottom: spacing.xl, gap: spacing.md },
  field: { gap: spacing.xs },
  fieldLabel: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium },
  note: { fontSize: fontSize.base, color: colors.textTertiary },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.fillSubtle, alignItems: 'center' },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium },
  chipSubtext: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  chipTextActive: { color: colors.white, fontWeight: fontWeight.semibold },
  input: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: minTouchSize,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
  },
  previewBox: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  previewTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: 2 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between' },
  previewLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  previewValue: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },
  previewPct: { fontSize: fontSize.base, color: colors.danger, fontWeight: fontWeight.medium },
  errorText: { color: colors.danger, fontSize: fontSize.md },
  ctaBar: { paddingHorizontal: screenPadding, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.card },
  cta: { height: minTouchSize, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: colors.white, fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
});
