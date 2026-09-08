import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { formatRelative } from '../../lib/format';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing, minTouchSize } from '../../theme';

type Props = NativeStackScreenProps<MyPageStackParamList, 'Admin'>;

const TABS = ['인증 승인', '전체 고객'] as const;
type Tab = (typeof TABS)[number];

const ROLE_LABEL: Record<string, string> = { leader: '공구대장', seller: '판매자' };

interface ApplicationRow {
  id: string;
  user_id: string;
  role: string;
  note: string | null;
  created_at: string;
  applicantName: string;
  sellerInfo?: {
    business_no: string;
    business_name: string;
    representative_name: string;
    business_address: string;
    address_zip: string;
    business_type: string;
    telecom_reg_num: string;
    bank_name: string;
    account_number: string;
    account_holder: string;
  };
}

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
}

interface RoleAppInfo {
  id: string;
  status: string;
}

type RoleAppMap = Record<string, Partial<Record<'leader' | 'seller', RoleAppInfo>>>;

const ROLE_STATUS_LABEL: Record<string, string> = {
  none: '미신청',
  pending: '심사중',
  approved: '승인',
  rejected: '반려',
};

export function AdminScreen({ navigation }: Props) {
  const [tab, setTab] = useState<Tab>('인증 승인');
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [roleAppMap, setRoleAppMap] = useState<RoleAppMap>({});
  const [loading, setLoading] = useState(true);
  const [selectedSeller, setSelectedSeller] = useState<ApplicationRow | null>(null);

  const loadApplications = useCallback(async () => {
    const { data: apps } = await supabase
      .from('role_applications')
      .select('id, user_id, role, note, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    const userIds = [...new Set((apps ?? []).map((a) => a.user_id))];
    const [{ data: profiles }, { data: sellers }] = await Promise.all([
      userIds.length
        ? supabase.from('profiles').select('id, name, phone').in('id', userIds)
        : { data: [] as { id: string; name: string; phone: string | null }[] },
      userIds.length
        ? supabase.from('seller_profiles').select('*').in('user_id', userIds)
        : { data: [] as any[] },
    ]);

    const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.name?.trim() || p.phone || '이름 없음']));
    const sellerMap = new Map((sellers ?? []).map((s) => [s.user_id, s]));

    setRows(
      (apps ?? []).map((a) => ({
        ...a,
        applicantName: nameMap.get(a.user_id) || '이름 없음',
        sellerInfo: a.role === 'seller' ? sellerMap.get(a.user_id) : undefined,
      }))
    );
  }, []);

  const loadCustomers = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, phone, created_at')
      .order('created_at', { ascending: false })
      .returns<CustomerRow[]>();
    console.log('loadCustomers result:', { data, error });
    setCustomers(data ?? []);

    // 사람마다 최신 신청 1건만 의미 있어서, created_at 내림차순으로 받아 먼저 나온 것만 채택한다.
    const { data: apps } = await supabase
      .from('role_applications')
      .select('id, user_id, role, status, created_at')
      .order('created_at', { ascending: false });

    const map: RoleAppMap = {};
    for (const a of apps ?? []) {
      const role = a.role as 'leader' | 'seller';
      map[a.user_id] = map[a.user_id] ?? {};
      if (!map[a.user_id][role]) {
        map[a.user_id][role] = { id: a.id, status: a.status };
      }
    }
    setRoleAppMap(map);
  }, []);

  const revoke = async (applicationId: string) => {
    setRoleAppMap((prev) => {
      const next: RoleAppMap = {};
      for (const [userId, roles] of Object.entries(prev)) {
        next[userId] = { ...roles };
        for (const role of ['leader', 'seller'] as const) {
          if (roles[role]?.id === applicationId) {
            next[userId][role] = { id: applicationId, status: 'rejected' };
          }
        }
      }
      return next;
    });
    await supabase
      .from('role_applications')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', applicationId);
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      Promise.all([loadApplications(), loadCustomers()]).then(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [loadApplications, loadCustomers])
  );

  useEffect(() => {
    const subscription = supabase
      .channel('role_applications_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'role_applications' }, (payload) => {
        if (payload.new.status === 'pending') {
          Alert.alert('새로운 승인 요청', `새로운 ${payload.new.role} 역할 신청이 들어왔습니다.`, [
            { text: '확인', onPress: loadApplications },
          ]);
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [loadApplications]);

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    const app = rows.find((r) => r.id === id);
    if (!app) return;

    setRows((prev) => prev.filter((r) => r.id !== id));
    await supabase.from('role_applications').update({ status, reviewed_at: new Date().toISOString() }).eq('id', id);

    if (status === 'approved') {
      const roleLabel = ROLE_LABEL[app.role] ?? app.role;
      await supabase.from('notifications').insert({
        user_id: app.user_id,
        type: 'role_approved',
        payload: { role: app.role, roleLabel },
      });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>관리자 페이지</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <Pressable key={t} style={[styles.tab, t === tab && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, t === tab && styles.tabTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : tab === '인증 승인' ? (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>대기 중인 신청이 없어요.</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => setSelectedSeller(item)}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {item.applicantName} · {ROLE_LABEL[item.role] ?? item.role}
                </Text>
                {item.sellerInfo && <Text style={styles.cardNote}>{item.sellerInfo.business_name}</Text>}
                {item.note && <Text style={styles.cardNote}>{item.note}</Text>}
              </View>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>가입한 고객이 없어요.</Text>}
          renderItem={({ item }) => {
            const roles = roleAppMap[item.id] ?? {};
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{item.name?.trim() || item.phone || '이름 없음'}</Text>
                <Text style={styles.cardNote}>{item.phone || '전화번호 미등록'}</Text>
                <Text style={styles.cardTime}>가입 {formatRelative(item.created_at)}</Text>
                <View style={styles.roleBadgeRow}>
                  {(['leader', 'seller'] as const).map((role) => {
                    const info = roles[role];
                    const status = info?.status ?? 'none';
                    const approved = status === 'approved';
                    return (
                      <Pressable
                        key={role}
                        style={[styles.roleBadge, approved && styles.roleBadgeApproved]}
                        onPress={approved && info ? () => revoke(info.id) : undefined}
                      >
                        <Text style={[styles.roleBadgeText, approved && styles.roleBadgeTextApproved]}>
                          {ROLE_LABEL[role]}: {ROLE_STATUS_LABEL[status]}
                          {approved ? ' (탭하여 취소)' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      <Modal visible={!!selectedSeller} transparent animationType="slide" onRequestClose={() => setSelectedSeller(null)}>
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setSelectedSeller(null)} hitSlop={8}>
              <Text style={styles.back}>‹</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{selectedSeller?.role === 'seller' ? '판매자 정보' : '공구대장 신청'}</Text>
            <View style={{ width: 24 }} />
          </View>

          {selectedSeller?.role === 'leader' && (
            <>
              <View style={styles.modalContent}>
                <Text style={styles.cardTitle}>{selectedSeller.applicantName}</Text>
                <Text style={styles.cardNote}>공구대장 신청</Text>
              </View>
              <View style={styles.modalBtnRow}>
                <Pressable style={[styles.btn, styles.rejectBtn]} onPress={() => { if (selectedSeller) decide(selectedSeller.id, 'rejected'); setSelectedSeller(null); }}>
                  <Text style={styles.rejectBtnText}>반려</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.approveBtn]} onPress={() => { if (selectedSeller) decide(selectedSeller.id, 'approved'); setSelectedSeller(null); }}>
                  <Text style={styles.approveBtnText}>승인</Text>
                </Pressable>
              </View>
            </>
          )}

          {selectedSeller?.sellerInfo && (
            <>
              <ScrollView style={styles.modalContent}>
                <View style={styles.detailSection}>
                  <DetailRow label="사업자등록번호" value={selectedSeller.sellerInfo.business_no} />
                  <DetailRow label="상호명" value={selectedSeller.sellerInfo.business_name} />
                  <DetailRow label="대표자명" value={selectedSeller.sellerInfo.representative_name} />
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionLabel}>사업장 정보</Text>
                  <DetailRow label="주소" value={selectedSeller.sellerInfo.business_address} />
                  <DetailRow label="우편번호" value={selectedSeller.sellerInfo.address_zip} />
                  <DetailRow label="업태" value={selectedSeller.sellerInfo.business_type} />
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionLabel}>통신판매 인증</Text>
                  <DetailRow label="신고번호" value={selectedSeller.sellerInfo.telecom_reg_num} />
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionLabel}>정산 계좌</Text>
                  <DetailRow label="은행명" value={selectedSeller.sellerInfo.bank_name} />
                  <DetailRow label="계좌번호" value={selectedSeller.sellerInfo.account_number} />
                  <DetailRow label="예금주명" value={selectedSeller.sellerInfo.account_holder} />
                </View>
              </ScrollView>

              <View style={styles.modalBtnRow}>
                <Pressable style={[styles.btn, styles.rejectBtn]} onPress={() => { decide(selectedSeller.id, 'rejected'); setSelectedSeller(null); }}>
                  <Text style={styles.rejectBtnText}>반려</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.approveBtn]} onPress={() => { decide(selectedSeller.id, 'approved'); setSelectedSeller(null); }}>
                  <Text style={styles.approveBtnText}>승인</Text>
                </Pressable>
              </View>
            </>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
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
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.fillSubtle,
    borderRadius: radius.pill,
    padding: 4,
    marginHorizontal: screenPadding,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: colors.card },
  tabText: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium },
  tabTextActive: { color: colors.primary, fontWeight: fontWeight.semibold },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: screenPadding },
  emptyText: { fontSize: fontSize.md, color: colors.textTertiary },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  cardTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  cardNote: { fontSize: fontSize.md, color: colors.textSecondary },
  cardTime: { fontSize: fontSize.base, color: colors.textTertiary },
  roleBadgeRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  roleBadge: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.fillSubtle },
  roleBadgeApproved: { backgroundColor: colors.primaryLight },
  roleBadgeText: { fontSize: fontSize.base, color: colors.textSecondary, fontWeight: fontWeight.medium },
  roleBadgeTextApproved: { color: colors.primaryDark, fontWeight: fontWeight.semibold },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  btn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center' },
  rejectBtn: { backgroundColor: colors.fillSubtle },
  rejectBtnText: { color: colors.textSecondary, fontWeight: fontWeight.semibold },
  approveBtn: { backgroundColor: colors.primary },
  approveBtnText: { color: colors.white, fontWeight: fontWeight.semibold },
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  modalContent: { flex: 1, paddingHorizontal: screenPadding, paddingVertical: spacing.md },
  detailSection: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, marginVertical: spacing.sm, gap: spacing.md },
  sectionLabel: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  detailRow: { gap: spacing.xs },
  detailLabel: { fontSize: fontSize.base, color: colors.textSecondary },
  detailValue: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  modalBtnRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: screenPadding, paddingBottom: spacing.lg },
});
