import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useCommunityPostLikes(postId: string) {
  const [isLiked, setIsLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setMyUserId(user?.id ?? null);

      if (user?.id) {
        const { data } = await supabase
          .from('community_post_likes')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .maybeSingle();

        setIsLiked(!!data);
      }
      setLoading(false);
    })();
  }, [postId]);

  const toggleLike = useCallback(async () => {
    console.log('toggleLike called:', { myUserId, loading, isLiked });
    if (!myUserId || loading) {
      console.log('Early return:', { myUserId, loading });
      return;
    }

    if (isLiked) {
      console.log('Deleting like...');
      const { error } = await supabase
        .from('community_post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', myUserId);

      console.log('Delete result:', { error });
      if (!error) {
        setIsLiked(false);
      }
    } else {
      console.log('Inserting like...');
      const { error } = await supabase
        .from('community_post_likes')
        .insert({
          post_id: postId,
          user_id: myUserId,
        });

      console.log('Insert result:', { error });
      if (!error) {
        setIsLiked(true);
      }
    }
  }, [postId, myUserId, isLiked, loading]);

  return { isLiked, loading, toggleLike };
}
