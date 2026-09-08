import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  roomId?: string;
  groupBuyId?: string;
}

interface NotificationRow {
  id: string;
  type: string;
  payload: { title?: string; body?: string; room_id?: string; groupbuy_id?: string } | null;
  read: boolean;
  created_at: string;
}

export function useNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('id, type, payload, read, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<NotificationRow[]>();

    setItems(
      (data ?? []).map((r) => ({
        id: r.id,
        type: r.type,
        title: r.payload?.title ?? '알림',
        body: r.payload?.body ?? '',
        read: r.read,
        createdAt: r.created_at,
        roomId: r.payload?.room_id,
        groupBuyId: r.payload?.groupbuy_id,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unreadCount = items.filter((i) => !i.read).length;

  const markRead = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)));
  }, []);

  return { items, loading, unreadCount, refresh, markRead };
}
