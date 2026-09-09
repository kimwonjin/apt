import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { formatPrice } from '../../lib/format';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<MyPageStackParamList, 'Admin'>;

interface Restaurant {
  id: string;
  name: string;
  category: string | null;
}
interface Menu {
  id: string;
  name: string;
  base_price: number;
  min_headcount: number;
}

// 운영자용 최소 관리 화면. 구독그룹(subscription_groups)은 아직 Supabase 대시보드에서 관리.
export function AdminScreen({ navigation }: Props) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [rName, setRName] = useState('');
  const [rCategory, setRCategory] = useState('');
  const [mName, setMName] = useState('');
  const [mPrice, setMPrice] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('restaurants').select('id, name, category').order('name');
    setRestaurants(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const loadMenus = useCallback(async (r: Restaurant) => {
    setSelected(r);
    const { data } = await supabase
      .from('menus')
      .select('id, name, base_price, min_headcount')
      .eq('restaurant_id', r.id)
      .order('name');
    setMenus(data ?? []);
  }, []);

  const addRestaurant = async () => {
    if (!rName.trim() || busy) return;
    setBusy(true);
    await supabase.from('restaurants').insert({ name: rName.trim(), category: rCategory.trim() || null });
    setRName('');
    setRCategory('');
    setBusy(false);
    refresh();
  };

  const addMenu = async () => {
    if (!selected || !mName.trim() || !Number(mPrice) || busy) return;
    setBusy(true);
    await supabase.from('menus').insert({ restaurant_id: selected.id, name: mName.trim(), base_price: Number(mPrice) });
    setMName('');
    setMPrice('');
    setBusy(false);
    loadMenus(selected);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>식당·메뉴 관리</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionLabel}>식당</Text>
          {restaurants.map((r) => (
            <Pressable key={r.id} style={[styles.row, selected?.id === r.id && styles.rowActive]} onPress={() => loadMenus(r)}>
              <Text style={styles.rowText}>{r.name}</Text>
              <Text style={styles.rowSub}>{r.category ?? '-'}</Text>
            </Pressable>
          ))}
          <View style={styles.formRow}>
            <TextInput style={[styles.input, { flex: 2 }]} placeholder="식당 이름" placeholderTextColor={colors.textDisabled} value={rName} onChangeText={setRName} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="분류" placeholderTextColor={colors.textDisabled} value={rCategory} onChangeText={setRCategory} />
          </View>
          <Pressable style={styles.addBtn} onPress={addRestaurant} disabled={busy}>
            <Text style={styles.addBtnText}>+ 식당 추가</Text>
          </Pressable>

          {selected && (
            <>
              <Text style={styles.sectionLabel}>{selected.name} 메뉴</Text>
              {menus.map((m) => (
                <View key={m.id} style={styles.row}>
                  <Text style={styles.rowText}>{m.name}</Text>
                  <Text style={styles.rowSub}>
                    {formatPrice(m.base_price)} · 최소 {m.min_headcount}명
                  </Text>
                </View>
              ))}
              <View style={styles.formRow}>
                <TextInput style={[styles.input, { flex: 2 }]} placeholder="메뉴 이름" placeholderTextColor={colors.textDisabled} value={mName} onChangeText={setMName} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="정가"
                  placeholderTextColor={colors.textDisabled}
                  value={mPrice}
                  onChangeText={setMPrice}
                  keyboardType="number-pad"
                />
              </View>
              <Pressable style={styles.addBtn} onPress={addMenu} disabled={busy}>
                <Text style={styles.addBtnText}>+ 메뉴 추가</Text>
              </Pressable>
            </>
          )}

          <Text style={styles.note}>구독 그룹(요일 다이어트 밥이)은 현재 Supabase 대시보드에서 등록해요.</Text>
        </ScrollView>
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
  scroll: { padding: screenPadding, gap: spacing.xs },
  sectionLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginTop: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md },
  rowActive: { borderWidth: 1, borderColor: colors.primary },
  rowText: { fontSize: fontSize.md, color: colors.textPrimary, fontWeight: fontWeight.medium },
  rowSub: { fontSize: fontSize.base, color: colors.textSecondary },
  formRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: minTouchSize,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  addBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', marginTop: spacing.xs },
  addBtnText: { color: colors.white, fontWeight: fontWeight.semibold },
  note: { fontSize: fontSize.base, color: colors.textTertiary, marginTop: spacing.lg },
});
