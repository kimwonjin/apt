import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { uploadPhoto } from '../../lib/storage';
import { formatPrice } from '../../lib/format';
import { DEFAULT_DISCOUNT_TABLE, TIME_SLOT_LABEL, TimeSlot } from '../../lib/discount';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

// 매트릭스에 사람이 직접 입력하는 인원 구간 (5명 미만은 스펙상 항상 0%라 편집 대상에서 제외).
const DISCOUNT_TIERS = [5, 10, 20] as const;
const TIME_SLOTS: TimeSlot[] = ['offpeak', 'peak'];

function defaultDiscountInputs(): Record<TimeSlot, Record<number, string>> {
  const percentOf = (slot: TimeSlot, floor: number) => String(DEFAULT_DISCOUNT_TABLE[slot].find(([f]) => f === floor)?.[1] ?? 0);
  return Object.fromEntries(
    TIME_SLOTS.map((slot) => [slot, Object.fromEntries(DISCOUNT_TIERS.map((t) => [t, percentOf(slot, t)]))])
  ) as Record<TimeSlot, Record<number, string>>;
}

type Props = NativeStackScreenProps<MyPageStackParamList, 'Admin'>;

interface Restaurant {
  id: string;
  name: string;
  category: string | null;
  phone: string | null;
  address: string | null;
}
interface Menu {
  id: string;
  name: string;
  category: string | null;
  photo_url: string | null;
  base_price: number;
  min_headcount: number;
}

