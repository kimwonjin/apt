import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<MyPageStackParamList, 'InstallSchedule'>;

interface DateGroup {
  date: string;
  count: number;
}

interface Row {
  id: string;
  title: string;
  groups: DateGroup[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

export function InstallScheduleScreen({ navigation }: Props) {
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

        const { data: groupbuys } = await supabase
          .from('groupbuys')
          .select('id, title')
          .eq('leader_id', user.id)
          .eq('type', 'install');

        const results: Row[] = [];
        for (const gb of groupbuys ?? []) {
          const { data: parts } = await supabase
            .from('participations')
            .select('install_date')
            .eq('groupbuy_id', gb.id)
            .not('install_date', 'is', null);
          const counts = new Map<string, number>();
          for (const p of parts ?? []) {
            if (!p.install_date) continue;
            counts.set(p.install_date, (counts.get(p.install_date) ?? 0) + 1);
          }
          results.push({
            id: gb.id,
            title: gb.title,
            groups: [...counts.entries()].map(([date, count]) => ({ date, count })),
          });
        }
        if (!cancelled) {
          setRows(results);
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
        <Text style={styles.headerTitle}>시공 일정 관리</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>진행 중인 시공형 공구가 없어요.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>{item.title}</Text>
              {item.groups.length === 0 ? (
                <Text style={styles.emptySub}>아직 일정을 선택한 참여자가 없어요.</Text>
              ) : (
                item.groups.map((g) => (
                  <View key={g.date} style={styles.row}>
                    <Text style={styles.rowLabel}>{formatDate(g.date)}</Text>
                    <Text style={styles.rowValue}>{g.count}명</Text>
                  </View>
                ))
              )}
            </View>
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
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: 4 },
  emptySub: { fontSize: fontSize.md, color: colors.textTertiary },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  rowLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  rowValue: { fontSize: fontSize.md, color: colors.textPrimary, fontWeight: fontWeight.medium },
});
