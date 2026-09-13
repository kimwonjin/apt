import { Alert as RNAlert, Platform } from 'react-native';

// react-native-web의 Alert.alert()는 완전히 빈 함수라(node_modules/react-native-web/.../Alert)
// 웹에서 호출해도 아무 일도 안 일어난다. 그래서 처음엔 window.alert/confirm으로 대체했는데,
// 브라우저(특히 iOS 사파리)가 한 페이지에서 대화상자가 반복되면 "추가 대화상자 표시 안 함"을
// 자동으로 걸어버려서 이후 호출이 조용히 씹히는 문제가 있었다. 앱 안에서 직접 그리는
// 오버레이(AlertHost, App.tsx에 마운트)로 바꿔서 이 문제를 근본적으로 없앤다.

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}
export interface AlertRequest {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
}

type Listener = (req: AlertRequest) => void;
let listener: Listener | null = null;
let nextId = 1;

/** AlertHost 전용 — 마운트 시 구독, 언마운트 시 해제. */
export function subscribeAlertHost(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

function alert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    RNAlert.alert(title, message, buttons as any);
    return;
  }
  const finalButtons = buttons && buttons.length > 0 ? buttons : [{ text: '확인' }];
  if (listener) {
    listener({ id: nextId++, title, message, buttons: finalButtons });
  } else {
    // AlertHost가 아직 마운트되기 전이면 최후 수단.
    window.alert(message ? `${title}\n\n${message}` : title);
    finalButtons[0]?.onPress?.();
  }
}

export const Alert = { alert };
