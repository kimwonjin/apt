import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { requestCardRegistration } from '../../lib/toss';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<MyPageStackParamList, 'PaymentMethods'>;

interface PaymentMethodRow {
  id: string;
  label: string;
  is_default: boolean;
  billing_key: string | null;
}

// 토스페이먼츠 테스트 연동. "카드 등록"을 누르면 토스 카드 등록 화면으로 이동했다가
// 돌아오는데, 실제 발급/저장 처리는 AppStateContext에서 앱 전체 진입 시 한 번 처리한다
// (React Navigation이 URL과 화면을 안 묶어놔서, 어느 화면에서 돌아올지 알 수 없기 때문).
export function PaymentMethodsScreen({ navigation }: Props) {
  const [rows, setRows] = useState<PaymentMethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('payment_methods').select('id, label, is_default, billing_key').order('created_at', { ascending: false });
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleAdd = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('아직 웹에서만 지원해요', '폰 브라우저로 접속해서 카드를 등록해주세요.');
      return;
    }
    setAdding(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요해요.');
      await requestCardRegistration(user.id); // 성공하면 토스 화면으로 이동(페이지 이탈)
    } catch (e) {
      Alert.alert('카드 등록 실패', e instanceof Error ? e.message : '다시 시도해주세요.');
      setAdding(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('결제수단 삭제', '이 결제수단을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { await supabase.from('payment_methods').delete().eq('id', id); refresh(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>결제수단 관리</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.note}>* 토스페이먼츠 테스트 연동이라 실제 결제는 되지 않아요.</Text>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>등록된 결제수단이 없어요.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View>
                <Text style={styles.title}>{item.label}</Text>
                {!item.billing_key && <Text style={styles.legacyNote}>예전 방식 등록 — 실제 결제 승인은 안 돼요</Text>}
              </View>
              <Pressable onPress={() => handleDelete(item.id)} hitSlop={8}>
                <Text style={styles.deleteText}>삭제</Text>
              </Pressable>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      <Pressable style={[styles.cta, adding && styles.ctaDisabled]} disabled={adding} onPress={handleAdd}>
        <Text style={styles.ctaText}>{adding ? '이동 중...' : '+ 카드 등록'}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: screenPadding },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  note: { fontSize: fontSize.base, color: colors.textTertiary, marginBottom: spacing.sm },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary },
  listContent: { paddingBottom: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.medium, color: colors.textPrimary },
  legacyNote: { fontSize: fontSize.base, color: colors.danger, marginTop: 2 },
  deleteText: { fontSize: fontSize.md, color: colors.danger },
  cta: {
    height: minTouchSize,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: colors.white, fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
});
