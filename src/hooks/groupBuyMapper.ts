import { supabase } from '../lib/supabase';
import { GroupBuy, GroupBuyCategory, GroupBuyStatus, GroupBuyType } from '../types/domain';

export interface GroupBuyRow {
  id: string;
  leader_id: string;
  type: GroupBuyType;
  category: GroupBuyCategory;
  title: string;
  description: string | null;
  photo_url: string | null;
  price: number;
  market_price: number | null;
  target_count: number;
  participant_count: number;
  deadline: string;
  status: GroupBuyStatus;
  pickup_place: string | null;
  pickup_time: string | null;
  install_dates: string[] | null;
  bumped_at: string | null;
}

interface LeaderBadgeRow {
  user_id: string;
  name: string;
  apartment_id: string;
  dong: string;
  rating: number;
  group_buy_count: number;
}

function isUrgent(deadline: string) {
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return days <= 2;
}

// leader_id 목록으로 get_leader_badge()를 병렬 호출해 "205동 이웃" 수준 배지 정보만 붙인다.
// (호수는 절대 노출하지 않음 — 온보딩 리포트 9장)
export async function attachLeaderBadges(rows: GroupBuyRow[]): Promise<GroupBuy[]> {
  const leaderIds = [...new Set(rows.map((r) => r.leader_id))];
  const badgeEntries = await Promise.all(
    leaderIds.map(async (id) => {
      const { data } = await supabase
        .rpc('get_leader_badge', { target_user_id: id })
        .maybeSingle<LeaderBadgeRow>();
      return [id, data] as const;
    })
  );
  const badgeMap = new Map(badgeEntries);

  return rows.map((r) => {
    const badge = badgeMap.get(r.leader_id);
    return {
      id: r.id,
      type: r.type,
      category: r.category,
      title: r.title,
      photoUrl: r.photo_url ?? undefined,
      groupPrice: r.price,
      marketPrice: r.market_price ?? r.price,
      participantCount: r.participant_count,
      targetCount: r.target_count,
      deadline: r.deadline,
      urgent: isUrgent(r.deadline),
      bumpedAt: r.bumped_at ?? undefined,
      status: r.status,
      description: r.description ?? undefined,
      pickupPlace: r.pickup_place ?? undefined,
      pickupTime: r.pickup_time ?? undefined,
      installDates: r.install_dates ?? undefined,
      leader: {
        id: r.leader_id,
        name: badge?.name ?? '알 수 없음',
        apartmentLabel: badge ? `${badge.dong}동 이웃` : '',
        rating: badge?.rating ?? 0,
        groupBuyCount: badge?.group_buy_count ?? 0,
      },
    };
  });
}
