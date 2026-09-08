import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';
import { formatRelative } from '../../lib/format';
import { ReviewPhotoRow } from '../../components/ReviewPhotoRow';

type Props = NativeStackScreenProps<MyPageStackParamList, 'CreditDetail'>;

interface ReviewRow {
  id: string;
  rating: number;
  body: string | null;
  photos: string[];
  created_at: string;
  groupbuyTitle: string;
}

export function CreditDetailScreen({ navigation }: Props) {
  const [stats, setStats] = useState({ totalGroupBuys: 0, avgRating: 0, reviewCount: 0 });
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }

        const [{ data: statRow }, { data: reviewRows }] = await Promise.all([
          supabase.from('leader_stats').select('total_groupbuys, avg_rating, review_count').eq('user_id', user.id).maybeSingle(),
          supabase
            .from('reviews')
            .select('id, rating, body, photos, created_at, groupbuys!inner(title, leader_id)')
            .eq('groupbuys.leader_id', user.id)
            .order('created_at', { ascending: false }),
        ]);

        if (cancelled) return;
        if (statRow) {
          setStats({ totalGroupBuys: statRow.total_groupbuys, avgRating: statRow.avg_rating, reviewCount: statRow.review_count });
        }
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
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>신용도 상세</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.statsRow}>
        <StatCard label="진행한 공구" value={`${stats.totalGroupBuys}회`} />
        <StatCard label="만족도" value={`★${stats.avgRating.toFixed(1)}`} />
        <StatCard label="누적 후기" value={`${stats.reviewCount}개`} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : reviews.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>아직 받은 후기가 없어요.</Text>
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>{item.groupbuyTitle}</Text>
              <Text style={styles.stars}>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</Text>
              {item.body && <Text style={styles.body}>{item.body}</Text>}
              <ReviewPhotoRow photos={item.photos} />
              <Text style={styles.time}>{formatRelative(item.created_at)}</Text>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
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
  statsRow: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: screenPadding, marginBottom: spacing.sm },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: spacing.sm, alignItems: 'center' },
  statValue: { fontSize: fontSize.xxl, fontWeight: fontWeight.heavy, color: colors.primary },
  statLabel: { fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary },
  listContent: { padding: screenPadding, paddingTop: spacing.xs },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  stars: { fontSize: fontSize.lg, color: colors.amber },
  body: { fontSize: fontSize.md, color: colors.textSecondary },
  time: { fontSize: fontSize.base, color: colors.textTertiary, marginTop: 2 },
});
