// 토스페이먼츠 테스트 연동. 지금은 공개 테스트 키(누구나 가입 없이 쓸 수 있는 샌드박스 키)라
// 실제 돈은 절대 오가지 않는다.
//
// 주의: 시크릿 키를 여기서 클라이언트 번들에 그대로 쓰고 있다. 테스트 키는 토스가 만인에게
// 공개한 샌드박스 키라 노출돼도 문제없지만, 나중에 실키(live key)로 바꿀 땐 issueBillingKey /
// chargeBilling 두 함수를 반드시 Supabase Edge Function 등 서버 쪽으로 옮겨야 한다 —
// 실키가 클라이언트 번들에 있으면 누구나 그 키로 결제를 승인/취소할 수 있어 위험하다.

export const TOSS_CLIENT_KEY = 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq';
const TOSS_SECRET_KEY = 'test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R';

async function tossApi<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.tosspayments.com${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`${TOSS_SECRET_KEY}:`)}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message ?? '토스 결제 API 오류');
  return json as T;
}

export interface TossBillingCard {
  company: string;
  number: string; // 마스킹된 카드번호, 예: "1234-56**-****-1234"
}
export interface TossBillingKeyResult {
  billingKey: string;
  card: TossBillingCard;
}

/** 카드 등록(빌링 인증) 완료 후 돌아온 authKey로 실제 빌링키를 발급받는다. */
export function issueBillingKey(authKey: string, customerKey: string) {
  return tossApi<TossBillingKeyResult>('/v1/billing/authorizations/issue', { authKey, customerKey });
}

export interface TossChargeResult {
  paymentKey: string;
  status: string; // 'DONE' 이면 승인 성공
  totalAmount: number;
}

/** 등록된 빌링키로 실제 결제를 승인 요청한다(성사 확정 시 운영자가 실행). */
export function chargeBilling(
  billingKey: string,
  opts: { customerKey: string; amount: number; orderId: string; orderName: string }
) {
  return tossApi<TossChargeResult>(`/v1/billing/${billingKey}`, opts);
}

/** 카드 등록 화면 리다이렉트에서 돌아왔을 때 URL에 붙는 쿼리 파라미터. */
export function parseBillingAuthParams(search: string): { authKey: string; customerKey: string } | null {
  const params = new URLSearchParams(search);
  const authKey = params.get('authKey');
  const customerKey = params.get('customerKey');
  if (!authKey || !customerKey) return null;
  return { authKey, customerKey };
}

// 웹 전용: 다음 우편번호 검색(AddressSearch.web.tsx)과 같은 방식으로 SDK 스크립트를 동적 로드.
let sdkPromise: Promise<void> | null = null;
function loadTossSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).TossPayments) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.tosspayments.com/v2/standard';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('결제 SDK를 불러오지 못했어요.'));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

/**
 * 카드 등록(빌링 인증) 화면으로 이동한다. 카드사 인증 특성상 새 창이 아니라 페이지 자체가
 * 이동하며, 완료되면 지금 이 URL(쿼리파라미터만 붙어서)로 되돌아온다 — 처리는
 * AppStateContext에서 앱 시작 시 한 번 담당(parseBillingAuthParams + issueBillingKey).
 */
export async function requestCardRegistration(customerKey: string): Promise<void> {
  await loadTossSdk();
  const tossPayments = (window as any).TossPayments(TOSS_CLIENT_KEY);
  const payment = tossPayments.payment({ customerKey });
  const returnUrl = window.location.origin + window.location.pathname;
  await payment.requestBillingAuth('CARD', { successUrl: returnUrl, failUrl: returnUrl });
}
