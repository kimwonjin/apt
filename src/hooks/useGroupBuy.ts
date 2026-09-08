import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { GroupBuy } from '../types/domain';
import { attachLeaderBadges, GroupBuyRow } from './groupBuyMapper';

export function useGroupBuy(groupBuyId: string) {
  const [groupBuy, setGroupBuy] = useState<GroupBuy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from('groupbuys')
      .select('id,leader_id,type,category,title,description,photo_url,price,market_price,target_count,participant_count,deadline,status,pickup_place,pickup_time,install_dates,bumped_at')
      .eq('id', groupBuyId)
      .maybeSingle<GroupBuyRow>();

    console.log('GroupBuy query result:', { data, error: queryError });

    if (queryError) {
      setError(queryError.message);
      setGroupBuy(null);
      setLoading(false);
      return;
    }
    if (!data) {
      setGroupBuy(null);
      setLoading(false);
      return;
    }

    const withBadge = await attachLeaderBadges([data]);
    console.log('After attachLeaderBadges:', withBadge[0]);

    // participations의 qty 합계로 participantCount 업데이트
    const { data: qtySum } = await supabase.rpc('get_groupbuy_qty_sums', { groupbuy_ids: [groupBuyId] });
    const totalQty = (qtySum?.[0]?.total_qty ?? 0) as number;

    const withQtyCount = { ...withBadge[0], participantCount: totalQty };
    console.log('GroupBuy after processing:', withQtyCount);
    setGroupBuy(withQtyCount);
    setLoading(false);
  }, [groupBuyId]);

  useEffect(() => {
    refresh();
  }, [groupBuyId]);

  return { groupBuy, loading, error, refresh };
}
