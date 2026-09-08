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

type Props = NativeStackScreenProps<MyPageStackParamList, 'MyReviews'>;

interface ReviewRow {
  id: string;
  rating: number;
  body: string | null;
  photos: string[];
  created_at: string;
  groupbuyTitle: string;
}

export function MyReviewsScreen({ navigation }: Props) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
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
        const { data } = await supabase
          .from('reviews')
          .select('id, rating, body, photos, created_at, groupbuys(title)')
          .eq('author_id', user.id)
          .order('created_at', { ascending: false });
        if (!cancelled) {
          setRows(
            (data ?? []).map((r: any) => ({
              id: r.id,
              rating: r.rating,
              body: r.body,
              photos: r.photos ?? [],
              created_at: r.created_at,
              groupbuyTitle: Array.isArray(r.groupbuys) ? r.groupbuys[0]?.title : r.groupbuys?.title,
            }))
          );
          setLoading(false);
        }
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
        <Text style={styles.headerTitle}>후기 관리</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>아직 작성한 후기가 없어요.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: screenPadding, paddingVertical: spacing.sm },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary },
  listContent: { padding: screenPadding, paddingTop: spacing.xs },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  stars: { fontSize: fontSize.lg, color: colors.amber },
  body: { fontSize: fontSize.md, color: colors.textSecondary },
  time: { fontSize: fontSize.base, color: colors.textTertiary, marginTop: 2 },
});
