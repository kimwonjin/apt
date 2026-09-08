import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Role } from '../types/domain';
import { supabase } from '../lib/supabase';

export type VerificationStatus = 'checking' | 'none' | 'verified';
export type ApplicationStatus = 'none' | 'pending' | 'approved' | 'rejected';

interface AppState {
  bootstrapping: boolean;
  verificationStatus: VerificationStatus;
  apartmentId: string | null;
  apartmentName: string;
  role: Role;
  setRole: (r: Role) => void;
  refreshVerification: () => Promise<void>;
  leaderStatus: ApplicationStatus;
  sellerStatus: ApplicationStatus;
  refreshRoleApplications: () => Promise<void>;
  logout: () => Promise<void>;
}

const AppStateContext = createContext<AppState | null>(null);

interface ResidencyRow {
  apartment_id: string;
  verified: boolean;
  apartments: { name: string } | { name: string }[] | null;
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('checking');
  const [apartmentId, setApartmentId] = useState<string | null>(null);
  const [apartmentName, setApartmentName] = useState('');
  const [role, setRole] = useState<Role>('구매자');
  const [leaderStatus, setLeaderStatus] = useState<ApplicationStatus>('none');
  const [sellerStatus, setSellerStatus] = useState<ApplicationStatus>('none');

  const refreshRoleApplications = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // user_id 필터를 꼭 걸어야 한다 — 관리자 계정은 RLS상 전체 신청 내역이 보이므로
    // (관리자 페이지에서 다른 사람 신청을 승인해야 하니까), 필터가 없으면 남의 상태를 자기 것으로 읽는다.
    const { data, error } = await supabase
      .from('role_applications')
      .select('role, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[role_applications] 조회 실패:', error.message);
      return;
    }
    const leader = data?.find((r) => r.role === 'leader');
    const seller = data?.find((r) => r.role === 'seller');
    setLeaderStatus((leader?.status as ApplicationStatus) ?? 'none');
    setSellerStatus((seller?.status as ApplicationStatus) ?? 'none');
  }, []);

  const refreshVerification = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setVerificationStatus('none');
      return;
    }

    const { data, error } = await supabase
      .from('residencies')
      .select('apartment_id, verified, apartments(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<ResidencyRow>();

    if (error) {
      console.warn('[residency] 조회 실패:', error.message);
      setVerificationStatus('none');
      return;
    }
    if (!data) {
      setVerificationStatus('none');
      return;
    }

    setApartmentId(data.apartment_id);
    const apt = Array.isArray(data.apartments) ? data.apartments[0] : data.apartments;
    setApartmentName(apt?.name ?? '');
    setVerificationStatus(data.verified ? 'verified' : 'none');
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          await Promise.all([refreshVerification(), refreshRoleApplications()]);
        } else {
          setVerificationStatus('none');
        }
      } catch (e) {
        console.warn('[auth] 세션 확인 실패:', e instanceof Error ? e.message : e);
        setVerificationStatus('none');
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [refreshVerification, refreshRoleApplications]);

  // 전화번호 로그인 계정 자체를 로그아웃한다 — 다시 쓰려면 온보딩에서 같은 전화번호로 로그인해야 한다.
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setApartmentId(null);
    setApartmentName('');
    setVerificationStatus('none');
    setLeaderStatus('none');
    setSellerStatus('none');
    setRole('구매자');
  }, []);

  const value = useMemo(
    () => ({
      bootstrapping,
      verificationStatus,
      apartmentId,
      apartmentName,
      role,
      setRole,
      refreshVerification,
      leaderStatus,
      sellerStatus,
      refreshRoleApplications,
      logout,
    }),
    [
      bootstrapping,
      verificationStatus,
      apartmentId,
      apartmentName,
      role,
      refreshVerification,
      leaderStatus,
      sellerStatus,
      refreshRoleApplications,
      logout,
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
