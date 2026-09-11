import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { issueBillingKey, parseBillingAuthParams } from '../lib/toss';

export type VerificationStatus = 'checking' | 'none' | 'verified';

interface AppState {
  bootstrapping: boolean;
  verificationStatus: VerificationStatus;
  buildingId: string | null;
  buildingName: string;
  isAdmin: boolean;
  refreshVerification: () => Promise<void>;
  logout: () => Promise<void>;
}

const AppStateContext = createContext<AppState | null>(null);

interface MembershipRow {
  building_id: string;
  verified: boolean;
  buildings: { name: string } | { name: string }[] | null;
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('checking');
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [buildingName, setBuildingName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const refreshVerification = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setVerificationStatus('none');
      return;
    }

    const { data, error } = await supabase
      .from('building_memberships')
      .select('building_id, verified, buildings(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<MembershipRow>();

    if (error || !data) {
      if (error) console.warn('[membership] 조회 실패:', error.message);
      setVerificationStatus('none');
      return;
    }

    setBuildingId(data.building_id);
    const b = Array.isArray(data.buildings) ? data.buildings[0] : data.buildings;
    setBuildingName(b?.name ?? '');
    setVerificationStatus(data.verified ? 'verified' : 'none');

    const { data: admin } = await supabase.rpc('is_admin');
    setIsAdmin(!!admin);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) await refreshVerification();
        else setVerificationStatus('none');
      } catch (e) {
        console.warn('[auth] 세션 확인 실패:', e instanceof Error ? e.message : e);
        setVerificationStatus('none');
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [refreshVerification]);

  // 토스 카드 등록(빌링 인증) 화면에서 돌아왔을 때 처리. React Navigation이 URL과 화면을
  // 안 묶어놔서 어느 화면으로 돌아올지 알 수 없어 앱 진입점인 여기서 한 번만 처리한다.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const parsed = parseBillingAuthParams(window.location.search);
    if (!parsed) return;
    // 먼저 URL을 정리해 새로고침/재실행 시 중복 처리되지 않게 한다.
    window.history.replaceState({}, '', window.location.pathname);
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const result = await issueBillingKey(parsed.authKey, parsed.customerKey);
        const { error } = await supabase.from('payment_methods').insert({
          user_id: user.id,
          label: `${result.card.company} ${result.card.number}`,
          billing_key: result.billingKey,
          customer_key: parsed.customerKey,
        });
        if (error) throw error;
        Alert.alert('카드 등록 완료', '이제 공구에 참여할 수 있어요.');
      } catch (e) {
        Alert.alert('카드 등록 실패', e instanceof Error ? e.message : '다시 시도해주세요.');
      }
    })();
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setBuildingId(null);
    setBuildingName('');
    setIsAdmin(false);
    setVerificationStatus('none');
  }, []);

  const value = useMemo(
    () => ({
      bootstrapping,
      verificationStatus,
      buildingId,
      buildingName,
      isAdmin,
      refreshVerification,
      logout,
    }),
    [bootstrapping, verificationStatus, buildingId, buildingName, isAdmin, refreshVerification, logout]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
