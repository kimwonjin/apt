import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useAppState } from '../../state/AppStateContext';
import { supabase } from '../../lib/supabase';
import { AppHeader } from '../../components/AppHeader';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../../theme';
import { LeaderStats, Role } from '../../types/domain';
import { MyPageStackParamList } from '../../navigation/types';

const ROLES: Role[] = ['구매자', '공구대장', '판매자'];
const ROLE_CODE: Record<string, 'leader' | 'seller'> = { 공구대장: 'leader', 판매자: 'seller' };

const MENUS: Record<Role, { label: string; route: keyof MyPageStackParamList | null }[]> = {
  구매자: [
    { label: '나의 참여 공구', route: 'MyParticipations' },
    { label: '찜한 공구', route: 'Wishlist' },
    { label: '팔로우한 공구대장', route: 'FollowingLeaders' },
    { label: '배송지 관리', route: 'ResidencyManage' },
    { label: '결제수단 관리', route: 'PaymentMethods' },
    { label: '후기 관리', route: 'MyReviews' },
  ],
  공구대장: [
    { label: '내가 연 공구', route: 'MyGroupBuys' },
    { label: '받은 견적', route: 'ReceivedQuotes' },
    { label: '정산 내역', route: 'Settlement' },
    { label: '신용도 상세', route: 'CreditDetail' },
    { label: '시공 일정 관리', route: 'InstallSchedule' },
  ],
  판매자: [
    { label: '등록 상품 관리', route: 'SellerProducts' },
    { label: '제시한 견적', route: 'SentQuotes' },
    { label: '컨택 요청함', route: null },
    { label: '정산·세금계산서', route: null },
  ],
};

const ADMIN_MENUS = [
  { label: '관리자 페이지', route: 'Admin' as const },
];

const EMPTY_STATS: LeaderStats = { totalGroupBuys: 0, avgRating: 0, reviewCount: 0 };
const EMPTY_TRUST = { totalCount: 0, receivedCount: 0, rate: 1 };

type Props = NativeStackScreenProps<MyPageStackParamList, 'MyPageHome'>;

