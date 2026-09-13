import { Alert as RNAlert, Platform } from 'react-native';

// react-native-web의 Alert.alert()는 완전히 빈 함수라(node_modules/react-native-web/.../Alert)
// 웹에서 호출해도 아무 일도 안 일어난다 — 버튼도 안 뜨고 onPress도 안 불림.
// 이 앱은 웹이 주 배포 경로라 이 차이를 그대로 두면 "카드 등록해주세요" 같은 중요한
// 안내가 웹에서만 조용히 씹힌다. RN의 Alert.alert와 같은 시그니처로 웹은
// window.alert/confirm으로 동작하게 감싼다.

interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

function alert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    RNAlert.alert(title, message, buttons as any);
    return;
  }

  const text = message ? `${title}\n\n${message}` : title;

  if (!buttons || buttons.length === 0) {
    window.alert(text);
    return;
  }
  if (buttons.length === 1) {
    window.alert(text);
    buttons[0].onPress?.();
    return;
  }

  // 버튼 2개 이상은 confirm(취소 vs 확인)으로 단순화.
  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  const confirmBtn = buttons.find((b) => b !== cancelBtn) ?? buttons[buttons.length - 1];
  if (window.confirm(text)) {
    confirmBtn?.onPress?.();
  } else {
    cancelBtn?.onPress?.();
  }
}

export const Alert = { alert };
