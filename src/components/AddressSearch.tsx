import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { colors, fontSize, spacing } from '../theme';
import type { DaumAddressResult } from './addressTypes';

export type { DaumAddressResult };

interface Props {
  onSelect: (result: DaumAddressResult) => void;
  children: (open: () => void) => React.ReactNode;
}

const HTML = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
  <style>
    html, body, #layer {
      height: 100%;
      margin: 0;
      padding: 0;
    }
    * {
      box-sizing: border-box;
    }
  </style>
</head>
<body>
  <div id="layer"></div>
  <script>
    new daum.Postcode({
      oncomplete: function (data) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      },
      width: '100%',
      height: '100%'
    }).embed(document.getElementById('layer'));
  </script>
</body>
</html>`;

// 다음 우편번호 서비스는 웹 위젯이라 네이티브에서는 WebView로 감싸 embed 모드로 띄운다.
export function AddressSearch({ onSelect, children }: Props) {
  const [visible, setVisible] = useState(false);
  const { width, height } = useWindowDimensions();

  React.useEffect(() => {
    if (Platform.OS === 'web' && visible) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      return () => {
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      };
    }
  }, [visible]);

  if (Platform.OS === 'web' && visible) {
    return (
      <>
        {children(() => setVisible(true))}
        <>
          <View
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              backgroundColor: 'rgba(0, 0, 0, 1)',
              zIndex: 9998,
              pointerEvents: 'none',
            } as any}
          />
          <View
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              pointerEvents: 'box-none',
            } as any}
          >
            <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <Pressable style={styles.close} onPress={() => setVisible(false)} hitSlop={8}>
              <Text style={styles.closeText}>닫기</Text>
            </Pressable>
            <WebView
              style={styles.webview}
              originWhitelist={['*']}
              scalePageToFit={true}
              source={{ html: HTML }}
              onMessage={(event) => {
                const data = JSON.parse(event.nativeEvent.data);
                setVisible(false);
                onSelect({
                  buildingName: data.buildingName,
                  apartment: data.apartment,
                  roadAddress: data.roadAddress,
                  jibunAddress: data.jibunAddress,
                  sido: data.sido,
                  sigungu: data.sigungu,
                  zonecode: data.zonecode,
                });
              }}
            />
          </SafeAreaView>
          </View>
          </>
        </>
      </>
    );
  }

  return (
    <>
      {children(() => setVisible(true))}
      <Modal
        visible={visible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.backdrop}>
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <Pressable style={styles.close} onPress={() => setVisible(false)} hitSlop={8}>
              <Text style={styles.closeText}>닫기</Text>
            </Pressable>
            <WebView
              style={styles.webview}
              originWhitelist={['*']}
              scalePageToFit={true}
              source={{ html: HTML }}
              onMessage={(event) => {
                const data = JSON.parse(event.nativeEvent.data);
                setVisible(false);
                onSelect({
                  buildingName: data.buildingName,
                  apartment: data.apartment,
                  roadAddress: data.roadAddress,
                  jibunAddress: data.jibunAddress,
                  sido: data.sido,
                  sigungu: data.sigungu,
                  zonecode: data.zonecode,
                });
              }}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  container: { flex: 1, backgroundColor: colors.background },
  close: { alignSelf: 'flex-end', padding: spacing.md },
  closeText: { color: colors.textSecondary, fontSize: fontSize.md },
  webview: { flex: 1 },
});
