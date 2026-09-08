import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { formatPrice } from '../../lib/format';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing, minTouchSize } from '../../theme';

const DELIVERY_LABEL: Record<string, string> = {
  per_household: '가구별 배송',
  bulk: '단지 일괄배송',
};

type ReceivedProps = NativeStackScreenProps<MyPageStackParamList, 'ReceivedQuotes'>;
type SentProps = NativeStackScreenProps<MyPageStackParamList, 'SentQuotes'>;
type Props = ReceivedProps | SentProps;

interface QuoteMessage {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  payload: {
    title?: string;
    price?: number;
    description?: string;
  };
  status: 'pending' | 'approved';
  created_at: string;
}

export function ReceivedQuotesScreen({ navigation }: ReceivedProps) {
  return <QuotesListScreen navigation={navigation} type="received" />;
}

export function SentQuotesScreen({ navigation }: SentProps) {
  return <QuotesListScreen navigation={navigation} type="sent" />;
}

function QuotesListScreen({ navigation, type }: { navigation: any; type: 'received' | 'sent' }) {
  const [quotes, setQuotes] = useState<QuoteMessage[]>([]);
  const [loading, setLoading] = useState(true);

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

        try {
          // 사용자가 참여하는 room 조회
          const { data: roomData } = await supabase
            .from('chat_participants')
            .select('room_id')
            .eq('user_id', user.id);

          const roomIds = (roomData ?? []).map((r) => r.room_id);
          if (roomIds.length === 0) {
            setQuotes([]);
            setLoading(false);
            return;
          }

          // 해당 room의 견적만 조회
          const { data, error } = await supabase
            .from('chat_messages')
            .select('id, room_id, sender_id, payload, created_at')
            .eq('type', 'quote')
            .in('room_id', roomIds)
            .order('created_at', { ascending: false });

          if (error) {
            console.error('Quote query error:', error);
            setLoading(false);
            return;
          }

          // sender 정보 조회
          const senderIds = [...new Set((data ?? []).map((msg: any) => msg.sender_id))];
          const { data: profileRows } = await supabase
            .from('profiles')
            .select('id, name')
            .in('id', senderIds);

          const profileMap = new Map((profileRows ?? []).map((p: any) => [p.id, p]));

          // 참여하는 room의 모든 견적 표시 (누가 보냈는지 상관없음)
          setQuotes(
            (data ?? []).map((msg: any) => ({
              id: msg.id,
              room_id: msg.room_id,
              sender_id: msg.sender_id,
              sender_name: profileMap.get(msg.sender_id)?.name || '상대방',
              payload: msg.payload,
              status: msg.payload?.status ?? 'pending',
              created_at: msg.created_at,
            }))
          );
        } catch (e) {
          console.error('Error loading quotes:', e);
        } finally {
          setLoading(false);
        }
      })();
    }, [type])
  );

  const statusLabel = (status: string) => (status === 'approved' ? '승인됨' : '대기중');
  const statusColor = (status: string) => (status === 'approved' ? colors.success : colors.textTertiary);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{type === 'received' ? '받은 견적' : '제시한 견적'}</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={quotes}
          keyExtractor={(q) => q.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>{type === 'received' ? '받은 견적이' : '제시한 견적이'} 없어요.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                  <Text style={styles.seller}>{item.sender_name}</Text>
                  <Text style={[styles.status, { color: statusColor(item.status) }]}>{statusLabel(item.status)}</Text>
                </View>
                <Text style={styles.date}>
                  {new Date(item.created_at).toLocaleDateString('ko-KR', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>

              <View style={styles.specs}>
                {item.payload?.sellerBusinessName && <SpecRow label="상호명" value={item.payload.sellerBusinessName} />}
                {item.payload?.productName && <SpecRow label="상품명" value={item.payload.productName} />}
                {item.payload?.unitPrice && <SpecRow label="정가" value={formatPrice(item.payload.unitPrice)} />}
                <SpecRow label="목표 갯수" value={`${item.payload?.headcount || 0}개`} />
                <SpecRow label="구매금액" value={formatPrice(item.payload?.perPersonAmount || 0)} />
                <SpecRow label="할인율" value={`${item.payload?.discountPercent || 0}%`} />
                <SpecRow label="배송" value={DELIVERY_LABEL[item.payload?.deliveryMethod || 'per_household']} />
              </View>

              <Pressable
                style={styles.chatBtn}
                onPress={() => (navigation as any).getParent()?.navigate('채팅', { screen: 'ChatRoom', params: { roomId: item.room_id } })}
              >
                <Text style={styles.chatBtnText}>채팅</Text>
              </Pressable>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
    </SafeAreaView>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.specRow}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
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
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: colors.divider },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { gap: spacing.xs },
  seller: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  status: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  date: { fontSize: fontSize.base, color: colors.textTertiary },
  specs: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  specLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  specValue: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  chatBtn: { marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radius.md, minHeight: minTouchSize, alignItems: 'center', justifyContent: 'center' },
  chatBtnText: { color: colors.white, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
});
