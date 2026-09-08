import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { ProductsStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { pickAndUploadMultipleImages } from '../../lib/uploadImage';
import { GroupBuyCategory, GroupBuyType } from '../../types/domain';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

type CreateProps = NativeStackScreenProps<ProductsStackParamList, 'ProductCreate'>;
type EditProps = NativeStackScreenProps<ProductsStackParamList, 'ProductEdit'>;
type Props = CreateProps | EditProps;

const CATEGORIES: GroupBuyCategory[] = ['식품', '가구', '가전', '커튼·샤시', '시공'];

interface DiscountTier {
  minQty: string;
  discountPercent: string;
}

export function ProductCreateScreen({ navigation, route }: Props) {
  const productId = (route.params as any)?.productId;
  const isEditing = !!productId;
  const [loading, setLoading] = useState(isEditing);
  const [businessName, setBusinessName] = useState('');
  const [type, setType] = useState<GroupBuyType>('delivery');
  const [category, setCategory] = useState<GroupBuyCategory>(CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [minQty, setMinQty] = useState('1');
  const [discountTiers, setDiscountTiers] = useState<DiscountTier[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhotoIdx, setUploadingPhotoIdx] = useState<number | null>(null);
  const [currentPhotoIdx, setCurrentPhotoIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data: seller } = await supabase
          .from('seller_profiles')
          .select('business_name')
          .eq('user_id', user.id)
          .maybeSingle();

        setBusinessName(seller?.business_name || '');

        if (!isEditing) {
          setLoading(false);
          return;
        }

        const { data } = await supabase
          .from('products')
          .select('seller_id, title, type, category, photos, price_tiers')
          .eq('id', productId)
          .maybeSingle();

        if (data) {
          setTitle(data.title);
          setType(data.type);
          setCategory(data.category);
          if (data.photos?.length > 0) setPhotoUrls(data.photos);

          const priceTiers = data.price_tiers || [];
          const basePrice = priceTiers.find((t: any) => t.minQty <= 1);
          if (basePrice) {
            setUnitPrice(basePrice.unitPrice.toString());
            setMinQty(basePrice.minQty.toString());
          }

          const extras = priceTiers.filter((t: any) => t.minQty > 1);
          if (extras.length > 0) {
            const baseUnitPrice = basePrice?.unitPrice || 0;
            setDiscountTiers(
              extras.map((t: any) => ({
                minQty: t.minQty.toString(),
                discountPercent: baseUnitPrice > 0 ? ((baseUnitPrice - t.unitPrice) * 100 / baseUnitPrice).toFixed(0) : '0',
              }))
            );
          }
        }
        setLoading(false);
      })();
    }, [productId, isEditing])
  );

  const handlePickPhoto = async () => {
    if (uploadingPhotoIdx !== null || photoUrls.length >= 10) return;
    setUploadingPhotoIdx(photoUrls.length);
    const maxToAdd = 10 - photoUrls.length;
    const urls = await pickAndUploadMultipleImages('products', maxToAdd);
    if (urls.length > 0) setPhotoUrls([...photoUrls, ...urls]);
    setUploadingPhotoIdx(null);
  };

  const handleRemovePhoto = (index: number) => {
    setPhotoUrls(photoUrls.filter((_, i) => i !== index));
  };

  const addDiscountTier = () => setDiscountTiers((prev) => [...prev, { minQty: '', discountPercent: '' }]);
  const removeDiscountTier = (index: number) => setDiscountTiers((prev) => prev.filter((_, i) => i !== index));
  const updateDiscountTier = (index: number, field: keyof DiscountTier, value: string) =>
    setDiscountTiers((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));

  const priceNum = Number(unitPrice);
  const minQtyNum = Number(minQty);
  const isValid = businessName.trim().length > 0 && title.trim().length > 0 && priceNum > 0 && minQtyNum > 0;

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setErrorMsg('로그인 세션이 없습니다.');
      setSubmitting(false);
      return;
    }


    const extraTiers = discountTiers
      .map((t) => ({ minQty: Number(t.minQty), discountPercent: Number(t.discountPercent) }))
      .filter((t) => t.minQty > 0 && t.discountPercent > 0 && t.discountPercent < 100)
      .sort((a, b) => a.minQty - b.minQty)
      .map((t) => ({ minQty: t.minQty, unitPrice: Math.round((priceNum * (100 - t.discountPercent)) / 100) }));

    const priceTiers = [{ minQty: minQtyNum, unitPrice: priceNum }, ...extraTiers];

    if (isEditing) {
      const { error: productError } = await supabase
        .from('products')
        .update({
          title: title.trim(),
          type,
          category,
          photos: photoUrls,
          price_tiers: priceTiers,
        })
        .eq('id', productId);

      setSubmitting(false);
      if (productError) {
        setErrorMsg(productError.message);
        return;
      }
    } else {
      const { error: productError } = await supabase.from('products').insert({
        seller_id: user.id,
        title: title.trim(),
        type,
        category,
        photos: photoUrls,
        price_tiers: priceTiers,
      });

      setSubmitting(false);
      if (productError) {
        setErrorMsg(productError.message);
        return;
      }
    }
    navigation.goBack();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{isEditing ? '상품 수정' : '상품 등록'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
        <View style={{ gap: spacing.xs }}>
          <View style={styles.photoHeaderRow}>
            <Text style={styles.fieldLabel}>상품 사진</Text>
            <Text style={styles.photoCount}>{photoUrls.length}/10</Text>
          </View>

          {photoUrls.length > 0 && (
            <View style={{ gap: spacing.xs }}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / (e.nativeEvent.layoutMeasurement?.width || 1));
                  setCurrentPhotoIdx(idx);
                }}
                style={styles.photoSlideshow}
              >
                {photoUrls.map((url, idx) => (
                  <View key={idx} style={styles.photoSlideshowItem}>
                    <Image source={{ uri: url }} style={styles.photoSlideshowImage} />
                    <Pressable style={styles.photoSlideshowRemoveBtn} onPress={() => handleRemovePhoto(idx)}>
                      <Text style={styles.photoSlideshowRemoveBtnText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.photoPagination}>
                {photoUrls.map((_, idx) => (
                  <View
                    key={idx}
                    style={[styles.paginationDot, idx === currentPhotoIdx && styles.paginationDotActive]}
                  />
                ))}
              </View>
            </View>
          )}

          <View style={styles.photoGrid}>
            {photoUrls.map((url, idx) => (
              <View key={idx} style={[styles.photoGridItemWrapper, idx === 0 && styles.photoGridItemMain]}>
                <View style={styles.photoGridItem}>
                  <Image source={{ uri: url }} style={styles.photoGridImage} />
                  <Pressable style={styles.photoRemoveBtn} onPress={() => handleRemovePhoto(idx)}>
                    <Text style={styles.photoRemoveBtnText}>✕</Text>
                  </Pressable>
                </View>
                {idx === 0 && <Text style={styles.photoThumbLabel}>대표사진</Text>}
              </View>
            ))}
            {photoUrls.length < 10 && (
              <Pressable style={styles.photoAddBtn} onPress={handlePickPhoto} disabled={uploadingPhotoIdx !== null}>
                {uploadingPhotoIdx !== null ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.photoAddBtnText}>+</Text>
                )}
              </Pressable>
            )}
          </View>
        </View>

        <Field label="상점명">
          <TextInput style={[styles.input, styles.inputReadonly]} placeholder="상점명" placeholderTextColor={colors.textDisabled} value={businessName} editable={false} />
        </Field>

        <Field label="유형">
          <View style={styles.row}>
            {(['delivery', 'install'] as GroupBuyType[]).map((t) => (
              <Chip key={t} label={t === 'delivery' ? '배송형' : '시공형'} active={type === t} onPress={() => setType(t)} />
            ))}
          </View>
        </Field>

        <Field label="카테고리">
          <View style={styles.row}>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
            ))}
          </View>
        </Field>

        <Field label="상품명">
          <TextInput style={styles.input} placeholder="예) 암막 커튼 시공" placeholderTextColor={colors.textDisabled} value={title} onChangeText={setTitle} />
        </Field>

        <View style={styles.rowGap}>
          <Field label="개당 정가(원)" style={{ flex: 1 }}>
            <TextInput
              style={styles.input}
              placeholder="15,000"
              placeholderTextColor={colors.textDisabled}
              value={unitPrice ? Number(unitPrice).toLocaleString('ko-KR') : ''}
              onChangeText={(v) => setUnitPrice(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
            />
          </Field>
          <Field label="최소 수량" style={{ flex: 1 }}>
            <TextInput
              style={styles.input}
              placeholder="1"
              placeholderTextColor={colors.textDisabled}
              value={minQty ? Number(minQty).toLocaleString('ko-KR') : ''}
              onChangeText={(v) => setMinQty(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
            />
          </Field>
        </View>

        <Field label="수량별 할인 (선택)">
          <View style={{ gap: spacing.sm }}>
            {discountTiers.map((tier, index) => {
              const computedPrice =
                priceNum > 0 && Number(tier.discountPercent) > 0
                  ? Math.round((priceNum * (100 - Number(tier.discountPercent))) / 100)
                  : null;
              return (
                <View key={index} style={styles.tierRow}>
                  <TextInput
                    style={[styles.input, styles.tierInput]}
                    placeholder="10"
                    placeholderTextColor={colors.textDisabled}
                    value={tier.minQty ? Number(tier.minQty).toLocaleString('ko-KR') : ''}
                    onChangeText={(v) => updateDiscountTier(index, 'minQty', v.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.tierLabel}>개 이상</Text>
                  <TextInput
                    style={[styles.input, styles.tierInput]}
                    placeholder="10"
                    placeholderTextColor={colors.textDisabled}
                    value={tier.discountPercent}
                    onChangeText={(v) => updateDiscountTier(index, 'discountPercent', v.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.tierLabel}>% 할인{computedPrice ? ` · ${computedPrice.toLocaleString('ko-KR')}원` : ''}</Text>
                  <Pressable onPress={() => removeDiscountTier(index)} hitSlop={8}>
                    <Text style={styles.tierRemove}>✕</Text>
                  </Pressable>
                </View>
              );
            })}
            <Pressable style={styles.addTierBtn} onPress={addDiscountTier}>
              <Text style={styles.addTierBtnText}>+ 할인 구간 추가</Text>
            </Pressable>
          </View>
        </Field>

        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      </ScrollView>

      <View style={styles.ctaBar}>
        <Pressable style={[styles.cta, (!isValid || submitting) && styles.ctaDisabled]} disabled={!isValid || submitting} onPress={handleSubmit}>
          <Text style={styles.ctaText}>{submitting ? (isEditing ? '수정 중...' : '등록 중...') : (isEditing ? '수정 완료' : '상품 등록하기')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: screenPadding, paddingVertical: spacing.sm },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  form: { flex: 1 },
  formContent: { paddingHorizontal: screenPadding, gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.md },
  field: { gap: spacing.xs },
  fieldLabel: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  rowGap: { flexDirection: 'row', gap: spacing.sm },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tierInput: { width: 64, paddingHorizontal: spacing.sm },
  tierLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  tierRemove: { fontSize: fontSize.lg, color: colors.textTertiary, paddingHorizontal: spacing.xs },
  addTierBtn: { alignSelf: 'flex-start' },
  addTierBtnText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.semibold },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.fillSubtle },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium },
  chipTextActive: { color: colors.white, fontWeight: fontWeight.semibold },
  input: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: minTouchSize,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
  },
  inputReadonly: { backgroundColor: colors.fillSubtle, color: colors.textSecondary },
  errorText: { color: colors.danger, fontSize: fontSize.md },
  addPhotoBtn: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  addPhotoBtnText: { color: colors.white, fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  photoPreview: { width: '100%', height: 200, borderRadius: radius.lg },
  changePhotoBtn: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  changePhotoBtnText: { color: colors.primary, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  photoHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  photoCount: { fontSize: fontSize.base, color: colors.textSecondary, fontWeight: fontWeight.medium },
  photoSlideshow: { height: 300, marginBottom: spacing.sm },
  photoSlideshowItem: { width: screenPadding * 2 + 320, paddingHorizontal: screenPadding, justifyContent: 'center' },
  photoSlideshowImage: { width: '100%', height: 280, borderRadius: radius.lg, backgroundColor: colors.fillSubtle },
  photoSlideshowRemoveBtn: { position: 'absolute', top: screenPadding + 4, right: screenPadding + 4, width: 36, height: 36, borderRadius: radius.pill, backgroundColor: 'rgba(0, 0, 0, 0.6)', alignItems: 'center', justifyContent: 'center' },
  photoSlideshowRemoveBtnText: { color: colors.white, fontSize: 20, fontWeight: fontWeight.bold },
  photoPagination: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  paginationDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.divider },
  paginationDotActive: { backgroundColor: colors.primary, width: 24 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  photoGridItemWrapper: { width: '32%', gap: 4 },
  photoGridItemMain: { borderWidth: 3, borderColor: colors.primary, borderRadius: radius.md, padding: 4 },
  photoGridItem: { width: '100%', aspectRatio: 1, position: 'relative', borderRadius: radius.md, overflow: 'hidden' },
  photoGridImage: { width: '100%', height: '100%', backgroundColor: colors.fillSubtle },
  photoRemoveBtn: { position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: radius.pill, backgroundColor: 'rgba(0, 0, 0, 0.6)', alignItems: 'center', justifyContent: 'center' },
  photoRemoveBtnText: { color: colors.white, fontSize: 16, fontWeight: fontWeight.bold },
  photoThumbLabel: { fontSize: fontSize.base, color: colors.primary, fontWeight: fontWeight.semibold, textAlign: 'center' },
  photoAddBtn: { width: '32%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.fillSubtle, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.divider, borderStyle: 'dashed' },
  photoAddBtnText: { fontSize: 32, color: colors.primary, fontWeight: fontWeight.bold },
  ctaBar: { paddingHorizontal: screenPadding, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.card },
  cta: { height: minTouchSize, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: colors.white, fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
});
