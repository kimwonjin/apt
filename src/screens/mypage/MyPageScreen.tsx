import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useAppState } from '../../state/AppStateContext';
import { supabase } from '../../lib/supabase';
import { AppHeader } from '../../components/AppHeader';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';
import { MyPageStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MyPageStackParamList, 'MyPageHome'>;

const MENUS: { label: string; route: keyof MyPageStackParamList }[] = [
  { label: '나의 참여 공구', route: 'MyParticipations' },
  { label: '정산 내역', route: 'Settlement' },
  { label: '빌딩 관리', route: 'BuildingManage' },
  { label: '결제수단 관리', route: 'PaymentMethods' },
  { label: '알림', route: 'Notifications' },
];

export function MyPageScreen({ navigation }: Props) {
  const { buildingName, isAdmin } = useAppState();
  const [myName, setMyName] = useState('');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from('profiles').select('name').eq('id', user.id).maybeSingle();
        setMyName(data?.name || '나');
      })();
    }, [])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="내정보" />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.profileRow}>
          <View style={styles.avatar} />
          <View>
            <Text style={styles.name}>{myName}</Text>
            <Text style={styles.sub}>{buildingName || '빌딩'} 인증완료 ✓</Text>
          </View>
        </View>

        <View style={styles.menuList}>
          {MENUS.map(({ label, route }) => (
            <Pressable key={label} style={styles.menuRow} onPress={() => navigation.navigate(route as never)}>
              <Text style={styles.menuLabel}>{label}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>

        {isAdmin && (
          <View style={styles.menuList}>
            <Text style={styles.adminLabel}>운영자</Text>
            <Pressable style={styles.menuRow} onPress={() => navigation.navigate('OrderQueue' as never)}>
              <Text style={styles.menuLabel}>주문 요청 관리</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
            <Pressable style={styles.menuRow} onPress={() => navigation.navigate('RestaurantSettlement' as never)}>
              <Text style={styles.menuLabel}>식당 정산 관리</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
            <Pressable style={styles.menuRow} onPress={() => navigation.navigate('Admin' as never)}>
              <Text style={styles.menuLabel}>식당·메뉴·구독 관리</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: screenPadding, paddingBottom: spacing.xl },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.fillSubtle },
  name: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.textPrimary },
  sub: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },
  menuList: { marginTop: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden' },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  menuLabel: { fontSize: fontSize.lg, color: colors.textPrimary },
  chevron: { fontSize: fontSize.title, color: colors.textDisabled },
  adminLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
});
