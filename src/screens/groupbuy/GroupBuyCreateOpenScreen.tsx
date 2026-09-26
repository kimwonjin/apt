import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../../navigation/types';
import { useAppState } from '../../state/AppStateContext';
import { supabase } from '../../lib/supabase';
import { formatPrice } from '../../lib/format';
import { discountPercent, FIXED_DISCOUNT_TABLE, priceAfterDiscount, TIME_SLOT_LABEL, TimeSlot } from '../../lib/discount';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'GroupBuyCreateOpen'>;

interface RestaurantRow {
  id: string;
  name: string;
}
interface MenuRow {
  id: string;
  name: string;
  base_price: number;
  min_headcount: number;
  photo_url: string | null;
}

// 마감 시각을 고르면 그게 곧 할인 시간대(time_slot)가 된다 — 이를수록(오프피크) 할인율이 높다.
const DEADLINE_OPTIONS: { hour: number; slot: TimeSlot }[] = [
  { hour: 10, slot: 'offpeak' },
  { hour: 12, slot: 'peak' },
];
// 고정 할인표의 구간이 바뀌는 지점만 미리보기로 보여준다(1/2/4/10/20명).
const PREVIEW_TIERS = [1, 2, 4, 10, 20];
// 이 구조는 최소 인원을 따로 입력받지 않고 항상 2명으로 고정한다.
const MIN_HEADCOUNT = 2;

