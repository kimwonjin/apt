import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { attachLeaderBadges, GroupBuyRow } from '../../hooks/groupBuyMapper';
import { GroupBuyCard } from '../../components/GroupBuyCard';
import { GroupBuy } from '../../types/domain';
import { colors, fontSize, fontWeight, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<MyPageStackParamList, 'Wishlist'>;

export function WishlistScreen({ navigation }: Props) {
  const [rows, setRows] = useState<GroupBuy[]>([]);
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
        const { data: wishlistRows } = await supabase
          .from('wishlists')
          .select('groupbuy_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        const ids = (wishlistRows ?? []).map((w) => w.groupbuy_id);
        if (ids.length === 0) {
          if (!cancelled) {
            setRows([]);
            setLoading(false);
          }
          return;
        }

        const { data: groupbuyRows } = await supabase.from('groupbuys').select('*').in('id', ids).returns<GroupBuyRow[]>();
        const withBadges = await attachLeaderBadges(groupbuyRows ?? []);
        // wishlist 저장 순서(최신 찜한 순)를 유지
        const order = new Map(ids.map((id, i) => [id, i]));
        withBadges.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

        if (!cancelled) {
          setRows(withBadges);
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
        <Text style={styles.headerTitle}>찜한 공구</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>찜한 공구가 없어요.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <GroupBuyCard
              groupBuy={item}
              onPress={() => (navigation as any).getParent()?.navigate('홈', { screen: 'GroupBuyDetail', params: { groupBuyId: item.id } })}
            />
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
});
