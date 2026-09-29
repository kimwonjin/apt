import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertRequest, subscribeAlertHost } from '../lib/alert';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';

// 웹 전용 알림 오버레이. RN의 <Modal>은 react-native-web에서 겹침/포털 처리가
// 애매해서(AddressSearch.web.tsx도 같은 이유로 회피) position:'fixed' 오버레이로 직접 그린다.
// App.tsx 최상단에 한 번만 마운트하면, 앱 어디서든 lib/alert의 Alert.alert(...)로 띄울 수 있다.
export function AlertHost() {
  const [request, setRequest] = useState<AlertRequest | null>(null);

  useEffect(() => subscribeAlertHost(setRequest), []);

  if (Platform.OS !== 'web' || !request) return null;

  const dismiss = (btn: AlertRequest['buttons'][number]) => {
    setRequest(null);
    btn.onPress?.();
  };

  return (
    <View style={overlayStyle} pointerEvents="box-none">
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <View style={styles.card}>
          <Text style={styles.title}>{request.title}</Text>
          {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
          <View style={styles.buttonRow}>
            {request.buttons.map((b, i) => (
              <Pressable key={i} style={styles.button} onPress={() => dismiss(b)}>
                <Text
                  style={[
                    styles.buttonText,
                    b.style === 'destructive' && styles.destructiveText,
                    b.style === 'cancel' && styles.cancelText,
                  ]}
                >
                  {b.text ?? '확인'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

// 웹 전용 CSS 값(fixed/vw/vh)이라 RN StyleSheet 타입으로는 표현이 안 돼 별도로 캐스팅.
const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  zIndex: 9999,
  backgroundColor: 'rgba(0,0,0,0.4)',
  alignItems: 'center',
  justifyContent: 'center',
} as any;

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  card: {
    width: '84%',
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  message: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, marginTop: spacing.md },
  button: { paddingVertical: 6, paddingHorizontal: 4 },
  buttonText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },
  cancelText: { color: colors.textSecondary, fontWeight: fontWeight.medium },
  destructiveText: { color: colors.danger },
});
