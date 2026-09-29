import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ChatRoomSummary } from '../types/domain';

interface MyParticipantRow {
  room_id: string;
  last_read_at: string;
  chat_rooms: { id: string; groupbuy_id: string | null; created_at: string } | null;
}
interface MessageRow {
  room_id: string;
  body: string;
  created_at: string;
  sender_id: string | null;
}

// 방 참여 목록 → 참여 인원 수 → 최근 메시지 → 연결된 공구 제목을 한 번씩만 조회.
// 채팅방은 공구 하나당 하나(단체방)라 "상대방" 개념이 없다.
export function useChatRooms() {
  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setRooms([]);
      setLoading(false);
      return;
    }

    const { data: myRows, error: myError } = await supabase
      .from('chat_participants')
      .select('room_id, last_read_at, chat_rooms(id, groupbuy_id, created_at)')
      .eq('user_id', user.id)
      .returns<MyParticipantRow[]>();

    if (myError) {
      setError(myError.message);
      setRooms([]);
      setLoading(false);
      return;
    }

    const roomIds = (myRows ?? []).map((r) => r.room_id);
    if (roomIds.length === 0) {
      setRooms([]);
      setLoading(false);
      return;
    }

    const [{ data: participantRows }, { data: msgRows }] = await Promise.all([
      supabase.from('chat_participants').select('room_id').in('room_id', roomIds),
      supabase
        .from('chat_messages')
        .select('room_id, body, created_at, sender_id')
        .in('room_id', roomIds)
        .order('created_at', { ascending: false })
        .returns<MessageRow[]>(),
    ]);

    const gbIds = [...new Set(myRows.map((r) => r.chat_rooms?.groupbuy_id).filter((id): id is string => !!id))];
    let gbMap = new Map<string, { title: string }>();
    if (gbIds.length > 0) {
      const { data: gbRows } = await supabase.from('groupbuys').select('id, title').in('id', gbIds);
      gbMap = new Map((gbRows ?? []).map((g) => [g.id, { title: g.title }]));
    }

    const participantCountMap = new Map<string, number>();
    for (const p of participantRows ?? []) {
      participantCountMap.set(p.room_id, (participantCountMap.get(p.room_id) ?? 0) + 1);
    }
    const lastMsgMap = new Map<string, MessageRow>();
    const unreadCountMap = new Map<string, number>();
    for (const m of msgRows ?? []) {
      if (!lastMsgMap.has(m.room_id)) lastMsgMap.set(m.room_id, m);
      const myRow = myRows.find((r) => r.room_id === m.room_id);
      if (myRow && m.sender_id !== user.id && new Date(m.created_at) > new Date(myRow.last_read_at)) {
        unreadCountMap.set(m.room_id, (unreadCountMap.get(m.room_id) ?? 0) + 1);
      }
    }

    const result: ChatRoomSummary[] = myRows.map((r) => {
      const lastMsg = lastMsgMap.get(r.room_id);
      const gb = r.chat_rooms?.groupbuy_id ? gbMap.get(r.chat_rooms.groupbuy_id) : undefined;
      return {
        id: r.room_id,
        title: gb?.title ?? '채팅방',
        participantCount: participantCountMap.get(r.room_id) ?? 1,
        lastMessage: lastMsg?.body ?? '대화를 시작해보세요',
        updatedAt: lastMsg?.created_at ?? r.chat_rooms?.created_at ?? new Date().toISOString(),
        unreadCount: unreadCountMap.get(r.room_id) ?? 0,
      };
    });

    result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setRooms(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rooms, loading, error, refresh };
}
