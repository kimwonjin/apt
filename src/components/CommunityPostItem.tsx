import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CommunityPost } from '../types/domain';
import { useCommunityPostLikes } from '../hooks/useCommunityPostLikes';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { communityCategoryColors } from '../theme/colors';
import { formatRelative } from '../lib/format';

interface Props {
  post: CommunityPost;
  onPress: () => void;
}

export function CommunityPostItem({ post, onPress }: Props) {
  const { isLiked, toggleLike } = useCommunityPostLikes(post.id);
  const c = communityCategoryColors[post.category];

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
    >
      {({ pressed }) => (
        <View style={[styles.card, pressed && styles.cardPressed]}>
          <View style={styles.header}>
            <View style={[styles.categoryBadge, { backgroundColor: c.bg }]}>
              <Text style={[styles.categoryBadgeText, { color: c.fg }]}>{post.category}</Text>
            </View>
            <View style={styles.authorTimeRow}>
              <Text style={styles.author}>{post.author}</Text>
              <Text style={styles.time}>{formatRelative(post.createdAt)}</Text>
            </View>
          </View>

          <Text style={styles.title} numberOfLines={2}>
            {post.title}
          </Text>
          <Text style={styles.preview} numberOfLines={2}>
            {post.preview}
          </Text>

          <View style={styles.footer}>
            <View style={styles.statsRow}>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  toggleLike();
                }}
                hitSlop={8}
              >
                {({ pressed: likPressed }) => (
                  <View style={[styles.statItem, likPressed && styles.statItemPressed]}>
                    <Text style={[styles.statIcon, isLiked && styles.statIconLiked]}>
                      {isLiked ? '♥' : '♡'}
                    </Text>
                    <Text style={styles.statText}>{post.likeCount}</Text>
                  </View>
                )}
              </Pressable>
              <View style={styles.statItem}>
                <Text style={styles.statIcon}>💬</Text>
                <Text style={styles.statText}>{post.commentCount}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  cardPressed: {
    backgroundColor: colors.fillSubtle,
    borderColor: colors.primaryLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  categoryBadgeText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },
  authorTimeRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  author: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  time: {
    fontSize: fontSize.base,
    color: colors.textTertiary,
    fontWeight: fontWeight.medium,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  preview: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  footer: {
    marginTop: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statItemPressed: {
    opacity: 0.7,
  },
  statIcon: {
    fontSize: 20,
  },
  statIconLiked: {
    color: colors.danger,
  },
  statText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
});
