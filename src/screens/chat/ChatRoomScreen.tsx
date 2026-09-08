import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChatStackParamList } from '../../navigation/types';
import { useChatMessages } from '../../hooks/useChatMessages';
import { useAppState } from '../../state/AppStateContext';
import { supabase } from '../../lib/supabase';
import { formatPrice } from '../../lib/format';
import { ChatMessage, QuoteDeliveryMethod, QuotePayload } from '../../types/domain';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<ChatStackParamList, 'ChatRoom'>;

const DELIVERY_LABEL: Record<QuoteDeliveryMethod, string> = {
  per_household: '가구별 배송',
  bulk: '단지 일괄배송',
};

interface RoomMeta {
  peerName: string;
  groupBuyTitle: string | null;
  groupBuyId: string | null;
  peerIsSeller: boolean;
  peerLeaderStatus: string;
  peerSellerStatus: string;
}

function useRoomMeta(roomId: string) {
  const [meta, setMeta] = useState<RoomMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: peerRow }, { data: room }] = await Promise.all([
        supabase
          .from('chat_participants')
          .select('user_id')
          .eq('room_id', roomId)
          .neq('user_id', user.id)
          .maybeSingle<{ user_id: string }>(),
        supabase.from('chat_rooms').select('groupbuy_id').eq('id', roomId).maybeSingle(),
      ]);

      if (!peerRow) return;

      // 상대방의 판매자 정보, 주소 정보 조회
      const [{ data: seller, error: sellerError }, { data: residencies, error: residError }, { data: profile, error: profileError }] = await Promise.all([
        supabase.from('seller_profiles').select('business_name').eq('user_id', peerRow.user_id).maybeSingle(),
        supabase
          .from('residencies')
          .select('apartment_id')
          .eq('user_id', peerRow.user_id)
          .eq('verified', true)
          .maybeSingle<{ apartment_id: string }>(),
        supabase.from('profiles').select('name').eq('id', peerRow.user_id).maybeSingle(),
      ]);


      let peerName = '이웃';

      // 판매자인 경우: 이름(상호명)
      if (seller?.business_name && profile?.name) {
        peerName = `${profile.name}(${seller.business_name})`;
      }
      // 구매자/공구대장인 경우: 이름(아파트명)
      else if (residencies?.apartment_id && profile?.name) {
        const { data: apt } = await supabase
          .from('apartments')
          .select('name')
          .eq('id', residencies.apartment_id)
          .maybeSingle();

        if (apt?.name) {
          peerName = `${profile.name}(${apt.name})`;
          } else {
          peerName = profile.name;
        }
      }

      let groupBuyTitle: string | null = null;
      if (room?.groupbuy_id) {
        const { data: gb } = await supabase.from('groupbuys').select('title').eq('id', room.groupbuy_id).maybeSingle();
        groupBuyTitle = gb?.title ?? null;
      }

      // 상대방의 role_applications 조회
      const [{ data: leaderApp, error: leaderAppError }, { data: sellerApp, error: sellerAppError }] = await Promise.all([
        supabase
          .from('role_applications')
          .select('status')
          .eq('user_id', peerRow.user_id)
          .eq('role', 'leader')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('role_applications')
          .select('status')
          .eq('user_id', peerRow.user_id)
          .eq('role', 'seller')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);


      if (!cancelled) {
        setMeta({
          peerName,
          groupBuyTitle,
          groupBuyId: room?.groupbuy_id ?? null,
          peerIsSeller: !!seller?.business_name,
          peerLeaderStatus: leaderApp?.status ?? 'none',
          peerSellerStatus: sellerApp?.status ?? 'none',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  return meta;
}

export function ChatRoomScreen({ route, navigation }: Props) {
  const { roomId, productId } = route.params as { roomId: string; productId?: string };
  const meta = useRoomMeta(roomId);
  const { leaderStatus, sellerStatus } = useAppState();
  const { messages, sendMessage, sendQuote, approveQuote } = useChatMessages(roomId);
  const [draft, setDraft] = useState('');
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSend = async () => {
    const body = draft;
    setDraft('');
    const { error } = await sendMessage(body);
    if (error) setDraft(body);
  };

  const handleLeaveChat = async () => {
    setMenuOpen(false);
    navigation.goBack();
  };

  const filteredMessages = searchText.trim()
    ? messages.filter(
        (m) =>
          m.type === 'text' &&
          m.body.toLowerCase().includes(searchText.toLowerCase())
      )
    : messages;

  const canRequestQuote =
    (leaderStatus === 'approved' && meta?.peerSellerStatus === 'approved') ||
    (sellerStatus === 'approved' && meta?.peerLeaderStatus === 'approved');


  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{meta?.peerName ?? '채팅방'}</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={() => setSearchOpen(!searchOpen)} hitSlop={8}>
            <Text style={styles.headerIcon}>🔍</Text>
          </Pressable>
          <Pressable onPress={() => setMenuOpen(!menuOpen)} hitSlop={8}>
            <Text style={styles.headerIcon}>☰</Text>
          </Pressable>
        </View>
      </View>

      {searchOpen && (
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="메시지 검색..."
            placeholderTextColor={colors.textDisabled}
            value={searchText}
            onChangeText={setSearchText}
            autoFocus
          />
          <Pressable onPress={() => { setSearchOpen(false); setSearchText(''); }} hitSlop={8}>
            <Text style={styles.searchClose}>✕</Text>
          </Pressable>
        </View>
      )}

      {canRequestQuote && (
        <View style={styles.topTab}>
          <Pressable style={styles.tabBtn} onPress={() => setQuoteOpen(true)}>
            <Text style={styles.tabBtnText}>📋 견적요청</Text>
          </Pressable>
        </View>
      )}

      {menuOpen && (
        <>
          <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuPanel}>
            <Pressable style={styles.menuItem} onPress={handleLeaveChat}>
              <Text style={styles.menuItemText}>채팅 종료</Text>
            </Pressable>
          </View>
        </>
      )}

      {meta?.groupBuyTitle && (
        <View style={styles.pinnedBanner}>
          <Text style={styles.pinnedText}>{meta.groupBuyTitle}</Text>
        </View>
      )}

      <FlatList
        data={filteredMessages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messages}
        renderItem={({ item }) =>
          item.type === 'quote' && item.quote ? (
            <QuoteCard message={item} onApprove={() => approveQuote(item.id, item.quote!)} />
          ) : (
            <View style={[styles.bubbleRow, item.isMine && styles.bubbleRowMine]}>
              {!item.isMine && <Text style={styles.senderName}>{item.senderName}</Text>}
              <View style={[styles.bubble, item.isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={item.isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{item.body}</Text>
              </View>
            </View>
          )
        }
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="메시지를 입력하세요"
          placeholderTextColor={colors.textDisabled}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={handleSend}
        />
        <Pressable style={styles.sendBtn} onPress={handleSend} disabled={!draft.trim()}>
          <Text style={styles.sendBtnText}>전송</Text>
        </Pressable>
      </View>

      <QuoteFormModal
        visible={quoteOpen}
        roomId={roomId}
        productId={productId}
        onClose={() => setQuoteOpen(false)}
        onSubmit={async (quote) => {
          await sendQuote(quote);
          setQuoteOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

function QuoteCard({ message, onApprove }: { message: ChatMessage; onApprove: () => void }) {
  const q = message.quote!;
  const approved = q.status === 'approved';
  const validText = new Date(q.validUntil).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
  return (
    <View style={[styles.quoteCard, message.isMine && styles.quoteCardMine]}>
      <View style={styles.quoteCardHeader}>
        <Text style={styles.quoteCardTitle}>견적서</Text>
        <View style={[styles.quoteStatusTag, approved && styles.quoteStatusApproved]}>
          <Text style={[styles.quoteStatusText, approved && styles.quoteStatusTextApproved]}>
            {approved ? '승인됨' : '대기중'}
          </Text>
        </View>
      </View>
      {q.sellerBusinessName && <QuoteRow label="상호명" value={q.sellerBusinessName} />}
      {q.productName && <QuoteRow label="상품명" value={q.productName} />}
      {q.unitPrice && <QuoteRow label="정가" value={formatPrice(q.unitPrice)} />}
      <QuoteRow label="목표 갯수" value={`${q.headcount}개`} />
      <QuoteRow label="할인율" value={`${q.discountPercent}%`} />
      <QuoteRow label="구매금액" value={formatPrice(q.perPersonAmount)} />
      <QuoteRow label="배송 방법" value={DELIVERY_LABEL[q.deliveryMethod]} />
      <QuoteRow label="유효기간" value={`${validText}까지`} />
      {!approved && !message.isMine && (
        <Pressable style={styles.approveBtn} onPress={onApprove}>
          <Text style={styles.approveBtnText}>견적 승인</Text>
        </Pressable>
      )}
      {!approved && message.isMine && <Text style={styles.quoteWaiting}>상대방의 승인을 기다리는 중이에요.</Text>}
    </View>
  );
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.quoteRow}>
      <Text style={styles.quoteRowLabel}>{label}</Text>
      <Text style={styles.quoteRowValue}>{value}</Text>
    </View>
  );
}

function QuoteFormModal({
  visible,
  roomId,
  productId,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  roomId: string;
  productId?: string;
  onClose: () => void;
  onSubmit: (quote: Omit<QuotePayload, 'status'>) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [productName, setProductName] = useState('');
  const [targetQty, setTargetQty] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<QuoteDeliveryMethod>('per_household');
  const [validDays, setValidDays] = useState('7');

  useEffect(() => {
    if (!visible) return;
    (async () => {
      console.log('QuoteFormModal opened, roomId:', roomId, 'productId:', productId);

      // productId가 있으면 직접 product 조회
      if (productId) {
        const { data: product } = await supabase
          .from('products')
          .select('title, seller_id, price_tiers')
          .eq('id', productId)
          .maybeSingle();

        console.log('product from productId:', product);

        if (product) {
          setProductName(product.title);
          const basePrice = (product.price_tiers as any[])?.[0]?.unitPrice;
          if (basePrice) setUnitPrice(basePrice.toString());

          // 상품을 올린 판매자의 상호명 조회
          if (product.seller_id) {
            const { data: seller } = await supabase
              .from('seller_profiles')
              .select('business_name')
              .eq('user_id', product.seller_id)
              .maybeSingle();

            console.log('seller:', seller);

            if (seller?.business_name) {
              setBusinessName(seller.business_name);
            }
          }
        }
        return;
      }

      // productId가 없으면 roomId의 groupbuy 정보 조회
      const { data: room } = await supabase
        .from('chat_rooms')
        .select('groupbuy_id')
        .eq('id', roomId)
        .maybeSingle();

      console.log('room:', room);

      if (room?.groupbuy_id) {
        const { data: groupbuy } = await supabase
          .from('groupbuys')
          .select('product_id')
          .eq('id', room.groupbuy_id)
          .maybeSingle();

        console.log('groupbuy:', groupbuy);

        if (groupbuy?.product_id) {
          const { data: product } = await supabase
            .from('products')
            .select('title, seller_id, price_tiers')
            .eq('id', groupbuy.product_id)
            .maybeSingle();

          console.log('product:', product);

          if (product) {
            setProductName(product.title);
            const basePrice = (product.price_tiers as any[])?.[0]?.unitPrice;
            if (basePrice) setUnitPrice(basePrice.toString());

            // 상품을 올린 판매자의 상호명 조회
            if (product.seller_id) {
              const { data: seller } = await supabase
                .from('seller_profiles')
                .select('business_name')
                .eq('user_id', product.seller_id)
                .maybeSingle();

              console.log('seller:', seller);

              if (seller?.business_name) {
                setBusinessName(seller.business_name);
              }
            }
          }
        }
      }
    })();
  }, [visible, roomId, productId]);

  const reset = () => {
    setProductName('');
    setTargetQty('');
    setUnitPrice('');
    setDiscountPercent('');
    setDeliveryMethod('per_household');
    setValidDays('7');
  };

  const targetQtyNum = Number(targetQty);
  const unitPriceNum = Number(unitPrice);
  const discountNum = Number(discountPercent);
  const daysNum = Number(validDays);
  const targetPrice = unitPriceNum > 0 && discountNum > 0 ? Math.round((unitPriceNum * (100 - discountNum)) / 100) : 0;
  const isValid = businessName.trim().length > 0 && productName.trim().length > 0 && targetQtyNum > 0 && unitPriceNum > 0 && discountNum > 0 && discountNum < 100 && daysNum > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    const validUntil = new Date(Date.now() + daysNum * 24 * 60 * 60 * 1000).toISOString();
    onSubmit({
      headcount: targetQtyNum,
      discountPercent: discountNum,
      perPersonAmount: targetPrice,
      deliveryMethod,
      validUntil,
      sellerBusinessName: businessName.trim(),
      productName: productName.trim(),
      unitPrice: unitPriceNum,
    });
    reset();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContainer}>
          <ScrollView style={styles.modalSheet} contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>견적 요청</Text>

            <Text style={styles.modalLabel}>상호명</Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputReadonly]}
              placeholder="판매자 상호명"
              placeholderTextColor={colors.textDisabled}
              value={businessName}
              onChangeText={setBusinessName}
              editable={false}
            />

            <Text style={styles.modalLabel}>상품명</Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputReadonly]}
              placeholder="판매 상품명"
              placeholderTextColor={colors.textDisabled}
              value={productName}
              onChangeText={setProductName}
              editable={false}
            />

            <Text style={styles.modalLabel}>정가 (원)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="15,000"
              placeholderTextColor={colors.textDisabled}
              value={unitPrice ? Number(unitPrice).toLocaleString('ko-KR') : ''}
              onChangeText={(v) => setUnitPrice(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
            />

            <Text style={styles.modalLabel}>공동구매 목표 갯수</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="10"
              placeholderTextColor={colors.textDisabled}
              value={targetQty ? Number(targetQty).toLocaleString('ko-KR') : ''}
              onChangeText={(v) => setTargetQty(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
            />

            <Text style={styles.modalLabel}>할인율 (%)</Text>
            <TextInput style={styles.modalInput} placeholder="15" placeholderTextColor={colors.textDisabled} value={discountPercent} onChangeText={setDiscountPercent} keyboardType="number-pad" />

            {targetPrice > 0 && (
              <Text style={styles.calculatedPrice}>목표 달성 시 구매금액: {targetPrice.toLocaleString('ko-KR')}원</Text>
            )}

            <Text style={styles.modalLabel}>배송 방법</Text>
            <View style={styles.chipRow}>
              {(['per_household', 'bulk'] as QuoteDeliveryMethod[]).map((m) => (
                <Pressable key={m} style={[styles.chip, deliveryMethod === m && styles.chipActive]} onPress={() => setDeliveryMethod(m)}>
                  <Text style={[styles.chipText, deliveryMethod === m && styles.chipTextActive]}>{DELIVERY_LABEL[m]}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.modalLabel}>견적 유효기간 (일)</Text>
            <TextInput style={styles.modalInput} placeholder="7" placeholderTextColor={colors.textDisabled} value={validDays} onChangeText={setValidDays} keyboardType="number-pad" />
          </ScrollView>

          <View style={styles.modalBtnRow}>
            <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={onClose}>
              <Text style={styles.modalCancelText}>취소</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, styles.modalSubmit, !isValid && styles.modalSubmitDisabled]} disabled={!isValid} onPress={handleSubmit}>
              <Text style={styles.modalSubmitText}>견적 보내기</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  headerRight: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  headerIcon: { fontSize: 20, color: colors.textPrimary },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
    backgroundColor: colors.fillSubtle,
  },
  searchInput: {
    flex: 1,
    height: 36,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.white,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  searchClose: { fontSize: 20, color: colors.textSecondary },
  topTab: {
    flexDirection: 'row',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  tabBtnText: { color: colors.white, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  menuPanel: { position: 'absolute', top: 52, right: screenPadding, backgroundColor: colors.card, borderRadius: radius.md, minWidth: 120, overflow: 'hidden', zIndex: 10 },
  menuItem: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 44, justifyContent: 'center' },
  menuItemText: { fontSize: fontSize.md, color: colors.danger, fontWeight: fontWeight.semibold },
  pinnedBanner: { backgroundColor: colors.fillSubtle, paddingHorizontal: screenPadding, paddingVertical: spacing.xs },
  pinnedText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  messages: { padding: screenPadding, gap: spacing.xs },
  bubbleRow: { flexDirection: 'column', gap: 2 },
  bubbleRowMine: { alignItems: 'flex-end' },
  senderName: { fontSize: fontSize.xs, color: colors.textTertiary, paddingHorizontal: spacing.sm, marginBottom: -2 },
  bubble: { borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 6, alignSelf: 'flex-start' },
  bubbleMine: { backgroundColor: colors.primary, alignSelf: 'flex-end' },
  bubbleTheirs: { backgroundColor: colors.fillSubtle, alignSelf: 'flex-start' },
  bubbleTextMine: { color: colors.white, fontSize: fontSize.lg },
  bubbleTextTheirs: { color: colors.textPrimary, fontSize: fontSize.lg },
  quoteCard: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.md,
    gap: spacing.xs,
  },
  quoteCardMine: { alignSelf: 'flex-end' },
  quoteCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  quoteCardTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  quoteStatusTag: { backgroundColor: colors.fillSubtle, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  quoteStatusApproved: { backgroundColor: colors.successLight },
  quoteStatusText: { fontSize: fontSize.base, color: colors.textSecondary, fontWeight: fontWeight.semibold },
  quoteStatusTextApproved: { color: colors.success },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  quoteRowLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  quoteRowValue: { fontSize: fontSize.md, color: colors.textPrimary, fontWeight: fontWeight.semibold },
  approveBtn: { marginTop: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  approveBtnText: { color: colors.white, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  quoteWaiting: { marginTop: spacing.xs, fontSize: fontSize.base, color: colors.textTertiary, textAlign: 'center' },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  input: {
    flex: 1,
    minHeight: minTouchSize,
    borderRadius: radius.md,
    backgroundColor: colors.fillSubtle,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
  },
  sendBtn: { justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary },
  sendBtnText: { color: colors.white, fontWeight: fontWeight.semibold, fontSize: fontSize.lg },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    flexDirection: 'column',
  },
  modalSheet: {
    flex: 1,
  },
  modalContent: {
    padding: screenPadding,
    gap: spacing.xs,
  },
  modalTitle: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing.sm },
  modalLabel: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium, marginTop: spacing.sm },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: minTouchSize,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
  },
  modalInputReadonly: {
    backgroundColor: colors.fillSubtle,
    color: colors.textSecondary,
  },
  chipRow: { flexDirection: 'row', gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.fillSubtle },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium },
  chipTextActive: { color: colors.white, fontWeight: fontWeight.semibold },
  modalBtnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modalBtn: { flex: 1, height: minTouchSize, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  modalCancel: { backgroundColor: colors.fillSubtle },
  modalCancelText: { color: colors.textSecondary, fontWeight: fontWeight.semibold, fontSize: fontSize.lg },
  modalSubmit: { backgroundColor: colors.primary },
  modalSubmitDisabled: { opacity: 0.4 },
  modalSubmitText: { color: colors.white, fontWeight: fontWeight.semibold, fontSize: fontSize.lg },
  calculatedPrice: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.semibold, textAlign: 'center', marginVertical: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.primaryLight, borderRadius: radius.md, paddingHorizontal: spacing.md },
});
