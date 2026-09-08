import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<MyPageStackParamList, 'FollowingLeaders'>;

interface FollowingLeader {
  id: string;
  name: string;
  totalGroupBuys: number;
  avgRating: number;
  reviewCount: number;
}

export function FollowingLeadersScreen({ navigation }: Props) {
  const [leaders, setLeaders] = useState<FollowingLeader[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFollowingLeaders = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // 내가 팔로우한 공구대장 조회
      const { data: follows } = await supabase
        .from('leader_follows')
        .select('leader_id')
        .eq('follower_id', user.id);

      if (!follows || follows.length === 0) {
        setLeaders([]);
        setLoading(false);
        return;
      }

      const leaderIds = follows.map((f) => f.leader_id);

      // 각 공구대장의 정보와 통계 조회
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', leaderIds);

      const { data: statsRows } = await supabase
        .from('leader_stats')
        .select('user_id, total_groupbuys, avg_rating, review_count')
        .in('user_id', leaderIds);

      const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p]));
      const statsMap = new Map((statsRows ?? []).map((s) => [s.user_id, s]));

      const leadersList = leaderIds
        .map((leaderId) => {
          const profile = profileMap.get(leaderId);
          const stats = statsMap.get(leaderId);
          return {
            id: leaderId,
            name: profile?.name || '공구대장',
            totalGroupBuys: stats?.total_groupbuys ?? 0,
            avgRating: stats?.avg_rating ?? 0,
            reviewCount: stats?.review_count ?? 0,
          };
        })
        .sort((a, b) => b.avgRating - a.avgRating);

      setLeaders(leadersList);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFollowingLeaders();
    }, [loadFollowingLeaders])
  );

  const handleUnfollow = async (leaderId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('leader_follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('leader_id', leaderId);

    setLeaders((prev) => prev.filter((l) => l.id !== leaderId));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>팔로우한 공구대장</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : leaders.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>팔로우한 공구대장이 없어요</Text>
        </View>
      ) : (
        <FlatList
          data={leaders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable
                style={styles.cardContent}
                onPress={() => (navigation as any).getParent()?.navigate('홈', { screen: 'GroupBuyDetail', params: { groupBuyId: item.id } })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.leaderName}>{item.name}</Text>
                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{item.totalGroupBuys}</Text>
                      <Text style={styles.statLabel}>공구</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>★{item.avgRating.toFixed(1)}</Text>
                      <Text style={styles.statLabel}>평점</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{item.reviewCount}</Text>
                      <Text style={styles.statLabel}>후기</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
              <Pressable
                style={styles.unfollowBtn}
                onPress={() => handleUnfollow(item.id)}
              >
                <Text style={styles.unfollowText}>언팔로우</Text>
              </Pressable>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
  },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary },
  listContent: { padding: screenPadding, paddingTop: spacing.xs },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  cardContent: { flex: 1 },
  leaderName: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing.xs },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primary },
  statLabel: { fontSize: fontSize.base, color: colors.textSecondary },
  unfollowBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  unfollowText: { fontSize: fontSize.base, color: colors.danger, fontWeight: fontWeight.semibold },
});
