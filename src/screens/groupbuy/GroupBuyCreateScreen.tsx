import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { HomeStackParamList } from '../../navigation/types';
import { useAppState } from '../../state/AppStateContext';
import { supabase } from '../../lib/supabase';
import { pickAndUploadImage } from '../../lib/uploadImage';
import { formatPrice } from '../../lib/format';
import { GroupBuyCategory, GroupBuyType } from '../../types/domain';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'GroupBuyCreate'>;

const CATEGORIES: GroupBuyCategory[] = ['식품', '가구', '가전', '커튼·샤시', '시공'];
const DELIVERY_LABEL: Record<string, string> = {
  per_household: '가구별 배송',
  bulk: '단지 일괄배송',
};

interface Quote {
  id: string;
  headcount: number;
  discountPercent: number;
  perPersonAmount: number;
  deliveryMethod: string;
  sender_name: string;
  sellerBusinessName?: string;
  productName?: string;
  unitPrice?: number;
}

function parseDate(value: string): Date | null {
  if (!value.trim()) return null;
  const d = new Date(`${value.trim()}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function GroupBuyCreateScreen({ navigation }: Props) {
  const { apartmentId } = useAppState();
  const [type, setType] = useState<GroupBuyType>('delivery');
  const [category, setCategory] = useState<GroupBuyCategory>(CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [marketPrice, setMarketPrice] = useState('');
  const [targetCount, setTargetCount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [pickupPlace, setPickupPlace] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [installDatesText, setInstallDatesText] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingQuotes(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setLoadingQuotes(false);
          return;
        }

        // 사용자가 참여하는 room 조회
        const { data: roomData } = await supabase
          .from('chat_participants')
          .select('room_id')
          .eq('user_id', user.id);

        const roomIds = (roomData ?? []).map((r) => r.room_id);
        if (roomIds.length === 0) {
          setQuotes([]);
          setLoadingQuotes(false);
          return;
        }

        // 해당 room의 quote 메시지만 조회
        const { data, error: quoteError } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('type', 'quote')
          .in('room_id', roomIds)
          .order('created_at', { ascending: false });

        console.log('=== Quote Debug ===');
        console.log('User ID:', user.id);
        console.log('Room IDs:', roomIds);
        console.log('Quotes from user rooms:', data?.length);
        console.log('Quote error:', quoteError?.message);
        console.log('Full quote data:', data);
        if (data && data.length > 0) {
          console.log('First quote payload:', data[0].payload);
          console.log('First quote payload status:', data[0].payload?.status);
        }

        // sender 정보 조회
        const senderIds = [...new Set((data ?? []).map((msg: any) => msg.sender_id))];
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', senderIds);

        const profileMap = new Map((profileRows ?? []).map((p: any) => [p.id, p]));

        // 승인된 견적 필터링
        const approved = (data ?? [])
          .filter((msg: any) => msg.payload?.status === 'approved')
          .map((msg: any) => ({
            id: msg.id,
            headcount: msg.payload?.headcount || 0,
            discountPercent: msg.payload?.discountPercent || 0,
            perPersonAmount: msg.payload?.perPersonAmount || 0,
            deliveryMethod: msg.payload?.deliveryMethod || 'per_household',
            sender_name: profileMap.get(msg.sender_id)?.name || '판매자',
            sellerBusinessName: msg.payload?.sellerBusinessName,
            productName: msg.payload?.productName,
            unitPrice: msg.payload?.unitPrice,
          }));

        console.log('Approved quotes:', approved.length);
        console.log('First approved quote:', approved[0]);
        setQuotes(approved);
      } catch (e) {
        console.error('Error loading quotes:', e);
        alert('견적 로드 실패: ' + e);
      } finally {
        setLoadingQuotes(false);
      }
    })();
  }, []);

  const handlePickPhoto = async () => {
    if (uploadingPhoto) return;
    setUploadingPhoto(true);
    const url = await pickAndUploadImage('groupbuys');
    if (url) setPhotoUrl(url);
    setUploadingPhoto(false);
  };

  const handleSelectQuote = (quote: Quote) => {
    setSelectedQuote(quote);
    setPrice(quote.perPersonAmount.toString());
    setTargetCount(quote.headcount.toString());
    setMarketPrice(quote.unitPrice?.toString() || '');
    setQuoteModalOpen(false);
  };

  const handleDeadlineChange = (text: string) => {
    const digits = text.replace(/\D/g, '').substring(0, 8);
    if (digits.length === 8) {
      // 자동 포맷: 20260725 → 2026-07-25
      const formatted = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
      setDeadline(formatted);
    } else {
      setDeadline(digits);
    }
  };

  const deadlineDate = parseDate(deadline);
  const priceNum = Number(price);
  const targetCountNum = Number(targetCount);

  const isValid =
    apartmentId &&
    title.trim().length > 0 &&
    priceNum > 0 &&
    targetCountNum > 0 &&
    deadlineDate !== null &&
    (type === 'delivery' || installDatesText.trim().length > 0);

  const handleSubmit = async () => {
    if (!isValid || !apartmentId || !deadlineDate) return;
    setSubmitting(true);
    setErrorMsg(null);
    console.log('Creating groupbuy with:', {
      title,
      price: priceNum,
      marketPrice: Number(marketPrice) || null,
      targetCount: targetCountNum,
      deadline: deadline,
      deadlineDate: deadlineDate.toISOString(),
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setErrorMsg('로그인 세션이 없습니다. 앱을 다시 시작해주세요.');
      setSubmitting(false);
      return;
    }

    const installDates =
      type === 'install'
        ? installDatesText
            .split(',')
            .map((s) => parseDate(s.trim()))
            .filter((d): d is Date => d !== null)
            .map((d) => d.toISOString())
        : null;

    const { data, error } = await supabase
      .from('groupbuys')
      .insert({
        leader_id: user.id,
        apartment_id: apartmentId,
        type,
        category,
        title: title.trim(),
        description: description.trim() || null,
        photo_url: photoUrl,
        price: priceNum,
        market_price: marketPrice.trim() ? Number(marketPrice) : null,
        target_count: targetCountNum,
        deadline: deadlineDate.toISOString(),
        pickup_place: type === 'delivery' ? pickupPlace.trim() || null : null,
        pickup_time: type === 'delivery' ? pickupTime.trim() || null : null,
        install_dates: installDates,
      })
      .select('id')
      .single();

    console.log('GroupBuy insert result:', { id: data?.id, error: error?.message });

    setSubmitting(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    navigation.replace('GroupBuyDetail', { groupBuyId: data.id });
  };

  if (typeof window !== 'undefined') {
    console.log('GroupBuyCreateScreen rendered, quotes:', quotes.length);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>공구 개설</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {quotes.length > 0 && (
          <Pressable style={[styles.quoteSelectionBox, selectedQuote && styles.quoteSelectionBoxSelected, !selectedQuote && styles.quoteSelectionBoxEmpty]} onPress={() => setQuoteModalOpen(true)}>
            <View style={styles.quoteSelectionHeader}>
              <Text style={styles.quoteLabel}>승인된 견적 선택</Text>
              {selectedQuote && <Text style={styles.quoteCheckmark}>✓</Text>}
            </View>
            {selectedQuote ? (
              <View style={styles.selectedQuoteBox}>
                {selectedQuote.sellerBusinessName && (
                  <Text style={styles.selectedQuoteText}>{selectedQuote.sellerBusinessName}</Text>
                )}
                {selectedQuote.productName && (
                  <Text style={styles.selectedQuoteText}>{selectedQuote.productName}</Text>
                )}
                <Text style={styles.selectedQuoteText}>목표 갯수 {selectedQuote.headcount}개, 구매금액 {formatPrice(selectedQuote.perPersonAmount)}</Text>
              </View>
            ) : (
              <View style={styles.quoteSelectPrompt}>
                <Text style={styles.quoteSelectText}>📋 견적을 선택하면 자동으로 정보가 입력됩니다</Text>
                <Text style={styles.quoteSelectArrow}>›</Text>
              </View>
            )}
          </Pressable>
        )}

        <Field label="대표 사진 (선택)">
          <Pressable style={styles.photoPicker} onPress={handlePickPhoto} disabled={uploadingPhoto}>
            {uploadingPhoto ? (
              <ActivityIndicator color={colors.primary} />
            ) : photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
            ) : (
              <Text style={styles.photoPickerText}>+ 사진 추가</Text>
            )}
          </Pressable>
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

        <Field label="제목">
          <TextInput style={styles.input} placeholder="예) 유기농 김장배추 20kg" placeholderTextColor={colors.textDisabled} value={title} onChangeText={setTitle} />
        </Field>

        <Field label={selectedQuote ? "공구대장 추가 설명" : "상세 설명"}>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder={selectedQuote ? "견적 기반 공구의 추가 설명을 작성해주세요" : "상품/시공 설명을 적어주세요"}
            placeholderTextColor={colors.textDisabled}
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </Field>

        <View style={styles.rowGap}>
          <Field label="공구가(원)" style={{ flex: 1 }}>
            <TextInput style={styles.input} placeholder="15000" placeholderTextColor={colors.textDisabled} value={price} onChangeText={setPrice} keyboardType="number-pad" />
          </Field>
          <Field label="정가(원, 선택)" style={{ flex: 1 }}>
            <TextInput style={styles.input} placeholder="20000" placeholderTextColor={colors.textDisabled} value={marketPrice} onChangeText={setMarketPrice} keyboardType="number-pad" />
          </Field>
        </View>

        <Field label="목표 인원">
          <TextInput style={styles.input} placeholder="10" placeholderTextColor={colors.textDisabled} value={targetCount} onChangeText={setTargetCount} keyboardType="number-pad" />
        </Field>

        <Field label="마감일 (YYYYMMDD 또는 YYYY-MM-DD)">
          <TextInput style={styles.input} placeholder="20260725" placeholderTextColor={colors.textDisabled} value={deadline} onChangeText={handleDeadlineChange} keyboardType="number-pad" />
        </Field>

        {type === 'delivery' ? (
          <>
            <Field label="수령 장소">
              <TextInput style={styles.input} placeholder="관리사무소 앞" placeholderTextColor={colors.textDisabled} value={pickupPlace} onChangeText={setPickupPlace} />
            </Field>
            <Field label="수령 일시">
              <TextInput style={styles.input} placeholder="2026-07-26 오후 6시" placeholderTextColor={colors.textDisabled} value={pickupTime} onChangeText={setPickupTime} />
            </Field>
          </>
        ) : (
          <Field label="시공 가능 일정 (쉼표로 구분, YYYY-MM-DD)">
            <TextInput
              style={styles.input}
              placeholder="2026-07-28, 2026-07-29"
              placeholderTextColor={colors.textDisabled}
              value={installDatesText}
              onChangeText={setInstallDatesText}
            />
          </Field>
        )}

        {selectedQuote && (
          <Field label="견적 내용">
            <View style={styles.quoteContentBox}>
              <View style={styles.quoteContentRow}>
                <Text style={styles.quoteContentLabel}>판매자</Text>
                <Text style={styles.quoteContentValue}>{selectedQuote.sender_name}</Text>
              </View>
              <View style={styles.quoteContentRow}>
                <Text style={styles.quoteContentLabel}>할인율</Text>
                <Text style={styles.quoteContentValue}>{selectedQuote.discountPercent}%</Text>
              </View>
              <View style={styles.quoteContentRow}>
                <Text style={styles.quoteContentLabel}>배송 방법</Text>
                <Text style={styles.quoteContentValue}>{DELIVERY_LABEL[selectedQuote.deliveryMethod]}</Text>
              </View>
            </View>
          </Field>
        )}

        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      </ScrollView>

      <Modal visible={quoteModalOpen} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setQuoteModalOpen(false)} />
        <View style={styles.quoteModal}>
          <Text style={styles.quoteModalTitle}>승인된 견적 선택</Text>
          {loadingQuotes ? (
            <ActivityIndicator color={colors.primary} size="large" />
          ) : quotes.length === 0 ? (
            <Text style={styles.quoteModalEmpty}>승인된 견적이 없어요</Text>
          ) : (
            <View style={styles.quoteList}>
              {quotes.map((quote) => (
                <Pressable key={quote.id} style={[styles.quoteOption, selectedQuote?.id === quote.id && styles.quoteOptionSelected]} onPress={() => handleSelectQuote(quote)}>
                  <View style={styles.quoteOptionRadio}>
                    {selectedQuote?.id === quote.id ? (
                      <View style={styles.quoteOptionRadioFilled} />
                    ) : (
                      <View style={styles.quoteOptionRadioEmpty} />
                    )}
                  </View>
                  <View style={styles.quoteOptionContent}>
                    <Text style={styles.quoteOptionSeller}>{quote.sender_name}</Text>
                    {quote.sellerBusinessName && (
                      <Text style={styles.quoteOptionLabel}>상호명: {quote.sellerBusinessName}</Text>
                    )}
                    {quote.productName && (
                      <Text style={styles.quoteOptionLabel}>상품명: {quote.productName}</Text>
                    )}
                    <Text style={styles.quoteOptionLabel}>견적 내용</Text>
                    <View style={styles.quoteDetails}>
                      {quote.unitPrice && (
                        <View style={styles.quoteDetailRow}>
                          <Text style={styles.quoteDetailLabel}>정가</Text>
                          <Text style={styles.quoteDetailValue}>{formatPrice(quote.unitPrice)}</Text>
                        </View>
                      )}
                      <View style={styles.quoteDetailRow}>
                        <Text style={styles.quoteDetailLabel}>목표 갯수</Text>
                        <Text style={styles.quoteDetailValue}>{quote.headcount}개</Text>
                      </View>
                      <View style={styles.quoteDetailRow}>
                        <Text style={styles.quoteDetailLabel}>구매금액</Text>
                        <Text style={styles.quoteDetailValue}>{formatPrice(quote.perPersonAmount)}</Text>
                      </View>
                      <View style={styles.quoteDetailRow}>
                        <Text style={styles.quoteDetailLabel}>할인율</Text>
                        <Text style={styles.quoteDetailValue}>{quote.discountPercent}%</Text>
                      </View>
                      <View style={styles.quoteDetailRow}>
                        <Text style={styles.quoteDetailLabel}>배송 방법</Text>
                        <Text style={styles.quoteDetailValue}>{DELIVERY_LABEL[quote.deliveryMethod]}</Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </Modal>

      <View style={styles.ctaBar}>
        <Pressable style={[styles.cta, (!isValid || submitting) && styles.ctaDisabled]} disabled={!isValid || submitting} onPress={handleSubmit}>
          <Text style={styles.ctaText}>{submitting ? '개설 중...' : '공구 개설하기'}</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
  },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.textPrimary },
  scrollContent: { paddingHorizontal: screenPadding, paddingBottom: spacing.xl, gap: spacing.md },
  quoteSelectionBox: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  quoteSelectionBoxSelected: { backgroundColor: colors.successLight },
  quoteSelectionBoxEmpty: { borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', backgroundColor: colors.white },
  quoteSelectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quoteLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.success },
  quoteCheckmark: { fontSize: fontSize.lg, color: colors.success, fontWeight: fontWeight.bold },
  quoteSelectPrompt: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  quoteSelectText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.semibold, flex: 1 },
  quoteSelectArrow: { fontSize: fontSize.xl, color: colors.primary, fontWeight: fontWeight.bold },
  selectedQuoteBox: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.sm },
  selectedQuoteText: { fontSize: fontSize.md, color: colors.textPrimary, fontWeight: fontWeight.medium },
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  quoteModal: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '80%', padding: screenPadding },
  quoteModalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing.md },
  quoteModalEmpty: { fontSize: fontSize.md, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.xl },
  quoteList: { gap: spacing.sm },
  quoteOption: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.divider, flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  quoteOptionSelected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primaryLight },
  quoteOptionRadio: { marginTop: 2 },
  quoteOptionRadioEmpty: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.divider },
  quoteOptionRadioFilled: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary },
  quoteOptionContent: { gap: spacing.md, flex: 1 },
  quoteOptionSeller: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  quoteOptionLabel: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.primary, marginTop: spacing.xs },
  quoteDetails: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  quoteDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quoteDetailLabel: { fontSize: fontSize.base, color: colors.textSecondary },
  quoteDetailValue: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  quoteContentBox: { backgroundColor: colors.fillSubtle, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  quoteContentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quoteContentLabel: { fontSize: fontSize.base, color: colors.textSecondary },
  quoteContentValue: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  field: { gap: spacing.xs },
  fieldLabel: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  rowGap: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.fillSubtle,
  },
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
  multiline: { minHeight: 88, paddingTop: spacing.sm, textAlignVertical: 'top' },
  photoPicker: {
    height: 140,
    borderRadius: radius.lg,
    backgroundColor: colors.fillSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPickerText: { fontSize: fontSize.lg, color: colors.textSecondary },
  photoPreview: { width: '100%', height: '100%' },
  errorText: { color: colors.danger, fontSize: fontSize.md },
  ctaBar: {
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.card,
  },
  cta: {
    height: minTouchSize,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: colors.white, fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
});
