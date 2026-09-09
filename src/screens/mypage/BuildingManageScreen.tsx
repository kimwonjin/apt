import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { useAppState } from '../../state/AppStateContext';
import { supabase } from '../../lib/supabase';
import { AddressSearch, type DaumAddressResult } from '../../components/AddressSearch';
import { findOrCreateBuilding, type BuildingOption } from '../../lib/buildings';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<MyPageStackParamList, 'BuildingManage'>;

interface Row {
  id: string;
  companyName: string | null;
  buildingName: string;
}

export function BuildingManageScreen({ navigation }: Props) {
  const { refreshVerification } = useAppState();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<BuildingOption | null>(null);
  const [company, setCompany] = useState('');
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('building_memberships')
      .select('id, company_name, buildings(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setRows(
      (data ?? []).map((r: any) => ({
        id: r.id,
        companyName: r.company_name,
        buildingName: Array.isArray(r.buildings) ? r.buildings[0]?.name : r.buildings?.name,
      }))
    );
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleAddressSelect = async (addr: DaumAddressResult) => {
    setErrorMsg(null);
    setResolvingAddress(true);
    try {
      setSelected(await findOrCreateBuilding(addr));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '주소를 등록하지 못했어요.');
    } finally {
      setResolvingAddress(false);
    }
  };

  const handleAdd = async () => {
    if (!selected) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('building_memberships').insert({
      user_id: user.id,
      building_id: selected.id,
      company_name: company.trim() || null,
    });
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setAdding(false);
    setSelected(null);
    setCompany('');
    await refreshVerification();
    refresh();
  };

  const handleDelete = (id: string) => {
    Alert.alert('빌딩 삭제', '이 빌딩 인증을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('building_memberships').delete().eq('id', id);
          await refreshVerification();
          refresh();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>빌딩 관리</Text>
        <Pressable onPress={() => setAdding((a) => !a)} hitSlop={8}>
          <Text style={styles.addLink}>{adding ? '취소' : '+ 추가'}</Text>
        </Pressable>
      </View>

      {adding && (
        <View style={styles.addForm}>
          {selected ? (
            <View style={styles.selectedRow}>
              <Text style={styles.selectedText}>{selected.name}</Text>
              <Pressable onPress={() => setSelected(null)} hitSlop={8}>
                <Text style={styles.changeText}>변경</Text>
              </Pressable>
            </View>
          ) : (
            <AddressSearch onSelect={handleAddressSelect}>
              {(open) => (
                <Pressable style={[styles.input, styles.addressButton]} onPress={open} disabled={resolvingAddress}>
                  {resolvingAddress ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={{ color: colors.textDisabled, fontSize: fontSize.lg }}>주소 검색</Text>
                  )}
                </Pressable>
              )}
            </AddressSearch>
          )}
          <TextInput
            style={styles.input}
            placeholder="회사명 (선택)"
            placeholderTextColor={colors.textDisabled}
            value={company}
            onChangeText={setCompany}
          />
          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
          <Pressable style={[styles.cta, !selected && styles.ctaDisabled]} disabled={!selected} onPress={handleAdd}>
            <Text style={styles.ctaText}>빌딩 인증</Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.buildingName}</Text>
                <Text style={styles.sub}>
                  {item.companyName ?? '회사명 미입력'} {index === 0 && '· 현재 사용 중'}
                </Text>
              </View>
              <Pressable onPress={() => handleDelete(item.id)} hitSlop={8}>
                <Text style={styles.deleteText}>삭제</Text>
              </Pressable>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
  },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  addLink: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.semibold },
  addForm: { paddingHorizontal: screenPadding, gap: spacing.sm, paddingBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: minTouchSize,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
  },
  addressButton: { justifyContent: 'center' },
  selectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: minTouchSize,
  },
  selectedText: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.primaryDark },
  changeText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.semibold },
  errorText: { color: colors.danger, fontSize: fontSize.md },
  cta: { height: minTouchSize, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: colors.white, fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  deleteText: { fontSize: fontSize.md, color: colors.danger },
});
