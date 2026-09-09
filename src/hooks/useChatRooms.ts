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

// 방 참여 목록 → 상대방 이름 → 최근 메시지 → 연결된 공구 제목을 한 번씩만 조회.
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

    const [{ data: peerRows }, { data: msgRows }] = await Promise.all([
      supabase.from('chat_participants').select('room_id, user_id').in('room_id', roomIds).neq('user_id', user.id),
      supabase
        .from('chat_messages')
        .select('room_id, body, created_at, sender_id')
        .in('room_id', roomIds)
        .order('created_at', { ascending: false })
        .returns<MessageRow[]>(),
    ]);

    const peerUserIds = [...new Set((peerRows ?? []).map((p) => p.user_id))];
    const { data: profileRowsRaw } = await supabase.rpc('display_names', { ids: peerUserIds });
    const profileRows = (profileRowsRaw ?? []) as { id: string; name: string }[];

    const gbIds = [...new Set(myRows.map((r) => r.chat_rooms?.groupbuy_id).filter((id): id is string => !!id))];
    let gbMap = new Map<string, { title: string; creator_id: string }>();
    if (gbIds.length > 0) {
      const { data: gbRows } = await supabase.from('groupbuys').select('id, title, creator_id').in('id', gbIds);
      gbMap = new Map((gbRows ?? []).map((g) => [g.id, { title: g.title, creator_id: g.creator_id }]));
    }

    const peerMap = new Map((peerRows ?? []).map((p) => [p.room_id, p]));
    const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p]));
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
      const peer = peerMap.get(r.room_id);
      const lastMsg = lastMsgMap.get(r.room_id);
      const gb = r.chat_rooms?.groupbuy_id ? gbMap.get(r.chat_rooms.groupbuy_id) : undefined;
      return {
        id: r.room_id,
        peerName: (peer && profileMap.get(peer.user_id)?.name) || '상대방',
        peerRoleLabel: gb && peer?.user_id === gb.creator_id ? '식당' : '참여자',
        lastMessage: lastMsg?.body ?? '대화를 시작해보세요',
        updatedAt: lastMsg?.created_at ?? r.chat_rooms?.created_at ?? new Date().toISOString(),
        unreadCount: unreadCountMap.get(r.room_id) ?? 0,
        groupBuyTitle: gb?.title,
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
