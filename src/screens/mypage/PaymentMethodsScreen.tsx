import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<MyPageStackParamList, 'PaymentMethods'>;

interface PaymentMethodRow {
  id: string;
  label: string;
  is_default: boolean;
}

// PG(포트원 등) 연동 전까지 쓰는 가상 결제수단. 실제 PG 붙이면 등록 버튼이
// 카드 등록(빌링키 발급) 인증창을 열도록만 바꾸면 되고, 나머지 화면은 그대로 재사용된다.
export function PaymentMethodsScreen({ navigation }: Props) {
  const [rows, setRows] = useState<PaymentMethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('payment_methods').select('id, label, is_default').order('created_at', { ascending: false });
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleAdd = async () => {
    setAdding(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const cardNo = Math.floor(1000 + Math.random() * 9000);
      await supabase.from('payment_methods').insert({ user_id: user.id, label: `테스트카드 •••• ${cardNo}` });
      refresh();
    }
    setAdding(false);
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

      <Text style={styles.note}>* 실제 PG(포트원 등) 연동 전까지는 테스트용 카드로 표시돼요.</Text>

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
              <Text style={styles.title}>{item.label}</Text>
              <Pressable onPress={() => handleDelete(item.id)} hitSlop={8}>
                <Text style={styles.deleteText}>삭제</Text>
              </Pressable>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      <Pressable style={[styles.cta, adding && styles.ctaDisabled]} disabled={adding} onPress={handleAdd}>
        <Text style={styles.ctaText}>{adding ? '등록 중...' : '+ 결제수단 등록'}</Text>
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