// "만들기2" — 공구대장이 인원을 미리 모아오는 게 아니라 공구만 열어두고 건물 사람들이
// 자유롭게 참여하는 방식(자유참여형). 메뉴별 할인 매트릭스 대신 인원수만 보는 고정
// 계단식 할인율(FIXED_DISCOUNT_TABLE)을 쓴다 — pricing_mode: 'fixed'로 표시.
// 한 식당 안에서 메뉴를 여러 개 담아("담기") 장바구니처럼 개설할 수 있다(연어 1개+치킨 2개 등).
export function GroupBuyCreateOpenScreen({ navigation }: Props) {
  const { buildingId } = useAppState();
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [deadlineHour, setDeadlineHour] = useState<number | null>(null);
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
    setCart({});
    if (!restaurantId) {
      setMenus([]);
      return;
    }
    supabase
      .from('menus')
      .select('id, name, base_price, min_headcount, photo_url')
      .eq('restaurant_id', restaurantId)
      .eq('active', true)
      .order('name')
      .then(({ data }) => setMenus(data ?? []));
  }, [restaurantId]);

  const setQty = (menuId: string, qty: number) => {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[menuId];
      else next[menuId] = qty;
      return next;
    });
  };

  // 오늘 그 시각이 이미 지났으면(또는 30분 미만 남았으면) 내일 같은 시각으로 넘긴다.
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

  const cartItems = useMemo(
    () => menus.filter((m) => (cart[m.id] ?? 0) > 0).map((m) => ({ menu: m, qty: cart[m.id] })),
    [menus, cart]
  );
  const totalQty = cartItems.reduce((sum, i) => sum + i.qty, 0);
  const currentPct = discountPercent(totalQty, slot, FIXED_DISCOUNT_TABLE);
  const totalOriginal = cartItems.reduce((sum, i) => sum + i.menu.base_price * i.qty, 0);
  const totalAfterDiscount = cartItems.reduce((sum, i) => sum + priceAfterDiscount(i.menu.base_price, currentPct) * i.qty, 0);

  const isValid = !!buildingId && cartItems.length > 0 && deadline !== null && deadline.getTime() > Date.now() + 30 * 60 * 1000;

  const handleSubmit = async () => {
    if (!isValid || !deadline || !buildingId || !restaurantId) return;
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

    const restaurantName = restaurants.find((r) => r.id === restaurantId)?.name ?? '식당';

    const { data, error } = await supabase
      .from('groupbuys')
      .insert({
        creator_id: user.id,
        building_id: buildingId,
        restaurant_id: restaurantId,
        menu_id: null,
        title: `${restaurantName} 자유주문`,
        photo_url: cartItems[0]?.menu.photo_url ?? null,
        base_price: 0,
        time_slot: slot,
        min_headcount: MIN_HEADCOUNT,
        pricing_mode: 'fixed',
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

    // 개설자는 자동으로 담은 장바구니로 1번 참여자가 됨 — 카드가 없으면 자동 참여는 건너뛰고
    // 상세 화면에서 직접 참여하도록 안내한다.
    const { data: pm } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('user_id', user.id)
      .not('billing_key', 'is', null)
      .limit(1)
      .maybeSingle();
    if (pm) {
      const items = cartItems.map((i) => ({ menu_id: i.menu.id, qty: i.qty }));
      await supabase.rpc('join_groupbuy_cart', { gb_id: data.id, pm_id: pm.id, items });
    }

    setSubmitting(false);
    navigation.replace('GroupBuyDetail', { groupBuyId: data.id });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>공구 만들기 (자유참여형)</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.intro}>
            공구대장이 미리 인원을 모아오지 않고, 공구를 열어두면 건물 사람들이 원할 때 자유롭게 참여해요.
          </Text>

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
            <Field label="메뉴 담기 — 원하는 메뉴를 각각 담을 수 있어요">
              {menus.length === 0 ? (
                <Text style={styles.note}>이 식당에 등록된 메뉴가 없어요.</Text>
              ) : (
                <View style={styles.menuList}>
                  {menus.map((m) => (
                    <MenuCartRow key={m.id} menu={m} qty={cart[m.id] ?? 0} onChange={(q) => setQty(m.id, q)} />
                  ))}
                </View>
              )}
            </Field>
          )}

          <Field label="주문 마감 시간대 — 이를수록 할인율이 높아요">
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

          <Field label="픽업 장소">
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

          <View style={styles.previewBox}>
            <View style={styles.countRow}>
              <Text style={styles.countLabel}>현재 참여 인원</Text>
              <Text style={styles.countValue}>
                {totalQty}
                <Text style={styles.countUnit}>명</Text>
              </Text>
            </View>
            <Text style={styles.countNote}>담은 수량 합계 · 최소 {MIN_HEADCOUNT}명 모이면 성사돼요</Text>

            <View style={styles.tierTrack}>
              {PREVIEW_TIERS.map((n, i) => {
                const reached = n <= totalQty;
                return (
                  <React.Fragment key={n}>
                    {i > 0 && <View style={[styles.tierLine, reached && styles.tierLineActive]} />}
                    <View style={styles.tierStep}>
                      <View style={[styles.tierDot, reached && styles.tierDotActive]}>
                        <Text style={[styles.tierDotText, reached && styles.tierDotTextActive]}>{n}</Text>
                      </View>
                      <Text style={styles.tierPct}>{discountPercent(n, slot, FIXED_DISCOUNT_TABLE)}%</Text>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>

            {cartItems.length > 0 ? (
              <>
                <Text style={[styles.previewTitle, { marginTop: spacing.sm }]}>담은 메뉴</Text>
                <View style={styles.previewList}>
                  {cartItems.map((i) => (
                    <View key={i.menu.id} style={styles.previewRow}>
                      <Text style={styles.previewLabel}>
                        {i.menu.name} × {i.qty}개
                      </Text>
                      <Text style={styles.previewValue}>{formatPrice(priceAfterDiscount(i.menu.base_price, currentPct) * i.qty)}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    합계 ({currentPct}%↓)
                    {totalOriginal !== totalAfterDiscount && <Text style={styles.totalOriginal}> {formatPrice(totalOriginal)}</Text>}
                  </Text>
                  <Text style={styles.totalValue}>{formatPrice(totalAfterDiscount)}</Text>
                </View>
              </>
            ) : (
              <Text style={styles.note}>메뉴를 담으면 예상 가격이 보여요.</Text>
            )}
          </View>

          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
        </ScrollView>
      )}

      <View style={styles.ctaBar}>
        <Pressable style={[styles.cta, (!isValid || submitting) && styles.ctaDisabled]} disabled={!isValid || submitting} onPress={handleSubmit}>
          <Text style={styles.ctaText}>{submitting ? '개설 중...' : '담은 대로 공구 만들기'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function MenuCartRow({ menu, qty, onChange }: { menu: MenuRow; qty: number; onChange: (qty: number) => void }) {
  return (
    <View style={styles.menuRow}>
      <View style={styles.menuInfo}>
        <Text style={styles.menuName} numberOfLines={1}>
          {menu.name}
        </Text>
        <Text style={styles.menuPrice}>{formatPrice(menu.base_price)}</Text>
      </View>
      {qty > 0 ? (
        <View style={styles.menuStepper}>
          <Pressable style={styles.stepBtn} onPress={() => onChange(qty - 1)} hitSlop={8}>
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <Text style={styles.stepValue}>{qty}개</Text>
          <Pressable style={styles.stepBtn} onPress={() => onChange(qty + 1)} hitSlop={8}>
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.addBtn} onPress={() => onChange(1)}>
          <Text style={styles.addBtnText}>담기</Text>
        </Pressable>
      )}
    </View>
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
  intro: { fontSize: fontSize.base, color: colors.textSecondary, lineHeight: 18 },
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
  menuList: { gap: spacing.xs },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  menuInfo: { flex: 1, marginRight: spacing.sm },
  menuName: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.textPrimary },
  menuPrice: { fontSize: fontSize.base, color: colors.textSecondary, marginTop: 1 },
  addBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  addBtnText: { color: colors.white, fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  menuStepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.fillSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  stepValue: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary, minWidth: 32, textAlign: 'center' },
  previewBox: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  countRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  countLabel: { fontSize: fontSize.titleLg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  countValue: { fontSize: 30, fontWeight: fontWeight.heavy, color: colors.primary },
  countUnit: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.primary },
  countNote: { fontSize: fontSize.base, color: colors.textTertiary, marginTop: -4 },
  tierTrack: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.sm },
  tierStep: { alignItems: 'center', gap: 3, width: 32 },
  tierDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.fillSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierDotActive: { backgroundColor: colors.primary },
  tierDotText: { fontSize: 11, fontWeight: fontWeight.semibold, color: colors.textTertiary },
  tierDotTextActive: { color: colors.white },
  tierPct: { fontSize: 10, color: colors.textTertiary, fontWeight: fontWeight.medium },
  tierLine: { flex: 1, height: 2, backgroundColor: colors.divider, marginTop: 13, marginHorizontal: -2 },
  tierLineActive: { backgroundColor: colors.primary },
  previewTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: 2 },
  previewList: { marginTop: spacing.xs, gap: 4 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 3 },
  previewLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  previewValue: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  totalLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  totalOriginal: { fontSize: fontSize.base, color: colors.textDisabled, textDecorationLine: 'line-through', fontWeight: fontWeight.medium },
  totalValue: { fontSize: fontSize.xxl, fontWeight: fontWeight.heavy, color: colors.primary },
  errorText: { color: colors.danger, fontSize: fontSize.md },
  ctaBar: { paddingHorizontal: screenPadding, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.card },
  cta: { height: minTouchSize, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: colors.white, fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
});
