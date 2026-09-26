import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { HomeStackParamList } from '../../navigation/types';
import { useGroupBuy } from '../../hooks/useGroupBuy';
import { supabase } from '../../lib/supabase';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';
import { formatDate, formatDday, formatPrice } from '../../lib/format';
import { discountPercent as tierPercent, nextTier, priceAfterDiscount, TIME_SLOT_LABEL, TimeSlot } from '../../lib/discount';
import { QtyStepper } from '../../components/QtyStepper';
import { CartItem } from '../../types/domain';

type Props = NativeStackScreenProps<HomeStackParamList, 'GroupBuyDetail'>;

interface Participant {
  id: string;
  name: string;
  qty: number;
}

interface MenuRow {
  id: string;
  name: string;
  base_price: number;
  photo_url: string | null;
}

const MAX_QTY = 10;

function slotLabel(slot: TimeSlot) {
  const { name, hint } = TIME_SLOT_LABEL[slot];
  return `${name} (${hint})`;
}

export function GroupBuyDetailScreen({ route, navigation }: Props) {
  const { groupBuy, loading, error, refresh } = useGroupBuy(route.params.groupBuyId);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [qty, setQty] = useState(1);
  const [restaurantMenus, setRestaurantMenus] = useState<MenuRow[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [myItems, setMyItems] = useState<CartItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openingChat, setOpeningChat] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      if (!myUserId) return;
      let cancelled = false;
      supabase
        .from('participations')
        .select('id, user_id, qty')
        .eq('groupbuy_id', route.params.groupBuyId)
        .then(async ({ data }) => {
          if (cancelled || !data) return;
          const mine = data.find((p) => p.user_id === myUserId);
          setJoined(!!mine);
          if (mine) {
            setQty(mine.qty);
            const { data: items } = await supabase
              .from('participation_items')
              .select('menu_id, name, base_price, qty')
              .eq('participation_id', mine.id);
            if (!cancelled)
              setMyItems((items ?? []).map((i) => ({ menuId: i.menu_id, name: i.name, basePrice: i.base_price, qty: i.qty })));
          } else if (!cancelled) {
            setMyItems([]);
          }
          const ids = [...new Set(data.map((p) => p.user_id))];
          const { data: profiles } = await supabase.rpc('display_names', { ids });
          const nameMap = new Map(((profiles ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
          if (!cancelled)
            setParticipants(data.map((p) => ({ id: p.id, name: nameMap.get(p.user_id) || '참여자', qty: p.qty })));
        });
      return () => {
        cancelled = true;
      };
    }, [myUserId, route.params.groupBuyId, refresh])
  );

  // 자유참여형(장바구니) 공구는 참여 전에 이 식당의 메뉴 목록을 보여줘야 담을 수 있다.
  useEffect(() => {
    if (groupBuy?.pricingMode !== 'fixed') return;
    let cancelled = false;
    supabase
      .from('menus')
      .select('id, name, base_price, photo_url')
      .eq('restaurant_id', groupBuy.restaurant.id)
      .eq('active', true)
      .order('name')
      .then(({ data }) => {
        if (!cancelled) setRestaurantMenus(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [groupBuy?.pricingMode, groupBuy?.restaurant.id]);

  const isMine = myUserId === groupBuy?.creator.id;
  const isOpen = groupBuy?.status === 'open' && new Date(groupBuy.deadline).getTime() > Date.now();

  // 카드 등록은 지금은 참여를 막지 않는다(파일럿 초반이라 결제 단계는 나중에 다시 붙임) —
  // 카드가 있으면 붙여두고, 없으면 payment_method_id null로 참여만 먼저 시킨다.
  // 실제 결제 승인은 어차피 "주문 요청 관리"에서 나중에 카드 유무를 다시 확인해서 처리한다.
  const ensurePaymentMethod = async () => {
    if (!myUserId) return null;
    const { data } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('user_id', myUserId)
      .not('billing_key', 'is', null)
      .limit(1)
      .maybeSingle();
    return data?.id ?? null;
  };

  const handleJoin = async () => {
    if (!groupBuy || busy) return;
    setBusy(true);
    setActionError(null);
    const pmId = await ensurePaymentMethod();
    const { error: e } = await supabase.rpc('join_groupbuy', { gb_id: groupBuy.id, pm_id: pmId, want_qty: qty });
    setBusy(false);
    if (e) {
      setActionError(joinErrorMessage(e.message));
      return;
    }
    setJoined(true);
    refresh();
  };

  const setCartQty = (menuId: string, next: number) => {
    setCart((prev) => {
      const copy = { ...prev };
      if (next <= 0) delete copy[menuId];
      else copy[menuId] = next;
      return copy;
    });
  };

  const handleJoinCart = async () => {
    if (!groupBuy || busy) return;
    const items = Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([menu_id, q]) => ({ menu_id, qty: q }));
    if (items.length === 0) return;
    setBusy(true);
    setActionError(null);
    const pmId = await ensurePaymentMethod();
    const { error: e } = await supabase.rpc('join_groupbuy_cart', { gb_id: groupBuy.id, pm_id: pmId, items });
    setBusy(false);
    if (e) {
      setActionError(joinErrorMessage(e.message));
      return;
    }
    setJoined(true);
    setCart({});
    refresh();
  };

  const handleLeave = async () => {
    if (!groupBuy || busy) return;
    setBusy(true);
    setActionError(null);
    const { error: e } = await supabase.rpc('leave_groupbuy', { gb_id: groupBuy.id });
    setBusy(false);
    if (e) {
      setActionError('마감된 공구는 취소할 수 없어요.');
      return;
    }
    setJoined(false);
    setQty(1);
    setMyItems([]);
    refresh();
  };

  const handleChat = async () => {
    if (!groupBuy || openingChat) return;
    setOpeningChat(true);
    const { data: roomId } = await supabase.rpc('create_or_get_chat_room', {
      peer_id: groupBuy.creator.id,
      gb_id: groupBuy.id,
    });
    setOpeningChat(false);
    if (roomId) (navigation as any).getParent()?.navigate('채팅', { screen: 'ChatRoom', params: { roomId } });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centerFill]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }
  if (error || !groupBuy) {
    return (
      <SafeAreaView style={[styles.container, styles.centerFill]}>
        <Text style={styles.errorText}>{error ?? '공구를 찾을 수 없습니다.'}</Text>
      </SafeAreaView>
    );
  }

  const { participantCount, minHeadcount, discountPercent, timeSlot, basePrice } = groupBuy;
  const isCart = groupBuy.pricingMode === 'fixed';
  const met = participantCount >= minHeadcount;
  const price = priceAfterDiscount(basePrice, discountPercent);
  const next = nextTier(participantCount, timeSlot, groupBuy.discountTable);
  const progress = Math.min(participantCount / minHeadcount, 1);

  const cartItems = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([menuId, q]) => {
      const menu = restaurantMenus.find((m) => m.id === menuId);
      return menu ? { menu, qty: q } : null;
    })
    .filter((v): v is { menu: MenuRow; qty: number } => v !== null);
  const cartQty = cartItems.reduce((sum, i) => sum + i.qty, 0);
  const previewPct = tierPercent(participantCount + cartQty, timeSlot, groupBuy.discountTable);
  const cartTotal = cartItems.reduce((sum, i) => sum + priceAfterDiscount(i.menu.base_price, previewPct) * i.qty, 0);
  const myItemsPct = groupBuy.finalDiscountPercent ?? discountPercent;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {groupBuy.photoUrl ? <Image source={{ uri: groupBuy.photoUrl }} style={styles.hero} /> : <View style={styles.hero} />}

        <View style={styles.badgeRow}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{groupBuy.restaurant.name}</Text>
          </View>
          <View style={styles.ddayBadge}>
            <Text style={styles.ddayText}>
              {isOpen ? formatDday(groupBuy.deadline) : `${formatDate(groupBuy.deadline)} 마감`}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>
          {groupBuy.pricingMode === 'fixed' ? '🧪 자유참여형 · ' : ''}
          {groupBuy.title}
        </Text>

        {!isCart && (
          <View style={styles.priceRow}>
            {discountPercent > 0 && <Text style={styles.discount}>{discountPercent}%↓</Text>}
            <Text style={styles.groupPrice}>{formatPrice(price)}</Text>
            {discountPercent > 0 && <Text style={styles.marketPrice}>{formatPrice(basePrice)}</Text>}
          </View>
        )}

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.participantText}>
          {participantCount}명 참여 중 · {met ? '최소 인원 충족 ✓' : `최소 ${minHeadcount}명 필요`}
        </Text>
        {isOpen && next && (
          <Text style={styles.hint}>
            지금 {discountPercent}% 할인 · {next.needed}명 더 모이면 {next.percent}%로 올라가요
          </Text>
        )}

        {isOpen && !joined && !isCart && (
          <View style={styles.qtyRow}>
            <Text style={styles.sectionLabel}>수량</Text>
            <QtyStepper value={qty} onChange={setQty} max={MAX_QTY} />
          </View>
        )}

        {isOpen && !joined && isCart && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>메뉴 담기 — 원하는 메뉴를 각각 담을 수 있어요</Text>
            {restaurantMenus.length === 0 ? (
              <Text style={styles.note}>메뉴를 불러오는 중...</Text>
            ) : (
              <View style={styles.menuList}>
                {restaurantMenus.map((m) => (
                  <MenuCartRow key={m.id} menu={m} qty={cart[m.id] ?? 0} onChange={(q) => setCartQty(m.id, q)} />
                ))}
              </View>
            )}
            {cartItems.length > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>합계 ({previewPct}%↓)</Text>
                <Text style={styles.totalValue}>{formatPrice(cartTotal)}</Text>
              </View>
            )}
          </View>
        )}

        {joined && isCart && myItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>내가 담은 메뉴</Text>
            {myItems.map((i) => (
              <View key={i.menuId} style={styles.previewRow}>
                <Text style={styles.previewLabel}>
                  {i.name} × {i.qty}개
                </Text>
                <Text style={styles.previewValue}>{formatPrice(priceAfterDiscount(i.basePrice, myItemsPct) * i.qty)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Row label="주문 마감 시간대" value={slotLabel(timeSlot)} />
          <Row label="로비 픽업 장소" value={groupBuy.pickupPlace ?? '-'} />
          <Row label="수령 예정" value={groupBuy.pickupTime ?? '-'} />
          <Row label="개설자" value={`${groupBuy.creator.name} · ${groupBuy.creator.buildingLabel}`} />
        </View>

        {joined && participants.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>참여자 ({participants.length})</Text>
            {participants.map((p) => (
              <Text key={p.id} style={styles.participantRow}>
                {p.name}
                {p.qty > 1 ? ` · ${p.qty}개` : ''}
              </Text>
            ))}
          </View>
        )}

        {actionError && <Text style={styles.errorText}>{actionError}</Text>}
      </ScrollView>

      <View style={styles.ctaBar}>
        {!isMine && joined && (
          <Pressable style={styles.chatBtn} onPress={handleChat} disabled={openingChat}>
            <Text style={styles.chatBtnText}>💬</Text>
          </Pressable>
        )}
        {isMine && joined ? (
          <View style={[styles.primaryCta, styles.primaryCtaDisabled]}>
            <Text style={styles.primaryCtaText}>내가 만든 공구예요</Text>
          </View>
        ) : !isOpen ? (
          <View style={[styles.primaryCta, styles.primaryCtaDisabled]}>
            <Text style={styles.primaryCtaText}>{groupBuy.status === 'success' ? '성사된 공구예요' : '마감된 공구예요'}</Text>
          </View>
        ) : joined ? (
          <Pressable style={styles.primaryCta} onPress={handleLeave} disabled={busy}>
            <Text style={styles.primaryCtaText}>{busy ? '처리 중...' : '참여 취소'}</Text>
          </Pressable>
        ) : isCart ? (
          <Pressable
            style={[styles.primaryCta, (busy || cartItems.length === 0) && styles.primaryCtaDisabled]}
            onPress={handleJoinCart}
            disabled={busy || cartItems.length === 0}
          >
            <Text style={styles.primaryCtaText}>
              {busy ? '처리 중...' : cartItems.length > 0 ? `${formatPrice(cartTotal)} 담은 대로 참여하기` : '메뉴를 담아주세요'}
            </Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primaryCta} onPress={handleJoin} disabled={busy}>
            <Text style={styles.primaryCtaText}>
              {busy ? '처리 중...' : `${formatPrice(price * qty)} 참여하기${qty > 1 ? ` (${qty}개)` : ''}`}
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function joinErrorMessage(raw: string) {
  if (raw.includes('deadline_passed')) return '마감된 공구예요.';
  if (raw.includes('not_building_member')) return '이 빌딩 인증이 필요해요.';
  if (raw.includes('groupbuy_not_open')) return '이미 마감/성사된 공구예요.';
  if (raw.includes('duplicate') || raw.includes('23505')) return '이미 참여 중이에요.';
  return '참여에 실패했어요. 다시 시도해주세요.';
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerFill: { alignItems: 'center', justifyContent: 'center', padding: screenPadding },
  errorText: { fontSize: fontSize.md, color: colors.danger, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: screenPadding, paddingVertical: spacing.sm },
  back: { fontSize: 28, color: colors.textPrimary },
  scrollContent: { paddingHorizontal: screenPadding, paddingBottom: spacing.xl, gap: spacing.sm },
  hero: { width: '100%', height: 200, borderRadius: radius.lg, backgroundColor: colors.fillSubtle },
  badgeRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  categoryBadge: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  categoryBadgeText: { color: colors.primary, fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  ddayBadge: { backgroundColor: colors.dangerLight, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  ddayText: { color: colors.danger, fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  title: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.textPrimary },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  groupPrice: { fontSize: fontSize.display, fontWeight: fontWeight.heavy, color: colors.primary },
  marketPrice: { fontSize: fontSize.lg, color: colors.textDisabled, textDecorationLine: 'line-through' },
  discount: { fontSize: fontSize.lg, color: colors.danger, fontWeight: fontWeight.semibold },
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.divider, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
  participantText: { fontSize: fontSize.md, color: colors.textSecondary },
  hint: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.medium },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  section: { gap: spacing.xs, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.xs },
  sectionLabel: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: spacing.sm },
  rowValue: { fontSize: fontSize.md, color: colors.textPrimary, fontWeight: fontWeight.medium, flexShrink: 1, textAlign: 'right' },
  participantRow: { fontSize: fontSize.md, color: colors.textPrimary, paddingVertical: 3 },
  note: { fontSize: fontSize.base, color: colors.textTertiary, marginTop: spacing.xs },
  menuList: { gap: spacing.xs, marginTop: spacing.xs },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.fillSubtle,
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
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  stepValue: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary, minWidth: 32, textAlign: 'center' },
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
  totalValue: { fontSize: fontSize.xxl, fontWeight: fontWeight.heavy, color: colors.primary },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  previewLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  previewValue: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },
  ctaBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.card,
  },
  chatBtn: {
    width: minTouchSize,
    height: minTouchSize,
    borderRadius: radius.md,
    backgroundColor: colors.fillSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBtnText: { fontSize: fontSize.title },
  primaryCta: { flex: 1, height: minTouchSize, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryCtaText: { color: colors.white, fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
  primaryCtaDisabled: { backgroundColor: colors.textDisabled },
});
