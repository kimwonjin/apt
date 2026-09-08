import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { ProductsStackParamList } from '../../navigation/types';
import { useAppState } from '../../state/AppStateContext';
import { useProducts } from '../../hooks/useProducts';
import { AppHeader } from '../../components/AppHeader';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';
import { Product } from '../../types/domain';

type Props = NativeStackScreenProps<ProductsStackParamList, 'ProductsList'>;

function ProductCard({ product, navigation }: { product: Product; navigation: Props['navigation'] }) {
  const tierText = product.priceTiers
    .map((t) => `${t.minQty}개↑ 개당 ${t.unitPrice.toLocaleString('ko-KR')}원`)
    .join(' · ');

  return (
    <Pressable style={styles.card} onPress={() => navigation.navigate('ProductDetail', { productId: product.id })}>
      {product.photoUrl ? <Image source={{ uri: product.photoUrl }} style={styles.photo} /> : <View style={styles.photo} />}
      <View style={styles.body}>
        <View style={styles.typeTag}>
          <Text style={styles.typeTagText}>{product.type === 'delivery' ? '배송형' : '시공형'}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {product.title}
        </Text>
        <Text style={styles.tierText} numberOfLines={1}>
          {tierText}
        </Text>
        <Text style={styles.sellerText}>
          {product.sellerName} · ★{product.sellerRating.toFixed(1)}
        </Text>
      </View>
    </Pressable>
  );
}

export function ProductsScreen({ navigation }: Props) {
  const { sellerStatus, refreshRoleApplications } = useAppState();
  const { products, loading, error, refresh } = useProducts();
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      refresh();
      refreshRoleApplications();
    }, [refresh, refreshRoleApplications])
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.title.toLowerCase().includes(q));
  }, [products, query]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="판매상품" />

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="상품 검색"
          placeholderTextColor={colors.textDisabled}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>불러오지 못했어요: {error}</Text>
        </View>
      ) : list.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>{query.trim() ? '검색 결과가 없어요.' : '등록된 상품이 없어요.'}</Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.listContent}
          refreshing={loading}
          onRefresh={refresh}
          renderItem={({ item }) => <ProductCard product={item} navigation={navigation} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      {sellerStatus === 'approved' && (
        <Pressable style={styles.fab} onPress={() => navigation.navigate('ProductCreate')}>
          <Text style={styles.fabText}>+ 상품등록</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchWrap: { paddingHorizontal: screenPadding, paddingBottom: spacing.sm },
  searchInput: {
    minHeight: 40,
    borderRadius: radius.md,
    backgroundColor: colors.fillSubtle,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: screenPadding },
  errorText: { fontSize: fontSize.md, color: colors.danger, textAlign: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary },
  listContent: { padding: screenPadding, paddingTop: spacing.xs },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  photo: { width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.fillSubtle },
  body: { flex: 1, gap: 4 },
  typeTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.successLight,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeTagText: { color: colors.success, fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  tierText: { fontSize: fontSize.md, color: colors.textSecondary },
  sellerText: { fontSize: fontSize.base, color: colors.textTertiary, marginTop: 4 },
  fab: {
    position: 'absolute',
    right: screenPadding,
    bottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: colors.white, fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
});
