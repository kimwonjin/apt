import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { CommunityStackParamList } from '../../navigation/types';
import { useCommunityPosts } from '../../hooks/useCommunityPosts';
import { AppHeader } from '../../components/AppHeader';
import { CommunityPostItem } from '../../components/CommunityPostItem';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';
import { formatRelative } from '../../lib/format';

type Props = NativeStackScreenProps<CommunityStackParamList, 'CommunityFeed'>;

const CATEGORIES = ['전체', '동네소식', '나눔', '질문', '공구요청', '중고거래'] as const;
const CATEGORY_EMOJI: Record<string, string> = {
  전체: '📋',
  동네소식: '📰',
  나눔: '🎁',
  질문: '❓',
  공구요청: '🔧',
  중고거래: '💰',
};

export function CommunityScreen({ navigation }: Props) {
  const { posts, loading, error, refresh } = useCommunityPosts();
  const [selectedCategory, setSelectedCategory] = useState<typeof CATEGORIES[number]>('전체');
  const [searchText, setSearchText] = useState('');

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const filteredPosts = (selectedCategory === '전체'
    ? posts
    : posts.filter(p => p.category === selectedCategory)
  ).filter(p =>
    p.title.toLowerCase().includes(searchText.toLowerCase()) ||
    p.preview.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="커뮤니티" />

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="검색"
          placeholderTextColor={colors.textDisabled}
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      <View style={styles.categoryBar}>
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            style={[styles.categoryTab, selectedCategory === cat && styles.categoryTabActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={styles.categoryTabEmoji}>{CATEGORY_EMOJI[cat]}</Text>
            <Text style={[styles.categoryTabText, selectedCategory === cat && styles.categoryTabTextActive]}>
              {cat}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>불러오지 못했어요: {error}</Text>
        </View>
      ) : filteredPosts.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>아직 게시글이 없어요.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPosts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.listContent}
          refreshing={loading}
          onRefresh={refresh}
          renderItem={({ item }) => (
            <CommunityPostItem
              post={item}
              onPress={() => navigation.navigate('CommunityDetail', { postId: item.id })}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      <Pressable style={styles.fab} onPress={() => navigation.navigate('CommunityWrite')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: {
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    height: 40,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.fillSubtle,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  categoryBar: {
    flexDirection: 'row',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.fillSubtle,
  },
  categoryTabActive: { backgroundColor: colors.primary },
  categoryTabEmoji: { fontSize: fontSize.md },
  categoryTabText: { fontSize: fontSize.base, color: colors.textSecondary, fontWeight: fontWeight.medium },
  categoryTabTextActive: { color: colors.white, fontWeight: fontWeight.semibold },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: screenPadding },
  errorText: { fontSize: fontSize.md, color: colors.danger, textAlign: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary },
  listContent: { padding: screenPadding, paddingTop: spacing.xs },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: colors.white, fontSize: 26, fontWeight: fontWeight.bold, marginTop: -2 },
});
