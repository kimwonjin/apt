import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CommunityPost } from '../types/domain';

interface PostRow {
  id: string;
  category: CommunityPost['category'];
  title: string;
  body: string;
  like_count: number;
  comment_count: number;
  created_at: string;
  author_id: string;
}

function preview(body: string): string {
  return body.length > 80 ? `${body.slice(0, 80)}...` : body;
}

// RLS가 인증된 단지 스코프로 자동 필터링하므로 apartment_id로 따로 필터하지 않아도 된다.
export function useCommunityPosts() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from('community_posts')
      .select('id, category, title, body, like_count, comment_count, created_at, author_id')
      .order('created_at', { ascending: false })
      .returns<PostRow[]>();

    if (queryError) {
      setError(queryError.message);
      setPosts([]);
      setLoading(false);
      return;
    }

    // author 정보 조회
    const authorIds = [...new Set((data ?? []).map((p) => p.author_id))];
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', authorIds);

    const authorMap = new Map((profileRows ?? []).map((p: any) => [p.id, p]));

    setPosts(
      (data ?? []).map((r) => ({
        id: r.id,
        category: r.category,
        author: authorMap.get(r.author_id)?.name || '이웃',
        createdAt: r.created_at,
        title: r.title,
        preview: preview(r.body),
        likeCount: r.like_count,
        commentCount: r.comment_count,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { posts, loading, error, refresh };
}
