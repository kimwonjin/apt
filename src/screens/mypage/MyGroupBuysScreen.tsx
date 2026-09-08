import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';
import { formatPrice } from '../../lib/format';

type Props = NativeStackScreenProps<MyPageStackParamList, 'MyGroupBuys'>;

const STATUS_LABEL: Record<string, string> = {
  open: '진행 중',
  closed: '마감',
  success: '성공',
  failed: '실패',
  done: '완료',
};

interface Row {
  id: string;
  title: string;
  price: number;
  participant_count: number;
  target_count: number;
  status: string;
}

export function MyGroupBuysScreen({ navigation }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }
        const { data } = await supabase
          .from('groupbuys')
          .select('id, title, price, participant_count, target_count, status')
          .eq('leader_id', user.id)
          .order('created_at', { ascending: false });
        if (!cancelled) {
          setRows(data ?? []);
          setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>내가 연 공구</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>아직 개설한 공구가 없어요.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => (navigation as any).getParent()?.navigate('홈', { screen: 'GroupBuyDetail', params: { groupBuyId: item.id } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.sub}>
                  {formatPrice(item.price)} · {item.participant_count}/{item.target_count}명
                </Text>
              </View>
              <Text style={styles.statusBadge}>{STATUS_LABEL[item.status] ?? item.status}</Text>
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  sub: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },
  statusBadge: { fontSize: fontSize.base, color: colors.primary, fontWeight: fontWeight.semibold },
});
