import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { formatPrice } from '../../lib/format';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<MyPageStackParamList, 'SellerProducts'>;

interface SellerProduct {
  id: string;
  title: string;
  category: string;
  type: string;
  price_tiers: Array<{ minQty: number; unitPrice: number }>;
}

export function SellerProductsScreen({ navigation }: Props) {
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setLoading(false);
          return;
        }

        const { data } = await supabase
          .from('products')
          .select('id, title, category, type, price_tiers')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false });

        setProducts(data ?? []);
        setLoading(false);
      })();
    }, [])
  );

  const handleDelete = async (productId: string) => {
    setDeleting(productId);
    const { error } = await supabase.from('products').delete().eq('id', productId);
    setDeleting(null);
    if (!error) {
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    }
  };

  const basePrice = (product: SellerProduct) => {
    return product.price_tiers?.find((t) => t.minQty <= 1)?.unitPrice ?? product.price_tiers?.[0]?.unitPrice ?? 0;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>등록 상품 관리</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>등록한 상품이 없어요.</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => (navigation as any).getParent()?.navigate('판매상품', { screen: 'ProductDetail', params: { productId: item.id } })}>
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.info}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.category}>{item.category} · {item.type === 'delivery' ? '배송형' : '시공형'}</Text>
                    <Text style={styles.price}>개당 {formatPrice(basePrice(item))}</Text>
                  </View>
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDelete(item.id);
                    }}
                    disabled={deleting === item.id}
                  >
                    {deleting === item.id ? (
                      <ActivityIndicator color={colors.danger} size="small" />
                    ) : (
                      <Text style={styles.deleteBtnText}>삭제</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </Pressable>
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
  listContent: { padding: screenPadding },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  info: { flex: 1, gap: spacing.xs },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  category: { fontSize: fontSize.base, color: colors.textSecondary },
  price: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary, marginTop: 4 },
  deleteBtn: { paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.fillSubtle },
  deleteBtnText: { color: colors.danger, fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
