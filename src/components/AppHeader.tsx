import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAppState } from '../state/AppStateContext';
import { useNotifications } from '../hooks/useNotifications';
import { supabase } from '../lib/supabase';
import { colors, fontSize, fontWeight, radius, screenPadding, spacing } from '../theme';

export function AppHeader({ title }: { title: string }) {
  const navigation = useNavigation<any>();
  const { logout, isAdmin } = useAppState();
  const { unreadCount, refresh: refreshNotifications } = useNotifications();
  const [menuOpen, setMenuOpen] = useState(false);
  const [devLabel, setDevLabel] = useState('');

  useFocusEffect(
    useCallback(() => {
      refreshNotifications();
    }, [refreshNotifications])
  );

  // ponytail: 개발 중 어느 테스트 계정으로 로그인돼 있는지 확인하려고 넣은 디버그용 표시.
  // 실제 서비스 배포 전에 이 useEffect와 아래 devLabel Text 블록 통째로 삭제할 것.
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('name, phone').eq('id', user.id).maybeSingle();
      setDevLabel(`${data?.name || '이름없음'} · ${data?.phone || '번호없음'}`);
    })();
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
  };

  const handleAdminPress = () => {
    setMenuOpen(false);
    navigation.getParent()?.navigate('내정보', { screen: 'Admin' });
  };

  return (
    <>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.getParent()?.navigate('홈')} hitSlop={8}>
          <Text style={styles.logo}>🏠</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => navigation.getParent()?.navigate('홈', { screen: 'Notifications' })}
            hitSlop={8}
            style={styles.bellWrap}
          >
            <Text style={styles.bell}>🔔</Text>
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable onPress={() => setMenuOpen((v) => !v)} hitSlop={8}>
            <Text style={styles.hamburger}>☰</Text>
          </Pressable>
        </View>
      </View>

      {!!devLabel && <Text style={styles.devLabel}>DEV: {devLabel}</Text>}

      {menuOpen && (
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuPanel}>
            {isAdmin && (
              <Pressable style={styles.menuItem} onPress={handleAdminPress}>
                <Text style={styles.menuItemText}>관리자 페이지</Text>
              </Pressable>
            )}
            <Pressable style={styles.menuItem} onPress={handleLogout}>
              <Text style={styles.menuItemText}>로그아웃</Text>
            </Pressable>
          </View>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
  },
  logo: { fontSize: fontSize.title },
  headerTitle: { flex: 1, fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.textPrimary },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hamburger: { fontSize: fontSize.title, color: colors.textPrimary },
  bellWrap: { position: 'relative' },
  bell: { fontSize: fontSize.title },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: { color: colors.white, fontSize: 9, fontWeight: fontWeight.bold },
  devLabel: {
    fontSize: fontSize.base,
    color: colors.white,
    backgroundColor: colors.danger,
    paddingHorizontal: screenPadding,
    paddingVertical: 2,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  menuPanel: {
    position: 'absolute',
    top: 44,
    right: screenPadding,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    minWidth: 140,
    paddingVertical: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
    zIndex: 11,
  },
  menuItem: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  menuItemText: { fontSize: fontSize.md, color: colors.textPrimary },
});
