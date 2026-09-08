import { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ChatMessage, QuotePayload } from '../types/domain';

interface MessageRow {
  id: string;
  room_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  type: 'text' | 'quote';
  payload: QuotePayload | null;
}

interface SenderInfo {
  name: string;
  businessName?: string;
  apartmentName?: string;
}

function buildSenderName(senderInfo: SenderInfo): string {
  if (senderInfo.businessName && senderInfo.name) {
    return `${senderInfo.name}(${senderInfo.businessName})`;
  }
  if (senderInfo.apartmentName && senderInfo.name) {
    return `${senderInfo.name}(${senderInfo.apartmentName})`;
  }
  return senderInfo.name || '이웃';
}

function mapRow(row: MessageRow, myUserId: string | null, senderInfo?: SenderInfo): ChatMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    authorId: row.sender_id,
    senderName: senderInfo ? buildSenderName(senderInfo) : '이웃',
    isMine: row.sender_id === myUserId,
    body: row.body,
    createdAt: row.created_at,
    type: row.type ?? 'text',
    quote: row.type === 'quote' && row.payload ? row.payload : undefined,
  };
}

export function useChatMessages(roomId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const myUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      myUserIdRef.current = user?.id ?? null;

      const { data } = await supabase
        .from('chat_messages')
        .select('id, room_id, sender_id, body, created_at, type, payload')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .returns<MessageRow[]>();

      if (cancelled) return;

      // sender 정보 조회
      const senderIds = [...new Set((data ?? []).map((m) => m.sender_id))];
      const [{ data: profileRows }, { data: sellerRows }, { data: residencyRows }] = await Promise.all([
        supabase.from('profiles').select('id, name').in('id', senderIds),
        supabase.from('seller_profiles').select('user_id, business_name').in('user_id', senderIds),
        supabase.from('residencies').select('user_id, apartment_id').in('user_id', senderIds),
      ]);


      // apartments 조회
      const apartmentIds = [...new Set((residencyRows ?? []).map((r) => r.apartment_id).filter((id): id is string => !!id))];
      const { data: apartmentRows } = await supabase.from('apartments').select('id, name').in('id', apartmentIds);

      if (cancelled) return;

      // senderInfoMap 생성
      const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p]));
      const sellerMap = new Map((sellerRows ?? []).map((s) => [s.user_id, s]));
      const residencyMap = new Map((residencyRows ?? []).map((r) => [r.user_id, r]));
      console.log('residencyMap:', residencyMap);
      const apartmentMap = new Map((apartmentRows ?? []).map((a) => [a.id, a]));

      const senderInfoMap = new Map<string, SenderInfo>();
      for (const senderId of senderIds) {
        const profile = profileMap.get(senderId);
        const seller = sellerMap.get(senderId);
        const residency = residencyMap.get(senderId);
        const apartment = residency ? apartmentMap.get(residency.apartment_id) : null;

        const info = {
          name: profile?.name || '이웃',
          businessName: seller?.business_name,
          apartmentName: apartment?.name,
        };
        senderInfoMap.set(senderId, info);
      }

      const mappedMessages = (data ?? []).map((m) => {
        const senderInfo = senderInfoMap.get(m.sender_id);
        return mapRow(m, myUserIdRef.current, senderInfo);
      });
      setMessages(mappedMessages);
      setLoading(false);

      if (user) {
        await supabase
          .from('chat_participants')
          .update({ last_read_at: new Date().toISOString() })
          .eq('room_id', roomId)
          .eq('user_id', user.id);
      }

      channel = supabase
        .channel(`chat_messages:${roomId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
          async (payload) => {
            const newMessage = payload.new as MessageRow;
            // sender 정보 조회 (간단히 profile만, 판매자/아파트는 나중에 refresh)
            const { data: profile } = await supabase.from('profiles').select('name').eq('id', newMessage.sender_id).maybeSingle();
            const { data: seller } = await supabase.from('seller_profiles').select('business_name').eq('user_id', newMessage.sender_id).maybeSingle();
            const { data: residency } = await supabase.from('residencies').select('apartment_id').eq('user_id', newMessage.sender_id).eq('verified', true).maybeSingle<{ apartment_id: string }>();

            let apartment: { name: string } | null = null;
            if (residency?.apartment_id) {
              ({ data: apartment } = await supabase.from('apartments').select('name').eq('id', residency.apartment_id).maybeSingle());
            }

            const senderInfo: SenderInfo = {
              name: profile?.name || '이웃',
              businessName: seller?.business_name,
              apartmentName: apartment?.name,
            };

            setMessages((prev) => [...prev, mapRow(newMessage, myUserIdRef.current, senderInfo)]);
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
          (payload) => {
            const updated = mapRow(payload.new as MessageRow, myUserIdRef.current);
            setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId]);

  const sendMessage = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || !myUserIdRef.current) return { error: null as string | null };
      const { error } = await supabase
        .from('chat_messages')
        .insert({ room_id: roomId, sender_id: myUserIdRef.current, body: trimmed });
      return { error: error?.message ?? null };
    },
    [roomId]
  );

  const sendQuote = useCallback(
    async (quote: Omit<QuotePayload, 'status'>) => {
      if (!myUserIdRef.current) return { error: '로그인 세션이 없습니다.' };
      const payload = { ...quote, status: 'pending' };
      console.log('Sending quote with payload:', payload);
      const { error } = await supabase.from('chat_messages').insert({
        room_id: roomId,
        sender_id: myUserIdRef.current,
        body: '견적을 요청했어요.',
        type: 'quote',
        payload,
      });
      if (error) console.error('Error sending quote:', error);
      return { error: error?.message ?? null };
    },
    [roomId]
  );

  const approveQuote = useCallback(async (messageId: string, quote: QuotePayload) => {
    const { error } = await supabase
      .from('chat_messages')
      .update({ payload: { ...quote, status: 'approved' } })
      .eq('id', messageId);
    // 실시간 UPDATE가 늦게 올 수 있어 낙관적으로 즉시 반영
    if (!error) {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, quote: { ...quote, status: 'approved' } } : m))
      );
    }
    return { error: error?.message ?? null };
  }, []);

  return { messages, loading, sendMessage, sendQuote, approveQuote };
}
