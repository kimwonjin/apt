import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { GroupBuy } from '../types/domain';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { formatDday, formatPrice } from '../lib/format';

interface Props {
  groupBuy: GroupBuy;
  onPress: () => void;
}

export function GroupBuyCard({ groupBuy, onPress }: Props) {
  const progress = Math.min(groupBuy.participantCount / groupBuy.targetCount, 1);
  const badgeColor = groupBuy.urgent
    ? { fg: colors.danger, bg: colors.dangerLight }
    : { fg: colors.textSecondary, bg: colors.fillSubtle };
  const isBumped = !!groupBuy.bumpedAt && Date.now() - new Date(groupBuy.bumpedAt).getTime() < 24 * 60 * 60 * 1000;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {groupBuy.photoUrl ? (
        <Image source={{ uri: groupBuy.photoUrl }} style={styles.photo} />
      ) : (
        <View style={styles.photo} />
      )}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {isBumped ? '🔥 ' : ''}
            {groupBuy.title}
          </Text>
          <View style={[styles.ddayBadge, { backgroundColor: badgeColor.bg }]}>
            <Text style={[styles.ddayText, { color: badgeColor.fg }]}>
              {formatDday(groupBuy.deadline)}
            </Text>
          </View>
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.groupPrice}>{formatPrice(groupBuy.groupPrice)}</Text>
          <Text style={styles.marketPrice}>{formatPrice(groupBuy.marketPrice)}</Text>
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress * 100}%`, backgroundColor: badgeColor.fg },
            ]}
          />
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>
            {groupBuy.participantCount}/{groupBuy.targetCount}명 참여
          </Text>
          <Text style={styles.footerText}>
            {groupBuy.leader.name} · ★{groupBuy.leader.rating.toFixed(1)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  photo: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
    backgroundColor: colors.fillSubtle,
  },
  body: {
    flex: 1,
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  title: {
    flex: 1,
    fontSize: fontSize.lgLg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  ddayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  ddayText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    marginTop: 4,
  },
  groupPrice: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.heavy,
    color: colors.primary,
  },
  marketPrice: {
    fontSize: fontSize.baseLg,
    color: colors.textDisabled,
    textDecorationLine: 'line-through',
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.divider,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  footerText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
});
