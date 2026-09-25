import { useCallback, useEffect, useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import { supabase } from '../lib/supabase';
import { GroupBuy } from '../types/domain';
import { attachCreatorBadges, GROUPBUY_SELECT, GroupBuyRow } from './groupBuyMapper';

export function useGroupBuys() {
  const { buildingId } = useAppState();
  const [groupBuys, setGroupBuys] = useState<GroupBuy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!buildingId) {
      setGroupBuys([]);
      setLoading(false);
      return;
    }

    // 마감 지난 open 공구를 성사/실패로 확정 (pg_cron 폴백, 멱등)
    await supabase.rpc('sweep_expired_groupbuys');

    const { data, error: queryError } = await supabase
      .from('groupbuys')
      .select(GROUPBUY_SELECT)
      .eq('building_id', buildingId)
      .order('deadline', { ascending: true });

    if (queryError) {
      setError(queryError.message);
      setGroupBuys([]);
      setLoading(false);
      return;
    }

    const mapped = await attachCreatorBadges((data ?? []) as GroupBuyRow[]);

    const isBumped = (g: GroupBuy) =>
      !!g.bumpedAt && Date.now() - new Date(g.bumpedAt).getTime() < 24 * 60 * 60 * 1000;
    // 진행중(open) 공구가 항상 먼저 오고, 그 안에서는 마감이 가까운 순.
    // 마감/성사된 공구는 그 뒤에 최근 것부터(전체 탭에서 지난 이력 보기용).
    mapped.sort((a, b) => {
      const bumpDiff = Number(isBumped(b)) - Number(isBumped(a));
      if (bumpDiff !== 0) return bumpDiff;
      const aOpen = a.status === 'open' ? 0 : 1;
      const bOpen = b.status === 'open' ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      const diff = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      return a.status === 'open' ? diff : -diff;
    });
    setGroupBuys(mapped);
    setLoading(false);
  }, [buildingId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { groupBuys, loading, error, refresh };
}
