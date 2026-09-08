import { supabase } from './supabase';
import type { DaumAddressResult } from '../components/addressTypes';

export interface ApartmentOption {
  id: string;
  name: string;
  address: string | null;
}

// 도로명주소를 고유 키로 찾거나 새로 만든다. 같은 건물을 검색한 다른 사용자는
// 항상 같은 apartments row를 재사용하게 되어 동/호만 달라도 한 단지로 묶인다.
export async function findOrCreateApartment(addr: DaumAddressResult): Promise<ApartmentOption> {
  const { data: existing, error: selectError } = await supabase
    .from('apartments')
    .select('id, name, address')
    .eq('road_address', addr.roadAddress)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from('apartments')
    .insert({
      name: addr.buildingName || addr.roadAddress,
      address: addr.jibunAddress || null,
      road_address: addr.roadAddress,
      region: [addr.sido, addr.sigungu].filter(Boolean).join(' ') || null,
    })
    .select('id, name, address')
    .single();
  if (!insertError && created) return created;

  // 동시에 같은 주소를 처음 등록하는 경쟁 상황이면 유니크 제약에 걸리므로 다시 조회한다.
  if (insertError?.code === '23505') {
    const { data: retry, error: retryError } = await supabase
      .from('apartments')
      .select('id, name, address')
      .eq('road_address', addr.roadAddress)
      .single();
    if (!retryError && retry) return retry;
  }
  throw insertError;
}
