import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface CommunityComment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export function useCommunityComments(postId: string) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from('community_comments')
      .select('id, author_id, body, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (queryError) {
      setError(queryError.message);
      setComments([]);
      setLoading(false);
      return;
    }

    // 작성자 정보 조회
    const authorIds = [...new Set((data ?? []).map(c => c.author_id))];
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', authorIds);

    const profileMap = new Map((profileRows ?? []).map(p => [p.id, p]));

    const commentList = (data ?? []).map(c => ({
      id: c.id,
      authorId: c.author_id,
      authorName: profileMap.get(c.author_id)?.name || '이웃',
      body: c.body,
      createdAt: c.created_at,
    }));

    setComments(commentList);
    setLoading(false);
  }, [postId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addComment = useCallback(
    async (body: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { error: '로그인 필요' };

      const { error } = await supabase.from('community_comments').insert({
        post_id: postId,
        author_id: user.id,
        body: body.trim(),
      });

      if (error) return { error: error.message };

      await refresh();
      return { error: null };
    },
    [postId, refresh]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      const { error } = await supabase
        .from('community_comments')
        .delete()
        .eq('id', commentId);

      if (error) return { error: error.message };

      setComments(prev => prev.filter(c => c.id !== commentId));
      return { error: null };
    },
    []
  );

  return { comments, loading, error, refresh, addComment, deleteComment };
}
