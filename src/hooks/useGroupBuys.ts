import { useCallback, useEffect, useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import { supabase } from '../lib/supabase';
import { GroupBuy } from '../types/domain';
import { attachLeaderBadges, GroupBuyRow } from './groupBuyMapper';

export function useGroupBuys() {
  const { apartmentId } = useAppState();
  const [groupBuys, setGroupBuys] = useState<GroupBuy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!apartmentId) {
      setGroupBuys([]);
      setLoading(false);
      return;
    }

    const { data, error: queryError } = await supabase
      .from('groupbuys')
      .select('*')
      .eq('apartment_id', apartmentId)
      .order('deadline', { ascending: true });

    if (queryError) {
      setError(queryError.message);
      setGroupBuys([]);
      setLoading(false);
      return;
    }

    const mapped = await attachLeaderBadges((data ?? []) as GroupBuyRow[]);

    // participations의 qty 합계로 participantCount 업데이트
    const groupBuyIds = mapped.map((g) => g.id);
    const { data: qtySums } = await supabase.rpc('get_groupbuy_qty_sums', { groupbuy_ids: groupBuyIds });

    const qtyMap = new Map((qtySums ?? []).map((row: any) => [row.groupbuy_id, row.total_qty]));

    const withQtyCount = mapped.map((g) => ({
      ...g,
      participantCount: qtyMap.get(g.id) ?? 0,
    }));

    // 24시간 이내에 "끌어올리기" 한 공구를 맨 위로, 그 외엔 기존처럼 마감일 순.
    const isBumped = (g: GroupBuy) => !!g.bumpedAt && Date.now() - new Date(g.bumpedAt).getTime() < 24 * 60 * 60 * 1000;
    withQtyCount.sort((a, b) => {
      const bumpDiff = Number(isBumped(b)) - Number(isBumped(a));
      if (bumpDiff !== 0) return bumpDiff;
      if (isBumped(a) && isBumped(b)) {
        return new Date(b.bumpedAt!).getTime() - new Date(a.bumpedAt!).getTime();
      }
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });
    setGroupBuys(withQtyCount);
    setLoading(false);
  }, [apartmentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { groupBuys, loading, error, refresh };
}
