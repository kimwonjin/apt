import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';
import { MyPageStackParamList } from '../../navigation/types';
import type { DaumAddressResult } from '../../components/AddressSearch';
import { colors, fontSize, spacing } from '../../theme';

type Props = NativeStackScreenProps<MyPageStackParamList, 'AddressSearchModal'>;

const HTML = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
  <style>html,body,#layer{height:100%;margin:0;padding:0;}</style>
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

export function AddressSearchScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Pressable style={styles.close} onPress={() => navigation.goBack()} hitSlop={8}>
        <Text style={styles.closeText}>닫기</Text>
      </Pressable>
      <WebView
        style={styles.webview}
        originWhitelist={['*']}
        source={{ html: HTML }}
        onMessage={(event) => {
          const data = JSON.parse(event.nativeEvent.data);
          navigation.navigate('SellerRegistration', {
            selectedAddress: {
              buildingName: data.buildingName,
              apartment: data.apartment,
              roadAddress: data.roadAddress,
              jibunAddress: data.jibunAddress,
              sido: data.sido,
              sigungu: data.sigungu,
              zonecode: data.zonecode,
            },
          });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  close: { alignSelf: 'flex-end', padding: spacing.md },
  closeText: { color: colors.textSecondary, fontSize: fontSize.md },
  webview: { flex: 1 },
});
