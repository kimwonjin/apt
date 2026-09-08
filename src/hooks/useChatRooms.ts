import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ChatRoomSummary } from '../types/domain';

interface MyParticipantRow {
  room_id: string;
  last_read_at: string;
  chat_rooms: { id: string; groupbuy_id: string | null; created_at: string } | null;
}

interface PeerRow {
  room_id: string;
  user_id: string;
  profiles: { name: string } | null;
  seller_profiles: { business_name: string } | null;
  residencies: { apartment_id: string } | null;
}

interface MessageRow {
  room_id: string;
  body: string;
  created_at: string;
  sender_id: string;
}

// N+1을 피하려고 방 참여 목록 → 상대방 → 최근 메시지 → 연결된 공구 제목을 한 번씩만 조회한다.
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
      supabase
        .from('chat_participants')
        .select('room_id, user_id')
        .in('room_id', roomIds)
        .neq('user_id', user.id)
        .returns<PeerRow[]>(),
      supabase
        .from('chat_messages')
        .select('room_id, body, created_at, sender_id')
        .in('room_id', roomIds)
        .order('created_at', { ascending: false })
        .returns<MessageRow[]>(),
    ]);

    const peerUserIds = (peerRows ?? []).map((p) => p.user_id);
    const [{ data: profileRows }, { data: sellerRows }, { data: residencyRows }] = await Promise.all([
      supabase.from('profiles').select('id, name').in('id', peerUserIds),
      supabase.from('seller_profiles').select('user_id, business_name').in('user_id', peerUserIds),
      supabase.from('residencies').select('user_id, apartment_id').eq('verified', true).in('user_id', peerUserIds),
    ]);

    const gbIds = [...new Set(myRows.map((r) => r.chat_rooms?.groupbuy_id).filter((id): id is string => !!id))];
    let gbMap = new Map<string, { title: string; leader_id: string }>();
    if (gbIds.length > 0) {
      const { data: gbRows } = await supabase.from('groupbuys').select('id, title, leader_id').in('id', gbIds);
      gbMap = new Map((gbRows ?? []).map((g) => [g.id, { title: g.title, leader_id: g.leader_id }]));
    }

    const peerMap = new Map(peerRows?.map((p) => [p.room_id, p]) ?? []);
    const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p]));
    const sellerMap = new Map((sellerRows ?? []).map((s) => [s.user_id, s]));
    const residencyMap = new Map((residencyRows ?? []).map((r) => [r.user_id, r]));
    const lastMsgMap = new Map<string, MessageRow>();
    const unreadCountMap = new Map<string, number>();
    for (const m of msgRows ?? []) {
      if (!lastMsgMap.has(m.room_id)) lastMsgMap.set(m.room_id, m);
      const myRow = myRows.find((r) => r.room_id === m.room_id);
      if (myRow && m.sender_id !== user.id && new Date(m.created_at) > new Date(myRow.last_read_at)) {
        unreadCountMap.set(m.room_id, (unreadCountMap.get(m.room_id) ?? 0) + 1);
      }
    }

    // apartment 정보 조회
    const apartmentIds = [
      ...new Set((residencyRows ?? []).map((r) => r.apartment_id).filter((id): id is string => !!id)),
    ];
    let aptMap = new Map<string, { name: string }>();
    if (apartmentIds.length > 0) {
      const { data: aptRows } = await supabase.from('apartments').select('id, name').in('id', apartmentIds);
      aptMap = new Map((aptRows ?? []).map((a) => [a.id, { name: a.name }]));
    }

    const result: ChatRoomSummary[] = myRows.map((r) => {
      const peer = peerMap.get(r.room_id);
      const lastMsg = lastMsgMap.get(r.room_id);
      const gb = r.chat_rooms?.groupbuy_id ? gbMap.get(r.chat_rooms.groupbuy_id) : undefined;

      let peerName = '이웃';
      if (peer) {
        const profile = profileMap.get(peer.user_id);
        const seller = sellerMap.get(peer.user_id);
        const residency = residencyMap.get(peer.user_id);

        if (profile?.name) {
          peerName = profile.name;
          if (seller?.business_name) {
            peerName = `${profile.name}(${seller.business_name})`;
          } else if (residency?.apartment_id) {
            const apt = aptMap.get(residency.apartment_id);
            if (apt?.name) {
              peerName = `${profile.name}(${apt.name})`;
            }
          }
        }
      }

      return {
        id: r.room_id,
        peerName,
        peerRoleLabel: gb && peer?.user_id === gb.leader_id ? '공구대장' : '구매자',
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
