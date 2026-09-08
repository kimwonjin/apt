import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChatStackParamList } from '../../navigation/types';
import { useChatRooms } from '../../hooks/useChatRooms';
import { AppHeader } from '../../components/AppHeader';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<ChatStackParamList, 'ChatList'>;

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

export function ChatListScreen({ navigation }: Props) {
  const { rooms, loading, error, refresh } = useChatRooms();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="채팅" />
      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>불러오지 못했어요: {error}</Text>
        </View>
      ) : rooms.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>아직 대화가 없어요.</Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(r) => r.id}
          refreshing={loading}
          onRefresh={refresh}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate('ChatRoom', { roomId: item.id })}
            >
              <View style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.peerName}>{item.peerName}</Text>
                  <View style={styles.rolePill}>
                    <Text style={styles.rolePillText}>{item.peerRoleLabel}</Text>
                  </View>
                </View>
                {item.groupBuyTitle && (
                  <Text style={styles.groupBuyTitle} numberOfLines={1}>
                    {item.groupBuyTitle}
                  </Text>
                )}
                <Text style={styles.lastMessage} numberOfLines={1}>
                  {item.lastMessage}
                </Text>
              </View>
              <View style={styles.rightCol}>
                <Text style={styles.time}>{formatTime(item.updatedAt)}</Text>
                {item.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{item.unreadCount}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: screenPadding },
  errorText: { fontSize: fontSize.md, color: colors.danger, textAlign: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
  },
  avatar: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.fillSubtle },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  peerName: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  rolePill: { backgroundColor: colors.primaryLight, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  rolePillText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  groupBuyTitle: { fontSize: fontSize.base, color: colors.textTertiary, marginTop: 1 },
  lastMessage: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },
  rightCol: { alignItems: 'flex-end', gap: 4 },
  time: { fontSize: fontSize.base, color: colors.textTertiary },
  unreadBadge: { backgroundColor: colors.danger, borderRadius: radius.pill, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  unreadText: { color: colors.white, fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: screenPadding + 48 + spacing.sm },
});
