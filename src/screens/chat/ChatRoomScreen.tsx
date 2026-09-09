import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChatStackParamList } from '../../navigation/types';
import { useChatMessages } from '../../hooks/useChatMessages';
import { supabase } from '../../lib/supabase';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<ChatStackParamList, 'ChatRoom'>;

interface Meta {
  peerName: string;
  groupBuyTitle?: string;
}

export function ChatRoomScreen({ route, navigation }: Props) {
  const { roomId } = route.params;
  const { messages, sendMessage } = useChatMessages(roomId);
  const [draft, setDraft] = useState('');
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: peer } = await supabase
        .from('chat_participants')
        .select('user_id')
        .eq('room_id', roomId)
        .neq('user_id', user.id)
        .maybeSingle();
      const { data: room } = await supabase.from('chat_rooms').select('groupbuy_id').eq('id', roomId).maybeSingle();
      const [{ data: names }, gb] = await Promise.all([
        peer ? supabase.rpc('display_names', { ids: [peer.user_id] }) : Promise.resolve({ data: null }),
        room?.groupbuy_id
          ? supabase.from('groupbuys').select('title').eq('id', room.groupbuy_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setMeta({
        peerName: (names as { name: string }[] | null)?.[0]?.name ?? '상대방',
        groupBuyTitle: (gb.data as any)?.title,
      });
    })();
  }, [roomId]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    await sendMessage(body);
  }, [draft, sendMessage]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{meta?.peerName ?? '채팅방'}</Text>
        <View style={{ width: 24 }} />
      </View>

      {meta?.groupBuyTitle && (
        <View style={styles.pinnedBanner}>
          <Text style={styles.pinnedText}>📌 {meta.groupBuyTitle}</Text>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messages}
          renderItem={({ item }) =>
            item.type === 'notice' ? (
              <View style={styles.noticeRow}>
                <Text style={styles.noticeText}>{item.body}</Text>
              </View>
            ) : (
              <View style={[styles.bubbleRow, item.isMine && styles.bubbleRowMine]}>
                {!item.isMine && <Text style={styles.senderName}>{item.senderName}</Text>}
                <View style={[styles.bubble, item.isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={item.isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{item.body}</Text>
                </View>
              </View>
            )
          }
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="메시지를 입력하세요"
            placeholderTextColor={colors.textDisabled}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={handleSend}
          />
          <Pressable style={styles.sendBtn} onPress={handleSend} disabled={!draft.trim()}>
            <Text style={styles.sendBtnText}>전송</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: screenPadding, paddingVertical: spacing.sm },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  pinnedBanner: { backgroundColor: colors.primaryLight, paddingHorizontal: screenPadding, paddingVertical: spacing.xs },
  pinnedText: { fontSize: fontSize.base, color: colors.primaryDark },
  messages: { padding: screenPadding, gap: spacing.sm },
  noticeRow: { alignItems: 'center', paddingVertical: spacing.xs },
  noticeText: { fontSize: fontSize.base, color: colors.textTertiary, backgroundColor: colors.fillSubtle, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  bubbleRow: { alignItems: 'flex-start', maxWidth: '80%' },
  bubbleRowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  senderName: { fontSize: fontSize.base, color: colors.textTertiary, marginBottom: 2 },
  bubble: { borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleMine: { backgroundColor: colors.primary },
  bubbleTheirs: { backgroundColor: colors.card },
  bubbleTextMine: { color: colors.white, fontSize: fontSize.md },
  bubbleTextTheirs: { color: colors.textPrimary, fontSize: fontSize.md },
  inputRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.card },
  input: {
    flex: 1,
    minHeight: minTouchSize,
    borderRadius: radius.pill,
    backgroundColor: colors.fillSubtle,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  sendBtn: { paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: colors.white, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
});
