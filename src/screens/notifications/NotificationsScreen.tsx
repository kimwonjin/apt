import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../../navigation/types';
import { useNotifications } from '../../hooks/useNotifications';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';
import { formatRelative } from '../../lib/format';

type Props = NativeStackScreenProps<HomeStackParamList, 'Notifications'>;

export function NotificationsScreen({ navigation }: Props) {
  const { items, loading, refresh, markRead } = useNotifications();

  const handlePress = (item: (typeof items)[number]) => {
    markRead(item.id);
    if ((item.type === 'chat_message' || item.type === 'quote_received') && item.roomId) {
      (navigation as any).getParent()?.navigate('채팅', { screen: 'ChatRoom', params: { roomId: item.roomId } });
    } else if ((item.type === 'new_participation' || item.type === 'new_review' || item.type === 'groupbuy_success') && item.groupBuyId) {
      (navigation as any).getParent()?.navigate('홈', { screen: 'GroupBuyDetail', params: { groupBuyId: item.groupBuyId } });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>알림</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>아직 알림이 없어요.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.listContent}
          refreshing={loading}
          onRefresh={refresh}
          renderItem={({ item }) => (
            <Pressable style={[styles.card, !item.read && styles.cardUnread]} onPress={() => handlePress(item)}>
              {!item.read && <View style={styles.dot} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.title}</Text>
                {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
                <Text style={styles.time}>{formatRelative(item.createdAt)}</Text>
              </View>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: screenPadding, paddingVertical: spacing.sm },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary },
  listContent: { padding: screenPadding, paddingTop: spacing.xs },
  card: { flexDirection: 'row', gap: spacing.xs, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md },
  cardUnread: { backgroundColor: colors.primaryLight },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.primary, marginTop: 6 },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  body: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },
  time: { fontSize: fontSize.base, color: colors.textTertiary, marginTop: 4 },
});
