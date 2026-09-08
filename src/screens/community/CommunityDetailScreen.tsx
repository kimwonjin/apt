import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommunityStackParamList } from '../../navigation/types';
import { useCommunityComments } from '../../hooks/useCommunityComments';
import { useCommunityPostLikes } from '../../hooks/useCommunityPostLikes';
import { CommunityCategory } from '../../types/domain';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';
import { communityCategoryColors } from '../../theme/colors';
import { formatRelative } from '../../lib/format';
import { supabase } from '../../lib/supabase';

type Props = NativeStackScreenProps<CommunityStackParamList, 'CommunityDetail'>;

interface Post {
  id: string;
  category: CommunityCategory;
  title: string;
  body: string;
  author: string;
  authorId: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
}

export function CommunityDetailScreen({ route, navigation }: Props) {
  const { postId } = route.params;
  const { comments, loading: commentsLoading, addComment, deleteComment } = useCommunityComments(postId);
  const { isLiked, loading: likeLoading, toggleLike } = useCommunityPostLikes(postId);
  const [post, setPost] = useState<Post | null>(null);
  const [postLoading, setPostLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  React.useEffect(() => {
    (async () => {
      console.log('CommunityDetailScreen loading post:', postId);
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current user:', user?.id);
      setMyUserId(user?.id ?? null);

      // 현재 사용자 프로필 확인
      if (user?.id) {
        const { data: myProfile } = await supabase
          .from('profiles')
          .select('id, name')
          .eq('id', user.id)
          .maybeSingle();
        console.log('My profile:', myProfile);
      }

      const { data, error: postError } = await supabase
        .from('community_posts')
        .select('id, category, title, body, author_id, created_at, like_count, comment_count')
        .eq('id', postId)
        .maybeSingle();

      console.log('Post query result:', { data, error: postError });

      if (data) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, name')
          .eq('id', data.author_id)
          .maybeSingle();

        console.log('Profile query result:', { profileData, error: profileError });

        setPost({
          id: data.id,
          category: data.category,
          title: data.title,
          body: data.body,
          author: profileData?.name || '이웃',
          authorId: data.author_id,
          createdAt: data.created_at,
          likeCount: data.like_count,
          commentCount: data.comment_count,
        });
      } else {
        console.log('No post data found');
      }
      setPostLoading(false);
    })();
  }, [postId]);

  const handleAddComment = async () => {
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    const { error } = await addComment(commentText);
    setSubmitting(false);
    if (!error) setCommentText('');
  };

  const handleDeleteComment = async (commentId: string) => {
    await deleteComment(commentId);
  };

  const handleDeletePost = async () => {
    Alert.alert('게시글 삭제', '정말 삭제하시겠어요?', [
      { text: '취소', onPress: () => {}, style: 'cancel' },
      {
        text: '삭제',
        onPress: async () => {
          const { error } = await supabase
            .from('community_posts')
            .delete()
            .eq('id', postId);

          if (!error) {
            navigation.goBack();
          } else {
            Alert.alert('오류', error.message);
          }
        },
        style: 'destructive',
      },
    ]);
  };

  const handleEditPost = () => {
    navigation.navigate('CommunityWrite', { editPostId: postId, initialData: post });
  };

  const showPostMenu = () => {
    setMenuVisible(true);
  };

  if (postLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>게시글을 찾을 수 없어요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const c = communityCategoryColors[post.category];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>상세</Text>
        {myUserId === post?.authorId ? (
          <Pressable onPress={() => {
            console.log('⋯ button pressed');
            showPostMenu();
          }} hitSlop={8}>
            <Text style={styles.headerAction}>⋯</Text>
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <FlatList
        data={comments}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.postSection}>
            <View style={styles.postHeader}>
              <View style={[styles.categoryBadge, { backgroundColor: c.bg }]}>
                <Text style={[styles.categoryBadgeText, { color: c.fg }]}>{post.category}</Text>
              </View>
              <View style={styles.authorTimeRow}>
                <Text style={styles.meta}>{post.author}</Text>
                <Text style={styles.meta}>{formatRelative(post.createdAt)}</Text>
              </View>
            </View>
            <Text style={styles.title}>{post.title}</Text>
            <Text style={styles.body}>{post.body}</Text>
            <View style={styles.statsRow}>
              <Pressable
                onPress={() => {
                  console.log('Heart pressed');
                  toggleLike();
                }}
                hitSlop={12}
              >
                {({ pressed }) => (
                  <Text style={[styles.stats, pressed && { opacity: 0.6 }]}>
                    {isLiked ? '♥' : '♡'} {post.likeCount}
                  </Text>
                )}
              </Pressable>
              <Text style={styles.stats}>· 💬 {post.commentCount}</Text>
            </View>
            <View style={styles.divider} />
            <Text style={styles.commentsTitle}>댓글 {comments.length}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.commentCard}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentAuthor}>{item.authorName}</Text>
              <Text style={styles.commentTime}>{formatRelative(item.createdAt)}</Text>
            </View>
            <Text style={styles.commentBody}>{item.body}</Text>
            {myUserId === item.authorId && (
              <Pressable onPress={() => handleDeleteComment(item.id)}>
                <Text style={styles.deleteBtn}>삭제</Text>
              </Pressable>
            )}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
      />

      <View style={styles.commentInputBar}>
        <TextInput
          style={styles.commentInput}
          placeholder="댓글을 입력하세요"
          placeholderTextColor={colors.textDisabled}
          value={commentText}
          onChangeText={setCommentText}
          onSubmitEditing={handleAddComment}
          returnKeyType="send"
        />
        <Pressable
          style={[styles.sendBtn, (!commentText.trim() || submitting) && styles.sendBtnDisabled]}
          onPress={handleAddComment}
          disabled={!commentText.trim() || submitting}
        >
          <Text style={styles.sendBtnText}>{submitting ? '...' : '보내기'}</Text>
        </Pressable>
      </View>

      <Modal visible={menuVisible} transparent animationType="fade">
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuContainer}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                handleEditPost();
              }}
            >
              <Text style={styles.menuText}>수정</Text>
            </Pressable>
            <Pressable
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={() => {
                setMenuVisible(false);
                handleDeletePost();
              }}
            >
              <Text style={[styles.menuText, styles.menuTextDanger]}>삭제</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
  },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  headerAction: { fontSize: 24, color: colors.textPrimary },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  menuContainer: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  menuItem: { paddingVertical: spacing.lg, paddingHorizontal: screenPadding, borderBottomWidth: 1, borderBottomColor: colors.divider },
  menuItemDanger: { borderBottomWidth: 0 },
  menuText: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary, textAlign: 'center' },
  menuTextDanger: { color: colors.danger },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: fontSize.md, color: colors.danger },
  listContent: { paddingBottom: spacing.xl },
  postSection: { backgroundColor: colors.card, padding: spacing.md, marginHorizontal: screenPadding, gap: spacing.sm, borderRadius: radius.lg },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  categoryBadge: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  categoryBadgeText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  authorTimeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meta: { fontSize: fontSize.base, color: colors.textTertiary },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  body: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 20 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  stats: { fontSize: fontSize.base, color: colors.textTertiary },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  commentsTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  commentCard: { backgroundColor: colors.card, padding: spacing.md, marginHorizontal: screenPadding, borderRadius: radius.lg, gap: spacing.xs },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  commentAuthor: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  commentTime: { fontSize: fontSize.base, color: colors.textTertiary },
  commentBody: { fontSize: fontSize.md, color: colors.textPrimary, lineHeight: 18 },
  deleteBtn: { fontSize: fontSize.base, color: colors.danger, fontWeight: fontWeight.semibold, marginTop: spacing.xs },
  commentInputBar: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: screenPadding, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.card },
  commentInput: { flex: 1, height: 40, borderRadius: radius.md, paddingHorizontal: spacing.sm, backgroundColor: colors.fillSubtle, fontSize: fontSize.md, color: colors.textPrimary },
  sendBtn: { paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.primary },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: colors.white, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
});
