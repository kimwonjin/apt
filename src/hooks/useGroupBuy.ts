import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { GroupBuy } from '../types/domain';
import { attachCreatorBadges, GroupBuyRow } from './groupBuyMapper';

export function useGroupBuy(groupBuyId: string) {
  const [groupBuy, setGroupBuy] = useState<GroupBuy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from('groupbuys')
      .select('*, restaurants(id,name,category,rating)')
      .eq('id', groupBuyId)
      .maybeSingle<GroupBuyRow>();

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

    const [mapped] = await attachCreatorBadges([data]);
    setGroupBuy(mapped);
    setLoading(false);
  }, [groupBuyId]);

  useEffect(() => {
    refresh();
  }, [groupBuyId]);

  return { groupBuy, loading, error, refresh };
}
