import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { HomeStackParamList } from '../../navigation/types';
import { useGroupBuy } from '../../hooks/useGroupBuy';
import { supabase } from '../../lib/supabase';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';
import { formatDday, formatPrice } from '../../lib/format';
import { nextTier, priceAfterDiscount, TIME_SLOT_LABEL, TimeSlot } from '../../lib/discount';

type Props = NativeStackScreenProps<HomeStackParamList, 'GroupBuyDetail'>;

interface Participant {
  id: string;
  name: string;
}

function slotLabel(slot: TimeSlot) {
  const { name, hint } = TIME_SLOT_LABEL[slot];
  return `${name} (${hint})`;
}

export function GroupBuyDetailScreen({ route, navigation }: Props) {
  const { groupBuy, loading, error, refresh } = useGroupBuy(route.params.groupBuyId);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
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
        .select('id, user_id')
        .eq('groupbuy_id', route.params.groupBuyId)
        .then(async ({ data }) => {
          if (cancelled || !data) return;
          setJoined(data.some((p) => p.user_id === myUserId));
          const ids = [...new Set(data.map((p) => p.user_id))];
          const { data: profiles } = await supabase.rpc('display_names', { ids });
          const nameMap = new Map(((profiles ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
          if (!cancelled) setParticipants(data.map((p) => ({ id: p.id, name: nameMap.get(p.user_id) || '참여자' })));
        });
      return () => {
        cancelled = true;
      };
    }, [myUserId, route.params.groupBuyId, refresh])
  );

  const isMine = myUserId === groupBuy?.creator.id;
  const isOpen = groupBuy?.status === 'open' && new Date(groupBuy.deadline).getTime() > Date.now();

  const ensurePaymentMethod = async () => {
    if (!myUserId) return null;
    const { data } = await supabase.from('payment_methods').select('id').eq('user_id', myUserId).limit(1).maybeSingle();
    if (data) return data.id;
    const { data: created } = await supabase
      .from('payment_methods')
      .insert({ user_id: myUserId, label: '테스트카드 •••• 1234' })
      .select('id')
      .single();
    return created?.id ?? null;
  };

  const handleJoin = async () => {
    if (!groupBuy || busy) return;
    setBusy(true);
    setActionError(null);
    const pmId = await ensurePaymentMethod();
    const { error: e } = await supabase.rpc('join_groupbuy', { gb_id: groupBuy.id, pm_id: pmId, want_qty: 1 });
    setBusy(false);
    if (e) {
      setActionError(joinErrorMessage(e.message));
      return;
    }
    setJoined(true);
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
  const met = participantCount >= minHeadcount;
  const price = priceAfterDiscount(basePrice, discountPercent);
  const next = nextTier(participantCount, timeSlot, groupBuy.discountTable);
  const progress = Math.min(participantCount / minHeadcount, 1);

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
            <Text style={styles.ddayText}>{isOpen ? formatDday(groupBuy.deadline) : '마감'}</Text>
          </View>
        </View>

        <Text style={styles.title}>{groupBuy.title}</Text>

        <View style={styles.priceRow}>
          {discountPercent > 0 && <Text style={styles.discount}>{discountPercent}%↓</Text>}
          <Text style={styles.groupPrice}>{formatPrice(price)}</Text>
          {discountPercent > 0 && <Text style={styles.marketPrice}>{formatPrice(basePrice)}</Text>}
        </View>

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

        <View style={styles.section}>
          <Row label="주문 시간대" value={slotLabel(timeSlot)} />
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
        {isMine ? (
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
        ) : (
          <Pressable style={styles.primaryCta} onPress={handleJoin} disabled={busy}>
            <Text style={styles.primaryCtaText}>{busy ? '처리 중...' : `${formatPrice(price)} 참여하기`}</Text>
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
  section: { gap: spacing.xs, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.xs },
  sectionLabel: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: spacing.sm },
  rowValue: { fontSize: fontSize.md, color: colors.textPrimary, fontWeight: fontWeight.medium, flexShrink: 1, textAlign: 'right' },
  participantRow: { fontSize: fontSize.md, color: colors.textPrimary, paddingVertical: 3 },
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
