import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { HomeStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { ReviewPhotoRow } from '../../components/ReviewPhotoRow';
import { formatPrice, formatRelative } from '../../lib/format';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'LeaderStore'>;

const STATUS_LABEL: Record<string, string> = {
  open: '진행 중',
  closed: '마감',
  success: '성공',
  failed: '실패',
  done: '완료',
};

interface LeaderInfo {
  name: string;
  apartmentLabel: string;
  rating: number;
  groupBuyCount: number;
  reviewCount: number;
}

interface GroupBuyRow {
  id: string;
  title: string;
  price: number;
  participant_count: number;
  target_count: number;
  status: string;
}

interface ReviewRow {
  id: string;
  rating: number;
  body: string | null;
  photos: string[];
  created_at: string;
  groupbuyTitle: string;
}

export function LeaderStoreScreen({ route, navigation }: Props) {
  const { leaderId } = route.params;
  const [info, setInfo] = useState<LeaderInfo | null>(null);
  const [groupBuys, setGroupBuys] = useState<GroupBuyRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!cancelled) setMyUserId(user?.id ?? null);

        const [{ data: badge }, { data: stats }, { data: gbRows }, { data: reviewRows }, followRes] = await Promise.all([
          supabase.rpc('get_leader_badge', { target_user_id: leaderId }).maybeSingle<{
            name: string;
            dong: string;
            rating: number;
            group_buy_count: number;
          }>(),
          supabase.from('leader_stats').select('review_count').eq('user_id', leaderId).maybeSingle(),
          supabase
            .from('groupbuys')
            .select('id, title, price, participant_count, target_count, status')
            .eq('leader_id', leaderId)
            .order('created_at', { ascending: false })
            .returns<GroupBuyRow[]>(),
          supabase
            .from('reviews')
            .select('id, rating, body, photos, created_at, groupbuys!inner(title, leader_id)')
            .eq('groupbuys.leader_id', leaderId)
            .order('created_at', { ascending: false }),
          user && user.id !== leaderId
            ? supabase.from('leader_follows').select('follower_id').eq('follower_id', user.id).eq('leader_id', leaderId).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        if (cancelled) return;
        setInfo({
          name: badge?.name ?? '알 수 없음',
          apartmentLabel: badge ? `${badge.dong}동 이웃` : '',
          rating: badge?.rating ?? 0,
          groupBuyCount: badge?.group_buy_count ?? 0,
          reviewCount: stats?.review_count ?? 0,
        });
        setGroupBuys(gbRows ?? []);
        setReviews(
          (reviewRows ?? []).map((r: any) => ({
            id: r.id,
            rating: r.rating,
            body: r.body,
            photos: r.photos ?? [],
            created_at: r.created_at,
            groupbuyTitle: Array.isArray(r.groupbuys) ? r.groupbuys[0]?.title : r.groupbuys?.title,
          }))
        );
        setFollowing(!!followRes.data);
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [leaderId])
  );

  const toggleFollow = async () => {
    if (!myUserId) return;
    if (following) {
      setFollowing(false);
      await supabase.from('leader_follows').delete().eq('follower_id', myUserId).eq('leader_id', leaderId);
    } else {
      setFollowing(true);
      await supabase.from('leader_follows').insert({ follower_id: myUserId, leader_id: leaderId });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>공구대장 프로필</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading || !info ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.profileRow}>
            <View style={styles.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{info.name} · 공구대장</Text>
              <Text style={styles.sub}>{info.apartmentLabel}</Text>
            </View>
            {myUserId !== leaderId && (
              <Pressable style={[styles.followBtn, following && styles.followBtnActive]} onPress={toggleFollow}>
                <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
                  {following ? '팔로잉' : '+ 팔로우'}
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.statsRow}>
            <StatCard label="진행한 공구" value={`${info.groupBuyCount}회`} />
            <StatCard label="만족도" value={`★${info.rating.toFixed(1)}`} />
            <StatCard label="누적 후기" value={`${info.reviewCount}개`} />
          </View>

          <Text style={styles.sectionTitle}>연 공구 목록</Text>
          <FlatList
            data={groupBuys}
            keyExtractor={(g) => g.id}
            scrollEnabled={false}
            ListEmptyComponent={<Text style={styles.emptyText}>아직 연 공구가 없어요.</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.card} onPress={() => navigation.push('GroupBuyDetail', { groupBuyId: item.id })}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardSub}>
                    {formatPrice(item.price)} · {item.participant_count}/{item.target_count}명
                  </Text>
                </View>
                <Text style={styles.statusBadge}>{STATUS_LABEL[item.status] ?? item.status}</Text>
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          />

          <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>받은 후기</Text>
          {reviews.length === 0 ? (
            <Text style={styles.emptyText}>아직 받은 후기가 없어요.</Text>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={styles.card}>
                <Text style={styles.cardTitle}>{r.groupbuyTitle}</Text>
                <Text style={styles.stars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                {r.body && <Text style={styles.reviewBody}>{r.body}</Text>}
                <ReviewPhotoRow photos={r.photos} />
                <Text style={styles.reviewTime}>{formatRelative(r.created_at)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: screenPadding, paddingVertical: spacing.sm },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: screenPadding, paddingBottom: spacing.xl, gap: spacing.sm },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.fillSubtle },
  name: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.textPrimary },
  sub: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },
  followBtn: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary },
  followBtnActive: { backgroundColor: colors.primary },
  followBtnText: { fontSize: fontSize.base, color: colors.primary, fontWeight: fontWeight.semibold },
  followBtnTextActive: { color: colors.white },
  statsRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: spacing.sm, alignItems: 'center' },
  statValue: { fontSize: fontSize.xxl, fontWeight: fontWeight.heavy, color: colors.primary },
  statLabel: { fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginTop: spacing.sm },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  cardTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  cardSub: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },
  statusBadge: { fontSize: fontSize.base, color: colors.primary, fontWeight: fontWeight.semibold },
  stars: { fontSize: fontSize.md, color: colors.amber },
  reviewBody: { fontSize: fontSize.md, color: colors.textSecondary },
  reviewTime: { fontSize: fontSize.base, color: colors.textTertiary, marginTop: 2 },
});