// 운영자용 최소 관리 화면. 구독그룹(subscription_groups)은 아직 Supabase 대시보드에서 관리.
// 파일럿 단계라 식당 셀프 등록은 없음 — 사장님한테 정보/사진을 받아 운영자가 대신 입력.
export function AdminScreen({ navigation }: Props) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // 식당 등록 폼
  const [rName, setRName] = useState('');
  const [rCategory, setRCategory] = useState('');
  const [rPhone, setRPhone] = useState('');
  const [rAddress, setRAddress] = useState('');
  const [rBankName, setRBankName] = useState('');
  const [rAccountNumber, setRAccountNumber] = useState('');
  const [rAccountHolder, setRAccountHolder] = useState('');

  // 메뉴 등록 폼
  const [mName, setMName] = useState('');
  const [mCategory, setMCategory] = useState('');
  const [mPrice, setMPrice] = useState('');
  const [mMinHeadcount, setMMinHeadcount] = useState('3');
  const [mPhotoUri, setMPhotoUri] = useState<string | null>(null);
  const [mPhotoUploading, setMPhotoUploading] = useState(false);
  const [discountInputs, setDiscountInputs] = useState(defaultDiscountInputs);

  const setDiscountCell = (slot: TimeSlot, tier: number, value: string) => {
    setDiscountInputs((prev) => ({ ...prev, [slot]: { ...prev[slot], [tier]: value } }));
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('restaurants').select('id, name, category, phone, address').order('name');
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
      .select('id, name, category, photo_url, base_price, min_headcount')
      .eq('restaurant_id', r.id)
      .order('name');
    setMenus(data ?? []);
  }, []);

  const resetRestaurantForm = () => {
    setRName('');
    setRCategory('');
    setRPhone('');
    setRAddress('');
    setRBankName('');
    setRAccountNumber('');
    setRAccountHolder('');
  };

  const addRestaurant = async () => {
    if (!rName.trim() || busy) return;
    setBusy(true);
    await supabase.from('restaurants').insert({
      name: rName.trim(),
      category: rCategory.trim() || null,
      phone: rPhone.trim() || null,
      address: rAddress.trim() || null,
      bank_name: rBankName.trim() || null,
      account_number: rAccountNumber.trim() || null,
      account_holder: rAccountHolder.trim() || null,
    });
    resetRestaurantForm();
    setBusy(false);
    refresh();
  };

  const pickMenuPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setMPhotoUri(result.assets[0].uri);
    }
  };

  const addMenu = async () => {
    if (!selected || !mName.trim() || !Number(mPrice) || busy) return;
    setBusy(true);
    try {
      let photoUrl: string | null = null;
      if (mPhotoUri) {
        setMPhotoUploading(true);
        photoUrl = await uploadPhoto(mPhotoUri, 'menus');
      }
      const { data: newMenu, error: menuError } = await supabase
        .from('menus')
        .insert({
          restaurant_id: selected.id,
          name: mName.trim(),
          category: mCategory.trim() || null,
          photo_url: photoUrl,
          base_price: Number(mPrice),
          min_headcount: Number(mMinHeadcount) || 3,
        })
        .select('id')
        .single();

      if (!menuError && newMenu) {
        const tierRows = TIME_SLOTS.flatMap((slot) =>
          DISCOUNT_TIERS.map((tier) => ({
            menu_id: newMenu.id,
            time_slot: slot,
            min_headcount: tier,
            discount_percent: Number(discountInputs[slot][tier]) || 0,
          }))
        );
        await supabase.from('menu_discount_tiers').insert(tierRows);
      }

      setMName('');
      setMCategory('');
      setMPrice('');
      setMMinHeadcount('3');
      setMPhotoUri(null);
      setDiscountInputs(defaultDiscountInputs());
      loadMenus(selected);
    } finally {
      setMPhotoUploading(false);
      setBusy(false);
    }
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

          <Text style={styles.formLabel}>사장님한테 받은 정보로 입력해요</Text>
          <View style={styles.formRow}>
            <TextInput style={[styles.input, { flex: 2 }]} placeholder="식당 이름" placeholderTextColor={colors.textDisabled} value={rName} onChangeText={setRName} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="분류" placeholderTextColor={colors.textDisabled} value={rCategory} onChangeText={setRCategory} />
          </View>
          <View style={styles.formRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="전화번호"
              placeholderTextColor={colors.textDisabled}
              value={rPhone}
              onChangeText={setRPhone}
              keyboardType="phone-pad"
            />
            <TextInput style={[styles.input, { flex: 2 }]} placeholder="주소" placeholderTextColor={colors.textDisabled} value={rAddress} onChangeText={setRAddress} />
          </View>
          <Text style={styles.formLabel}>정산 계좌</Text>
          <View style={styles.formRow}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="은행명" placeholderTextColor={colors.textDisabled} value={rBankName} onChangeText={setRBankName} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="계좌번호"
              placeholderTextColor={colors.textDisabled}
              value={rAccountNumber}
              onChangeText={setRAccountNumber}
              keyboardType="number-pad"
            />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="예금주" placeholderTextColor={colors.textDisabled} value={rAccountHolder} onChangeText={setRAccountHolder} />
          </View>
          <Pressable style={styles.addBtn} onPress={addRestaurant} disabled={busy}>
            <Text style={styles.addBtnText}>+ 식당 추가</Text>
          </Pressable>

          {selected && (
            <>
              <Text style={styles.sectionLabel}>{selected.name} 메뉴</Text>
              {menus.map((m) => (
                <View key={m.id} style={styles.row}>
                  {m.photo_url ? <Image source={{ uri: m.photo_url }} style={styles.menuThumb} /> : <View style={[styles.menuThumb, styles.menuThumbEmpty]} />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowText}>{m.name}</Text>
                    <Text style={styles.rowSub}>
                      {m.category ? `${m.category} · ` : ''}
                      {formatPrice(m.base_price)} · 최소 {m.min_headcount}명
                    </Text>
                  </View>
                </View>
              ))}
              <View style={styles.formRow}>
                <TextInput style={[styles.input, { flex: 2 }]} placeholder="메뉴 이름" placeholderTextColor={colors.textDisabled} value={mName} onChangeText={setMName} />
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="분류" placeholderTextColor={colors.textDisabled} value={mCategory} onChangeText={setMCategory} />
              </View>
              <View style={styles.formRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="정가"
                  placeholderTextColor={colors.textDisabled}
                  value={mPrice}
                  onChangeText={setMPrice}
                  keyboardType="number-pad"
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="최소 성사 인원"
                  placeholderTextColor={colors.textDisabled}
                  value={mMinHeadcount}
                  onChangeText={setMMinHeadcount}
                  keyboardType="number-pad"
                />
              </View>
              <Text style={styles.formLabel}>시간대 × 인원별 할인율(%) — 5명 미만은 항상 0%</Text>
              <View style={styles.matrix}>
                <View style={styles.matrixRow}>
                  <Text style={[styles.matrixCell, styles.matrixHeaderCell]} />
                  {DISCOUNT_TIERS.map((tier) => (
                    <Text key={tier} style={[styles.matrixCell, styles.matrixHeaderText]}>
                      {tier}명+
                    </Text>
                  ))}
                </View>
                {TIME_SLOTS.map((slot) => (
                  <View key={slot} style={styles.matrixRow}>
                    <View style={[styles.matrixCell, styles.matrixHeaderCell]}>
                      <Text style={styles.matrixHeaderText}>{TIME_SLOT_LABEL[slot].name}</Text>
                      <Text style={styles.matrixHeaderHint}>({TIME_SLOT_LABEL[slot].hint})</Text>
                    </View>
                    {DISCOUNT_TIERS.map((tier) => (
                      <View key={tier} style={[styles.matrixCell, styles.matrixInputWrap]}>
                        <TextInput
                          style={styles.matrixInput}
                          value={discountInputs[slot][tier]}
                          onChangeText={(v) => setDiscountCell(slot, tier, v)}
                          keyboardType="number-pad"
                          placeholder="0"
                          placeholderTextColor={colors.textDisabled}
                        />
                        <Text style={styles.matrixPercentSign}>%</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
              <Pressable style={styles.photoPicker} onPress={pickMenuPhoto}>
                {mPhotoUri ? (
                  <Image source={{ uri: mPhotoUri }} style={styles.photoPreview} />
                ) : (
                  <Text style={styles.photoPickerText}>+ 메뉴 사진 선택</Text>
                )}
              </Pressable>
              <Pressable style={styles.addBtn} onPress={addMenu} disabled={busy}>
                {mPhotoUploading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.addBtnText}>+ 메뉴 추가</Text>
                )}
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
  formLabel: { fontSize: fontSize.base, color: colors.textTertiary, marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md },
  rowActive: { borderWidth: 1, borderColor: colors.primary },
  rowText: { fontSize: fontSize.md, color: colors.textPrimary, fontWeight: fontWeight.medium },
  rowSub: { fontSize: fontSize.base, color: colors.textSecondary },
  menuThumb: { width: 40, height: 40, borderRadius: radius.sm },
  menuThumbEmpty: { backgroundColor: colors.divider },
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
  matrix: { gap: 6, marginTop: spacing.xs },
  matrixRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  matrixCell: { flex: 1 },
  matrixHeaderCell: { alignItems: 'center' },
  matrixHeaderText: { fontSize: fontSize.base, color: colors.textSecondary, fontWeight: fontWeight.medium, textAlign: 'center' },
  matrixHeaderHint: { fontSize: 11, color: colors.textTertiary, textAlign: 'center' },
  matrixInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    minHeight: 40,
    paddingHorizontal: 4,
  },
  matrixInput: { flex: 1, textAlign: 'right', fontSize: fontSize.md, color: colors.textPrimary, padding: 0 },
  matrixPercentSign: { fontSize: fontSize.base, color: colors.textSecondary, marginLeft: 2 },
  photoPicker: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.divider,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPickerText: { color: colors.textTertiary, fontSize: fontSize.base },
  photoPreview: { width: '100%', height: 120 },
  addBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', marginTop: spacing.xs },
  addBtnText: { color: colors.white, fontWeight: fontWeight.semibold },
  note: { fontSize: fontSize.base, color: colors.textTertiary, marginTop: spacing.lg },
});
