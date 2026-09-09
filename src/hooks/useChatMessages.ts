import { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ChatMessage } from '../types/domain';

interface MessageRow {
  id: string;
  room_id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
  type: 'text' | 'notice';
}

function mapRow(row: MessageRow, myUserId: string | null, senderName?: string): ChatMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    authorId: row.sender_id,
    senderName: row.sender_id ? senderName || '상대방' : '공지',
    isMine: !!row.sender_id && row.sender_id === myUserId,
    body: row.body,
    createdAt: row.created_at,
    type: row.type ?? 'text',
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
        .select('id, room_id, sender_id, body, created_at, type')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .returns<MessageRow[]>();
      if (cancelled) return;

      const senderIds = [...new Set((data ?? []).map((m) => m.sender_id).filter((id): id is string => !!id))];
      const { data: profileRows } = await supabase.rpc('display_names', { ids: senderIds });
      const nameMap = new Map(((profileRows ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
      if (cancelled) return;

      setMessages((data ?? []).map((m) => mapRow(m, myUserIdRef.current, m.sender_id ? nameMap.get(m.sender_id) : undefined)));
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
            const row = payload.new as MessageRow;
            let name: string | undefined;
            if (row.sender_id) {
              const { data: p } = await supabase.rpc('display_names', { ids: [row.sender_id] });
              name = (p as { name: string }[] | null)?.[0]?.name;
            }
            setMessages((prev) => [...prev, mapRow(row, myUserIdRef.current, name)]);
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

  return { messages, loading, sendMessage };
}
