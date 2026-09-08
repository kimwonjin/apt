import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Product } from '../types/domain';

interface ProductRow {
  id: string;
  seller_id: string;
  type: Product['type'];
  category: Product['category'];
  title: string;
  photos: string[];
  price_tiers: { minQty: number; unitPrice: number }[];
}

// products.seller_id와 seller_profiles.user_id는 둘 다 profiles를 각자 참조하는 형제 FK라
// PostgREST가 자동으로 embed하지 못한다 (직접 FK가 없음) — 따로 조회해서 클라이언트에서 합친다.
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from('products')
      .select('id, seller_id, type, category, title, photos, price_tiers')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .returns<ProductRow[]>();

    if (queryError) {
      setError(queryError.message);
      setProducts([]);
      setLoading(false);
      return;
    }

    const sellerIds = [...new Set((data ?? []).map((r) => r.seller_id))];
    let sellerMap = new Map<string, { business_name: string; rating: number }>();
    if (sellerIds.length > 0) {
      const { data: sellerRows } = await supabase
        .from('seller_profiles')
        .select('user_id, business_name, rating')
        .in('user_id', sellerIds);
      sellerMap = new Map((sellerRows ?? []).map((s) => [s.user_id, { business_name: s.business_name, rating: s.rating }]));
    }

    setProducts(
      (data ?? []).map((r) => ({
        id: r.id,
        sellerId: r.seller_id,
        type: r.type,
        category: r.category,
        title: r.title,
        photoUrl: r.photos?.[0],
        photos: r.photos ?? [],
        priceTiers: r.price_tiers ?? [],
        sellerName: sellerMap.get(r.seller_id)?.business_name || '판매자',
        sellerRating: sellerMap.get(r.seller_id)?.rating ?? 0,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { products, loading, error, refresh };
}
