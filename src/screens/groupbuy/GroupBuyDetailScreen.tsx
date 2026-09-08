import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { HomeStackParamList } from '../../navigation/types';
import { useGroupBuy } from '../../hooks/useGroupBuy';
import { supabase } from '../../lib/supabase';
import { useAppState } from '../../state/AppStateContext';
import { ReviewPhotoRow } from '../../components/ReviewPhotoRow';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';
import { formatDday, formatPrice, formatRelative } from '../../lib/format';

type Props = NativeStackScreenProps<HomeStackParamList, 'GroupBuyDetail'>;

interface MyParticipation {
  qty: number;
  installDate: string | null;
  paid: boolean;
}

interface InstallReview {
  id: string;
  rating: number;
  body: string | null;
  photos: string[];
  createdAt: string;
  groupbuyTitle: string;
}

interface Participant {
  id: string;
  userId: string;
  name: string;
  qty: number;
  installDate: string | null;
}

export function GroupBuyDetailScreen({ route, navigation }: Props) {
  const { apartmentId } = useAppState();
  const { groupBuy, loading, error, refresh } = useGroupBuy(route.params.groupBuyId);
  const [qty, setQty] = useState(1);
  const [scheduleIdx, setScheduleIdx] = useState(0);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [openingChat, setOpeningChat] = useState(false);
  const [myParticipation, setMyParticipation] = useState<MyParticipation | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [wishlisted, setWishlisted] = useState(false);
  const [following, setFollowing] = useState(false);
  const [installReviews, setInstallReviews] = useState<InstallReview[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

  useEffect(() => {
    if (!apartmentId || groupBuy?.type !== 'install') return;
    let cancelled = false;
    supabase
      .from('reviews')
      .select('id, rating, body, photos, created_at, groupbuys!inner(title, apartment_id, type)')
      .eq('groupbuys.apartment_id', apartmentId)
      .eq('groupbuys.type', 'install')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (cancelled) return;
        setInstallReviews(
          (data ?? []).map((r: any) => ({
            id: r.id,
            rating: r.rating,
            body: r.body,
            photos: r.photos ?? [],
            createdAt: r.created_at,
            groupbuyTitle: Array.isArray(r.groupbuys) ? r.groupbuys[0]?.title : r.groupbuys?.title,
          }))
        );
      });
    return () => {
      cancelled = true;
    };
  }, [apartmentId, groupBuy?.type]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!myUserId || !groupBuy || myUserId === groupBuy?.leader?.id) return;
    let cancelled = false;
    supabase
      .from('leader_follows')
      .select('follower_id')
      .eq('follower_id', myUserId)
      .eq('leader_id', groupBuy?.leader?.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setFollowing(!!data);
      });
    return () => {
      cancelled = true;
    };
  }, [myUserId, groupBuy?.leader?.id]);

  const toggleFollow = async () => {
    if (!myUserId || !groupBuy) return;
    if (following) {
      setFollowing(false);
      await supabase.from('leader_follows').delete().eq('follower_id', myUserId).eq('leader_id', groupBuy?.leader?.id);
    } else {
      setFollowing(true);
      await supabase.from('leader_follows').insert({ follower_id: myUserId, leader_id: groupBuy?.leader?.id });
    }
  };

  useFocusEffect(
    useCallback(() => {
      refresh();
      if (!myUserId) return;
      let cancelled = false;

      supabase
        .from('participations')
        .select('qty, install_date, paid')
        .eq('groupbuy_id', route.params.groupBuyId)
        .eq('user_id', myUserId)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) {
            setMyParticipation(data ? { qty: data.qty, installDate: data.install_date, paid: data.paid } : null);
          }
        });
      supabase
        .from('wishlists')
        .select('user_id')
        .eq('groupbuy_id', route.params.groupBuyId)
        .eq('user_id', myUserId)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setWishlisted(!!data);
        });

      // 참여자 목록 조회
      supabase
        .from('participations')
        .select('id, user_id, qty, install_date')
        .eq('groupbuy_id', route.params.groupBuyId)
        .then(async ({ data: participationRows }) => {
          if (!cancelled && participationRows) {
            const userIds = [...new Set(participationRows.map(p => p.user_id))];
            const { data: profileRows } = await supabase
              .from('profiles')
              .select('id, name')
              .in('id', userIds);

            const profileMap = new Map((profileRows ?? []).map(p => [p.id, p]));
            const participantList = participationRows.map(p => ({
              id: p.id,
              userId: p.user_id,
              name: profileMap.get(p.user_id)?.name || '이웃',
              qty: p.qty,
              installDate: p.install_date,
            }));
            if (!cancelled) setParticipants(participantList);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [myUserId, route.params.groupBuyId, refresh])
  );

  const toggleWishlist = async () => {
    if (!myUserId) return;
    if (wishlisted) {
      setWishlisted(false);
      await supabase.from('wishlists').delete().eq('user_id', myUserId).eq('groupbuy_id', route.params.groupBuyId);
    } else {
      setWishlisted(true);
      await supabase.from('wishlists').insert({ user_id: myUserId, groupbuy_id: route.params.groupBuyId });
    }
  };

  const handleJoin = async () => {
    if (!groupBuy || !myUserId || joining) return;
    setJoining(true);
    setJoinError(null);

    const { data: existingPm } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('user_id', myUserId)
      .limit(1)
      .maybeSingle();
    if (!existingPm) {
      await supabase.from('payment_methods').insert({ user_id: myUserId, label: '테스트카드 •••• 1234' });
    }

    const installDate =
      groupBuy.type === 'install' && groupBuy.installDates?.[scheduleIdx]
        ? new Date(groupBuy.installDates[scheduleIdx]).toISOString()
        : null;

    const { error: joinErr } = await supabase.from('participations').insert({
      groupbuy_id: groupBuy.id,
      user_id: myUserId,
      qty: groupBuy.type === 'delivery' ? qty : 1,
      install_date: installDate,
    });

    setJoining(false);
    if (joinErr) {
      setJoinError(joinErr.message);
      return;
    }

    // 공구대장에게 알람 전송
    const { data: myProfile } = await supabase.from('profiles').select('name').eq('id', myUserId).maybeSingle();
    await supabase.from('notifications').insert({
      user_id: groupBuy?.leader?.id,
      type: 'group_buy_participation',
      payload: {
        groupbuy_id: groupBuy.id,
        groupbuy_title: groupBuy.title,
        participant_name: myProfile?.name || '이웃',
        participant_count: groupBuy.participantCount + 1,
        target_count: groupBuy.targetCount,
      },
      read: false,
    });

    setMyParticipation({ qty, installDate, paid: false });
    refresh();
  };

  const handleLeave = async () => {
    if (!groupBuy || !myUserId || joining) return;
    setJoining(true);
    const { error } = await supabase
      .from('participations')
      .delete()
      .eq('groupbuy_id', groupBuy.id)
      .eq('user_id', myUserId);
    setJoining(false);
    if (error) {
      setJoinError(error.message);
      return;
    }
    setMyParticipation(null);
    refresh();
  };

  const [bumping, setBumping] = useState(false);
  const isBumpedRecently =
    !!groupBuy?.bumpedAt && Date.now() - new Date(groupBuy.bumpedAt).getTime() < 24 * 60 * 60 * 1000;

  const handleBump = async () => {
    if (!groupBuy || bumping || isBumpedRecently) return;
    setBumping(true);
    await supabase.from('groupbuys').update({ bumped_at: new Date().toISOString() }).eq('id', groupBuy.id);
    setBumping(false);
    refresh();
  };

  const handleChatWithLeader = async () => {
    if (!groupBuy || openingChat) return;
    setOpeningChat(true);
    console.log('handleChatWithLeader called with:', {
      groupBuyId: groupBuy.id,
      leaderId: groupBuy?.leader?.id,
      groupBuyObject: groupBuy,
    });
    const { data: roomId, error: rpcError } = await supabase.rpc('create_or_get_chat_room', {
      peer_id: groupBuy?.leader?.id,
      gb_id: groupBuy.id,
    });
    setOpeningChat(false);
    if (rpcError || !roomId) return;
    (navigation as any).getParent()?.navigate('채팅', { screen: 'ChatRoom', params: { roomId } });
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

  const discountPct = groupBuy.marketPrice && groupBuy.marketPrice > 0
    ? Math.round((1 - groupBuy.groupPrice / groupBuy.marketPrice) * 100)
    : 0;
  const progress = Math.min(groupBuy.participantCount / groupBuy.targetCount, 1);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        {myUserId !== groupBuy?.leader?.id && (
          <Pressable onPress={toggleWishlist} hitSlop={8}>
            <Text style={styles.wishlistIcon}>{wishlisted ? '♥' : '♡'}</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {groupBuy.photoUrl ? (
          <Image source={{ uri: groupBuy.photoUrl }} style={styles.hero} />
        ) : (
          <View style={styles.hero} />
        )}

        <View style={styles.badgeRow}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{groupBuy.category}</Text>
          </View>
          <View style={styles.ddayBadge}>
            <Text style={styles.ddayText}>{formatDday(groupBuy.deadline)}</Text>
          </View>
        </View>

        <Text style={styles.title}>{groupBuy.title}</Text>

        <View style={styles.priceRow}>
          <Text style={styles.groupPrice}>{formatPrice(groupBuy.groupPrice)}</Text>
          <Text style={styles.marketPrice}>{formatPrice(groupBuy.marketPrice)}</Text>
          <Text style={styles.discount}>{discountPct}%↓</Text>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.participantText}>
          {groupBuy.participantCount}/{groupBuy.targetCount}명 참여 중
        </Text>

        <View style={styles.leaderCard}>
          <Pressable style={styles.leaderCardTouchable} onPress={() => navigation.push('LeaderStore', { leaderId: groupBuy?.leader?.id })}>
            <View style={styles.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.leaderName}>{groupBuy?.leader?.name} · 공구대장</Text>
              <Text style={styles.leaderSub}>
                {groupBuy?.leader?.apartmentLabel} · 진행 {groupBuy?.leader?.groupBuyCount}회 · ★
                {groupBuy?.leader?.rating.toFixed(1)}
              </Text>
            </View>
          </Pressable>
          {myUserId !== groupBuy?.leader?.id && (
            <Pressable style={[styles.followBtn, following && styles.followBtnActive]} onPress={toggleFollow}>
              <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
                {following ? '팔로잉' : '+ 팔로우'}
              </Text>
            </Pressable>
          )}
        </View>

        {groupBuy.type === 'delivery' ? (
          <View style={styles.section}>
            <Row label="수령 장소" value={groupBuy.pickupPlace ?? '-'} />
            <Row label="수령 일시" value={groupBuy.pickupTime ?? '-'} />
            <View style={styles.stepperRow}>
              <Text style={styles.sectionLabel}>수량</Text>
              <View style={styles.stepper}>
                <Pressable
                  style={styles.stepperBtn}
                  onPress={() => setQty((q) => Math.max(1, q - 1))}
                >
                  <Text style={styles.stepperBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepperValue}>{qty}</Text>
                <Pressable
                  style={styles.stepperBtn}
                  onPress={() => setQty((q) => Math.min(5, q + 1))}
                >
                  <Text style={styles.stepperBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>시공 가능 일정 선택</Text>
            <Text style={styles.noteText}>
              평형 기준 표준 견적이며, 실측 후 최종 확정됩니다.
            </Text>
            <View style={styles.dateRow}>
              {groupBuy.installDates?.map((d, i) => {
                const active = i === scheduleIdx;
                return (
                  <Pressable
                    key={d}
                    style={[styles.dateChip, active && styles.dateChipActive]}
                    onPress={() => setScheduleIdx(i)}
                  >
                    <Text style={[styles.dateChipText, active && styles.dateChipTextActive]}>
                      {d}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {groupBuy.description && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>상세 설명</Text>
            <Text style={styles.description}>{groupBuy.description}</Text>
          </View>
        )}

        {groupBuy.type === 'install' && installReviews.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>우리 단지 시공 후기</Text>
            {installReviews.map((r) => (
              <View key={r.id} style={styles.installReviewRow}>
                <Text style={styles.installReviewTitle}>{r.groupbuyTitle}</Text>
                <Text style={styles.stars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                {r.body && <Text style={styles.installReviewBody}>{r.body}</Text>}
                <ReviewPhotoRow photos={r.photos} />
                <Text style={styles.installReviewTime}>{formatRelative(r.createdAt)}</Text>
              </View>
            ))}
          </View>
        )}

        {participants.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>참여자 목록</Text>
            {participants.map((p) => (
              <View key={p.id} style={styles.participantRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.participantName}>{p.name}</Text>
                  {p.qty > 0 && <Text style={styles.participantQty}>수량: {p.qty}개</Text>}
                  {p.installDate && <Text style={styles.participantQty}>일정: {new Date(p.installDate).toLocaleDateString('ko-KR')}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {joinError && <Text style={styles.errorText}>{joinError}</Text>}
      </ScrollView>

      <View style={styles.ctaBar}>
        {myUserId !== groupBuy?.leader?.id && (
          <Pressable style={styles.chatBtn} onPress={handleChatWithLeader} disabled={openingChat}>
            <Text style={styles.chatBtnText}>💬</Text>
          </Pressable>
        )}
        {myUserId === groupBuy?.leader?.id ? (
          groupBuy.status === 'open' && groupBuy.participantCount < groupBuy.targetCount ? (
            <Pressable
              style={[styles.primaryCta, (bumping || isBumpedRecently) && styles.primaryCtaDisabled]}
              onPress={handleBump}
              disabled={bumping || isBumpedRecently}
            >
              <Text style={styles.primaryCtaText}>
                {isBumpedRecently ? '🔥 끌어올림 (24시간 후 재사용)' : bumping ? '끌어올리는 중...' : '🔥 끌어올리기'}
              </Text>
            </Pressable>
          ) : (
            <View style={[styles.primaryCta, styles.primaryCtaDisabled]}>
              <Text style={styles.primaryCtaText}>내가 개설한 공구예요</Text>
            </View>
          )
        ) : myParticipation ? (
          <Pressable style={styles.primaryCta} onPress={handleLeave} disabled={joining}>
            <Text style={styles.primaryCtaText}>{joining ? '취소 처리 중...' : '참여 취소'}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primaryCta} onPress={handleJoin} disabled={joining}>
            <Text style={styles.primaryCtaText}>
              {joining ? '참여 처리 중...' : groupBuy.type === 'delivery' ? '수량 선택하고 참여하기' : '일정 선택하고 참여하기'}
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
  },
  back: { fontSize: 28, color: colors.textPrimary },
  wishlistIcon: { fontSize: 28, color: colors.danger },
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
  leaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  leaderCardTouchable: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.fillSubtle },
  leaderName: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  leaderSub: { fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 },
  followBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  followBtnActive: { backgroundColor: colors.primary },
  followBtnText: { fontSize: fontSize.base, color: colors.primary, fontWeight: fontWeight.semibold },
  followBtnTextActive: { color: colors.white },
  section: { gap: spacing.xs, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md },
  sectionLabel: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowValue: { fontSize: fontSize.md, color: colors.textPrimary, fontWeight: fontWeight.medium },
  stepperRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperBtn: {
    width: minTouchSize,
    height: minTouchSize,
    borderRadius: radius.sm,
    backgroundColor: colors.fillSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { fontSize: fontSize.title, color: colors.textPrimary },
  stepperValue: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, minWidth: 24, textAlign: 'center' },
  noteText: { fontSize: fontSize.base, color: colors.textTertiary },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 4 },
  dateChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.fillSubtle,
  },
  dateChipActive: { backgroundColor: colors.primary },
  dateChipText: { fontSize: fontSize.md, color: colors.textSecondary },
  dateChipTextActive: { color: colors.white, fontWeight: fontWeight.semibold },
  description: { fontSize: fontSize.lg, color: colors.textPrimary, lineHeight: 20 },
  installReviewRow: { paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.divider, gap: 2 },
  installReviewTitle: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.textPrimary },
  stars: { fontSize: fontSize.md, color: colors.amber },
  installReviewBody: { fontSize: fontSize.md, color: colors.textSecondary },
  installReviewTime: { fontSize: fontSize.base, color: colors.textTertiary, marginTop: 2 },
  participantRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  participantName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  participantQty: { fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 },
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
  primaryCta: {
    flex: 1,
    height: minTouchSize,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaText: { color: colors.white, fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
  primaryCtaDisabled: { backgroundColor: colors.textDisabled },
});
