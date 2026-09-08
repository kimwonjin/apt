import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { ProductsStackParamList } from '../../navigation/types';
import { useAppState } from '../../state/AppStateContext';
import { supabase } from '../../lib/supabase';
import { formatPrice } from '../../lib/format';
import { GroupBuyCategory, GroupBuyType, PriceTier } from '../../types/domain';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing, minTouchSize } from '../../theme';

type Props = NativeStackScreenProps<ProductsStackParamList, 'ProductDetail'>;

interface ProductDetail {
  id: string;
  sellerId: string;
  type: GroupBuyType;
  category: GroupBuyCategory;
  title: string;
  photos: string[];
  priceTiers: PriceTier[];
  sellerName: string;
  sellerRating: number;
}

export function ProductDetailScreen({ route, navigation }: Props) {
  const { productId } = route.params;
  const { role } = useAppState();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [wishlisting, setWishlisting] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!cancelled) setMyUserId(user?.id ?? null);

        const { data: row } = await supabase
          .from('products')
          .select('id, seller_id, type, category, title, photos, price_tiers')
          .eq('id', productId)
          .maybeSingle();

        if (cancelled || !row) {
          setLoading(false);
          return;
        }

        const { data: seller } = await supabase
          .from('seller_profiles')
          .select('business_name, rating')
          .eq('user_id', row.seller_id)
          .maybeSingle();

        if (cancelled) return;
        setProduct({
          id: row.id,
          sellerId: row.seller_id,
          type: row.type,
          category: row.category,
          title: row.title,
          photos: row.photos ?? [],
          priceTiers: row.price_tiers ?? [],
          sellerName: seller?.business_name || '판매자',
          sellerRating: seller?.rating ?? 0,
        });

        // 찜 여부 확인
        if (user) {
          const { data: wishlist } = await supabase
            .from('wishlists')
            .select('id')
            .eq('user_id', user.id)
            .eq('product_id', productId)
            .maybeSingle();
          if (!cancelled) setIsWishlisted(!!wishlist);
        }

        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [productId])
  );

  const handleContact = async () => {
    if (!product || !myUserId || myUserId === product.sellerId) return;
    const { data: roomId, error } = await supabase.rpc('create_or_get_chat_room', { peer_id: product.sellerId });
    if (error || !roomId) return;
    (navigation as any).getParent()?.navigate('채팅', { screen: 'ChatRoom', params: { roomId, productId: product.id } });
  };

  const handleDelete = async () => {
    if (!product || deleting) return;
    setDeleting(true);
    setMenuOpen(false);
    const { error } = await supabase.from('products').delete().eq('id', product.id);
    setDeleting(false);
    if (!error) {
      navigation.goBack();
    }
  };

  const handleToggleWishlist = async () => {
    if (!product || !myUserId || wishlisting) return;
    setWishlisting(true);
    setMenuOpen(false);

    if (isWishlisted) {
      await supabase.from('wishlists').delete().eq('user_id', myUserId).eq('product_id', product.id);
    } else {
      await supabase.from('wishlists').insert({ user_id: myUserId, product_id: product.id });
    }

    setIsWishlisted(!isWishlisted);
    setWishlisting(false);
  };

  const basePrice = product?.priceTiers.find((t) => t.minQty <= 1)?.unitPrice ?? product?.priceTiers[0]?.unitPrice ?? 0;
  const isOwner = !!product && myUserId === product.sellerId;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>상품 상세</Text>
        {isOwner || myUserId ? (
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={8}>
            <Text style={styles.menuIcon}>⋮</Text>
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      {loading || !product ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {product.photos.length > 0 ? (
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                style={styles.photoStrip}
              >
                {product.photos.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={styles.photo} />
                ))}
              </ScrollView>
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder]} />
            )}

            <View style={styles.section}>
              <View style={styles.badgeRow}>
                <View style={styles.typeTag}>
                  <Text style={styles.typeTagText}>{product.type === 'delivery' ? '배송형' : '시공형'}</Text>
                </View>
                <View style={styles.categoryTag}>
                  <Text style={styles.categoryTagText}>{product.category}</Text>
                </View>
              </View>
              <Text style={styles.title}>{product.title}</Text>
              <Text style={styles.basePrice}>개당 {formatPrice(basePrice)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>수량별 가격</Text>
              {product.priceTiers.length === 0 ? (
                <Text style={styles.emptyText}>등록된 가격 정보가 없어요.</Text>
              ) : (
                product.priceTiers
                  .slice()
                  .sort((a, b) => a.minQty - b.minQty)
                  .map((tier, i) => {
                    const discount = basePrice > 0 ? Math.round((1 - tier.unitPrice / basePrice) * 100) : 0;
                    return (
                      <View key={i} style={styles.tierRow}>
                        <Text style={styles.tierQty}>{tier.minQty}개 이상</Text>
                        <View style={styles.tierRight}>
                          <Text style={styles.tierPrice}>개당 {formatPrice(tier.unitPrice)}</Text>
                          {discount > 0 && <Text style={styles.tierDiscount}>{discount}% 할인</Text>}
                        </View>
                      </View>
                    );
                  })
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>판매자</Text>
              <Text style={styles.sellerName}>
                {product.sellerName} · ★{product.sellerRating.toFixed(1)}
              </Text>
            </View>
          </ScrollView>

          {!isOwner && (
            <View style={styles.ctaBar}>
              <Pressable style={styles.cta} onPress={handleContact}>
                <Text style={styles.ctaText}>{role === '공구대장' ? '컨택하기' : '공구 요청하기'}</Text>
              </Pressable>
            </View>
          )}

          <Modal visible={menuOpen} transparent animationType="fade">
            <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)} />
            <View style={styles.menuContainer}>
              {isOwner && (
                <>
                  <Pressable
                    style={styles.menuItem}
                    onPress={() => {
                      setMenuOpen(false);
                      (navigation as any).navigate('ProductEdit', { productId: product.id });
                    }}
                  >
                    <Text style={styles.menuItemText}>수정</Text>
                  </Pressable>
                  <Pressable style={styles.menuItem} onPress={handleDelete} disabled={deleting}>
                    <Text style={[styles.menuItemText, styles.menuItemDanger]}>{deleting ? '삭제 중...' : '삭제'}</Text>
                  </Pressable>
                </>
              )}
              {!isOwner && (
                <Pressable style={styles.menuItem} onPress={handleToggleWishlist} disabled={wishlisting}>
                  <Text style={styles.menuItemText}>{wishlisting ? '처리 중...' : (isWishlisted ? '찜 취소' : '찜하기')}</Text>
                </Pressable>
              )}
            </View>
          </Modal>
        </>
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
  menuIcon: { fontSize: 24, color: colors.textPrimary },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  menuContainer: { position: 'absolute', top: 56, right: screenPadding, backgroundColor: colors.card, borderRadius: radius.lg, minWidth: 120, overflow: 'hidden' },
  menuItem: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: minTouchSize, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.divider },
  menuItemText: { fontSize: fontSize.md, color: colors.textPrimary, fontWeight: fontWeight.medium },
  menuItemDanger: { color: colors.danger },
  scrollContent: { paddingBottom: spacing.xl },
  photoStrip: { height: 280 },
  photo: { width: 400, height: 280, backgroundColor: colors.fillSubtle },
  photoPlaceholder: { width: '100%', alignSelf: 'stretch' },
  section: { paddingHorizontal: screenPadding, paddingVertical: spacing.md, gap: spacing.xs },
  badgeRow: { flexDirection: 'row', gap: spacing.xs },
  typeTag: { alignSelf: 'flex-start', backgroundColor: colors.successLight, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  typeTagText: { color: colors.success, fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  categoryTag: { alignSelf: 'flex-start', backgroundColor: colors.fillSubtle, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  categoryTagText: { color: colors.textSecondary, fontSize: fontSize.base, fontWeight: fontWeight.medium },
  title: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.textPrimary, marginTop: 4 },
  basePrice: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.primary },
  divider: { height: 8, backgroundColor: colors.fillSubtle },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing.xs },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary },
  tierRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tierQty: { fontSize: fontSize.md, color: colors.textPrimary, fontWeight: fontWeight.medium },
  tierRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tierPrice: { fontSize: fontSize.md, color: colors.textPrimary, fontWeight: fontWeight.semibold },
  tierDiscount: { fontSize: fontSize.base, color: colors.danger, fontWeight: fontWeight.semibold },
  sellerName: { fontSize: fontSize.md, color: colors.textSecondary },
  ctaBar: { paddingHorizontal: screenPadding, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.card },
  cta: { height: 48, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: colors.white, fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
});
