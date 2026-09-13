import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { GroupBuy } from '../types/domain';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { formatDday, formatPrice } from '../lib/format';
import { nextTier, priceAfterDiscount } from '../lib/discount';

interface Props {
  groupBuy: GroupBuy;
  onPress: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  success: '성사확정',
  failed: '마감실패',
  canceled: '취소됨',
  done: '종료',
};

export function GroupBuyCard({ groupBuy, onPress }: Props) {
  const { participantCount, minHeadcount, discountPercent, timeSlot, basePrice, status } = groupBuy;
  const progress = Math.min(participantCount / minHeadcount, 1);
  const met = participantCount >= minHeadcount;
  const badgeColor = groupBuy.urgent
    ? { fg: colors.danger, bg: colors.dangerLight }
    : { fg: colors.textSecondary, bg: colors.fillSubtle };
  const isBumped = !!groupBuy.bumpedAt && Date.now() - new Date(groupBuy.bumpedAt).getTime() < 24 * 60 * 60 * 1000;
  const next = nextTier(participantCount, timeSlot, groupBuy.discountTable);
  const price = priceAfterDiscount(basePrice, discountPercent);

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
              {status === 'open' ? formatDday(groupBuy.deadline) : STATUS_LABEL[status] ?? status}
            </Text>
          </View>
        </View>

        <Text style={styles.restaurant} numberOfLines={1}>
          {groupBuy.restaurant.name}
        </Text>

        <View style={styles.priceRow}>
          {discountPercent > 0 && <Text style={styles.discount}>{discountPercent}%</Text>}
          <Text style={styles.groupPrice}>{formatPrice(price)}</Text>
          {discountPercent > 0 && <Text style={styles.marketPrice}>{formatPrice(basePrice)}</Text>}
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: met ? colors.primary : badgeColor.fg }]}
          />
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>
            {participantCount}명 참여 {met ? '· 성사 가능' : `· 최소 ${minHeadcount}명`}
          </Text>
          {status === 'open' && next && (
            <Text style={styles.footerHint}>{next.needed}명 더 → {next.percent}%</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  photo: { width: 92, height: 92, borderRadius: radius.md, backgroundColor: colors.fillSubtle },
  body: { flex: 1, justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.xs },
  title: { flex: 1, fontSize: fontSize.lgLg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  restaurant: { fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 },
  ddayBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  ddayText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, marginTop: 4 },
  discount: { fontSize: fontSize.lg, fontWeight: fontWeight.heavy, color: colors.danger },
  groupPrice: { fontSize: fontSize.xxl, fontWeight: fontWeight.heavy, color: colors.primary },
  marketPrice: { fontSize: fontSize.baseLg, color: colors.textDisabled, textDecorationLine: 'line-through' },
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.divider, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  footerText: { fontSize: fontSize.base, color: colors.textSecondary },
  footerHint: { fontSize: fontSize.base, color: colors.primary, fontWeight: fontWeight.medium },
});
