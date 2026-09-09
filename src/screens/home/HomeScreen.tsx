import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { HomeStackParamList } from '../../navigation/types';
import { useAppState } from '../../state/AppStateContext';
import { useGroupBuys } from '../../hooks/useGroupBuys';
import { GroupBuyCard } from '../../components/GroupBuyCard';
import { AppHeader } from '../../components/AppHeader';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';

const FILTERS = ['전체', '진행중', '마감임박', '성사확정'] as const;
type Filter = (typeof FILTERS)[number];

type Props = NativeStackScreenProps<HomeStackParamList, 'HomeList'>;

export function HomeScreen({ navigation }: Props) {
  const { buildingName } = useAppState();
  const { groupBuys, loading, error, refresh } = useGroupBuys();
  const [filter, setFilter] = useState<Filter>('전체');
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const list = useMemo(() => {
    let result = groupBuys;
    if (filter === '진행중') result = result.filter((g) => g.status === 'open');
    else if (filter === '마감임박') result = result.filter((g) => g.status === 'open' && g.urgent);
    else if (filter === '성사확정') result = result.filter((g) => g.status === 'success');

    const q = query.trim().toLowerCase();
    if (q) result = result.filter((g) => g.title.toLowerCase().includes(q) || g.restaurant.name.toLowerCase().includes(q));
    return result;
  }, [groupBuys, filter, query]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title={`${buildingName || '우리 빌딩'} ✓`} />

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="메뉴·식당 검색"
          placeholderTextColor={colors.textDisabled}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <View style={styles.chipRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(c) => c}
          contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: screenPadding }}
          renderItem={({ item }) => {
            const active = item === filter;
            return (
              <Pressable style={[styles.chip, active && styles.chipActive]} onPress={() => setFilter(item)}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>불러오지 못했어요: {error}</Text>
          <Pressable onPress={refresh} hitSlop={8}>
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : list.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>
            {query.trim() ? '검색 결과가 없어요.' : '아직 모집 중인 공구가 없어요. 직접 만들어보세요!'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.listContent}
          refreshing={loading}
          onRefresh={refresh}
          renderItem={({ item }) => (
            <GroupBuyCard
              groupBuy={item}
              onPress={() => navigation.navigate('GroupBuyDetail', { groupBuyId: item.id })}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      <Pressable style={styles.fab} onPress={() => navigation.navigate('GroupBuyCreate')} hitSlop={8}>
        <Text style={styles.fabText}>+ 공구 만들기</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchWrap: { paddingHorizontal: screenPadding, paddingTop: spacing.xs },
  searchInput: {
    minHeight: 40,
    borderRadius: radius.md,
    backgroundColor: colors.fillSubtle,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  chipRow: { paddingVertical: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.fillSubtle },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium },
  chipTextActive: { color: colors.white, fontWeight: fontWeight.semibold },
  listContent: { padding: screenPadding, paddingTop: spacing.xs },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: screenPadding },
  errorText: { fontSize: fontSize.md, color: colors.danger, textAlign: 'center' },
  retryText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.semibold },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: screenPadding,
    bottom: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabText: { color: colors.white, fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
});