export function MyPageScreen({ navigation }: Props) {
  const { role, setRole, apartmentName, leaderStatus, sellerStatus, refreshRoleApplications } = useAppState();
  const [leaderStats, setLeaderStats] = useState<LeaderStats>(EMPTY_STATS);
  const [buyerTrust, setBuyerTrust] = useState(EMPTY_TRUST);
  const [applying, setApplying] = useState(false);
  const [myName, setMyName] = useState('');
  const [sellerProfileExists, setSellerProfileExists] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshRoleApplications();
      (async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase.from('profiles').select('name, roles').eq('id', user.id).maybeSingle();
        setMyName(profile?.name || '이웃');
        setIsAdmin(profile?.roles?.includes('admin') ?? false);

        // seller_profiles 확인
        const { data: seller } = await supabase.from('seller_profiles').select('user_id').eq('user_id', user.id).maybeSingle();
        setSellerProfileExists(!!seller);
      })();
    }, [refreshRoleApplications])
  );

  const applicationStatus = role === '공구대장' ? leaderStatus : role === '판매자' ? sellerStatus : 'approved';

  const handleApply = async () => {
    const code = ROLE_CODE[role];
    if (!code || applying) return;
    setApplying(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('role_applications').insert({ user_id: user.id, role: code });
      await refreshRoleApplications();
    }
    setApplying(false);
  };

  useEffect(() => {
    if (role !== '공구대장') return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('leader_stats')
        .select('total_groupbuys, avg_rating, review_count')
        .eq('user_id', user.id)
        .maybeSingle();

      setLeaderStats(
        data
          ? { totalGroupBuys: data.total_groupbuys, avgRating: data.avg_rating, reviewCount: data.review_count }
          : EMPTY_STATS
      );
    })();
  }, [role]);

  useEffect(() => {
    if (role !== '구매자') return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase.rpc('get_buyer_trust', { target_user_id: user.id }).maybeSingle<{
        total_count: number;
        received_count: number;
        rate: number;
      }>();

      setBuyerTrust(
        data ? { totalCount: data.total_count, receivedCount: data.received_count, rate: data.rate } : EMPTY_TRUST
      );
    })();
  }, [role]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const subscription = supabase
        .channel(`role_applications_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'role_applications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            console.log('role_applications update:', payload);
            if (payload.new.status === 'approved') {
              const roleLabel = payload.new.role === 'leader' ? '공구대장' : '판매자';
              console.log('Approved! Showing alert:', roleLabel);
              Alert.alert('축하합니다! 🎉', `${roleLabel} 승인이 완료되었습니다.`, [
                {
                  text: '확인',
                  onPress: refreshRoleApplications,
                },
              ]);
            }
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    })();
  }, [refreshRoleApplications]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="내정보" />
      <View style={styles.body}>
      <View style={styles.profileRow}>
        <View style={styles.avatar} />
        <View>
          <Text style={styles.name}>{myName || '이웃'}</Text>
          <Text style={styles.sub}>{apartmentName || '우리 아파트'} 등록완료 ✓</Text>
        </View>
      </View>

      {/*
        탭 전환 자체는 자유롭지만, 공구대장/판매자 메뉴 실사용(공구 개설/상품 등록)은
        role_applications 승인 여부로 서버(RLS)에서 실제로 막힘 — 아래 applicationStatus 게이트 참고.
      */}
      <View style={styles.rolePillRow}>
        {ROLES.map((r) => {
          const active = r === role;
          return (
            <Pressable
              key={r}
              style={[styles.rolePill, active && styles.rolePillActive]}
              onPress={() => setRole(r)}
            >
              <Text style={[styles.rolePillText, active && styles.rolePillTextActive]}>{r}</Text>
            </Pressable>
          );
        })}
      </View>

      {role === '구매자' && buyerTrust.totalCount > 0 && (
        <View style={styles.statsRow}>
          <StatCard label="수령 신뢰도" value={`${Math.round(buyerTrust.rate * 100)}%`} />
          <StatCard label="참여 완료" value={`${buyerTrust.receivedCount}건`} />
          <StatCard label="참여 총" value={`${buyerTrust.totalCount}건`} />
        </View>
      )}

      {applicationStatus !== 'approved' ? (
        <View style={styles.applyBox}>
          {role === '판매자' && applicationStatus === 'pending' && !sellerProfileExists ? (
            <>
              <Text style={styles.applyText}>판매자 정보를 등록해주세요.</Text>
              <Pressable style={styles.applyBtn} onPress={() => navigation.navigate('SellerRegistration' as never)}>
                <Text style={styles.applyBtnText}>판매자 정보 등록</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.applyText}>
                {applicationStatus === 'pending'
                  ? '인증 심사 중이에요. 운영자 승인을 기다려주세요.'
                  : applicationStatus === 'rejected'
                  ? '인증이 반려되었어요. 다시 신청할 수 있어요.'
                  : `${role}(으)로 활동하려면 운영자 인증이 필요해요.`}
              </Text>
              {applicationStatus !== 'pending' && (
                <Pressable style={styles.applyBtn} onPress={handleApply} disabled={applying}>
                  <Text style={styles.applyBtnText}>{applying ? '신청 중...' : '인증 신청하기'}</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      ) : (
        <>
          {role === '공구대장' && (
            <View style={styles.statsRow}>
              <StatCard label="진행한 공구" value={`${leaderStats.totalGroupBuys}회`} />
              <StatCard label="만족도" value={`★${leaderStats.avgRating.toFixed(1)}`} />
              <StatCard label="누적 후기" value={`${leaderStats.reviewCount}개`} />
            </View>
          )}

          {role === '판매자' && applicationStatus === 'approved' && (
            <View style={styles.statusBox}>
              <Text style={styles.statusText}>✓ 판매자 등록 완료</Text>
            </View>
          )}

          {role === '판매자' && applicationStatus === 'approved' && (
            <Pressable style={styles.registrationBtn} onPress={() => navigation.navigate('SellerRegistration' as never)}>
              <Text style={styles.registrationBtnText}>판매자 정보 {sellerProfileExists ? '수정' : '등록'}</Text>
            </Pressable>
          )}

          <View style={styles.menuList}>
            {MENUS[role].map(({ label, route }) => (
              <Pressable
                key={label}
                style={styles.menuRow}
                onPress={() => route && navigation.navigate(route as never)}
              >
                <Text style={styles.menuLabel}>{label}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {isAdmin && (
        <View style={styles.menuList}>
          <Text style={styles.adminLabel}>관리자</Text>
          {ADMIN_MENUS.map(({ label, route }) => (
            <Pressable
              key={label}
              style={styles.menuRow}
              onPress={() => navigation.navigate(route as never)}
            >
              <Text style={styles.menuLabel}>{label}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      )}
      </View>
    </SafeAreaView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, paddingHorizontal: screenPadding },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.fillSubtle },
  name: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.textPrimary },
  sub: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },
  rolePillRow: { flexDirection: 'row', backgroundColor: colors.fillSubtle, borderRadius: radius.pill, padding: 4 },
  rolePill: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
  rolePillActive: { backgroundColor: colors.card },
  rolePillText: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: fontWeight.medium },
  rolePillTextActive: { color: colors.primary, fontWeight: fontWeight.semibold },
  statsRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: spacing.sm, alignItems: 'center' },
  statValue: { fontSize: fontSize.xxl, fontWeight: fontWeight.heavy, color: colors.primary },
  statLabel: { fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 },
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
  adminLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textSecondary, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs },
  applyBox: {
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  applyText: { fontSize: fontSize.md, color: colors.textSecondary },
  applyBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  applyBtnText: { color: colors.white, fontWeight: fontWeight.semibold },
  registrationBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: spacing.md, alignItems: 'center', marginTop: spacing.md },
  registrationBtnText: { color: colors.white, fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  statusBox: { backgroundColor: colors.successLight, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md, alignItems: 'center', marginTop: spacing.md },
  statusText: { color: colors.success, fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
});
