import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

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
