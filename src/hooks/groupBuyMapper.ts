import { supabase } from '../lib/supabase';
import { GroupBuy, GroupBuyStatus, TimeSlot } from '../types/domain';

export interface GroupBuyRow {
  id: string;
  creator_id: string;
  restaurant_id: string;
  menu_id: string;
  title: string;
  photo_url: string | null;
  base_price: number;
  time_slot: TimeSlot;
  min_headcount: number;
  participant_count: number;
  discount_percent: number;
  final_discount_percent: number | null;
  deadline: string;
  status: GroupBuyStatus;
  pickup_place: string | null;
  pickup_time: string | null;
  bumped_at: string | null;
  subscription_group_id: string | null;
  restaurants?: { id: string; name: string; category: string | null; rating: number } | null;
}

interface CreatorBadgeRow {
  user_id: string;
  name: string;
  building_id: string;
  building_name: string;
  company_name: string | null;
}

function isUrgent(deadline: string) {
  return new Date(deadline).getTime() - Date.now() <= 60 * 60 * 1000; // 1시간 이내
}

// creator_id 목록으로 get_creator_badge()를 병렬 호출해 빌딩명 수준 배지만 붙인다.
export async function attachCreatorBadges(rows: GroupBuyRow[]): Promise<GroupBuy[]> {
  const creatorIds = [...new Set(rows.map((r) => r.creator_id))];
  const entries = await Promise.all(
    creatorIds.map(async (id) => {
      const { data } = await supabase
        .rpc('get_creator_badge', { target_user_id: id })
        .maybeSingle<CreatorBadgeRow>();
      return [id, data] as const;
    })
  );
  const badgeMap = new Map(entries);

  return rows.map((r) => {
    const badge = badgeMap.get(r.creator_id);
    return {
      id: r.id,
      title: r.title,
      photoUrl: r.photo_url ?? undefined,
      restaurant: {
        id: r.restaurants?.id ?? r.restaurant_id,
        name: r.restaurants?.name ?? '식당',
        category: r.restaurants?.category ?? undefined,
        rating: r.restaurants?.rating ?? 0,
      },
      menuId: r.menu_id,
      basePrice: r.base_price,
      timeSlot: r.time_slot,
      minHeadcount: r.min_headcount,
      participantCount: r.participant_count,
      discountPercent: r.discount_percent,
      finalDiscountPercent: r.final_discount_percent ?? undefined,
      deadline: r.deadline,
      urgent: isUrgent(r.deadline),
      bumpedAt: r.bumped_at ?? undefined,
      status: r.status,
      pickupPlace: r.pickup_place ?? undefined,
      pickupTime: r.pickup_time ?? undefined,
      subscriptionGroupId: r.subscription_group_id ?? undefined,
      creator: {
        id: r.creator_id,
        name: badge?.name ?? '알 수 없음',
        buildingLabel: badge?.building_name ?? '',
        companyName: badge?.company_name ?? undefined,
      },
    };
  });
}
