import { supabase } from './supabase';

// 전화번호 SMS 인증 사업자가 아직 없어서 진짜 인증코드 확인은 못 한다(리포트 5/8/11장).
// 그래도 "전화번호 = 계정"은 실제로 동작해야 하므로, Supabase 이메일/비밀번호 인증을 내부적으로 써서
// 전화번호를 로그인 식별자로 쓴다 — 사용자에게는 전화번호 입력창 하나만 보인다.
// 주의: 비밀번호가 전화번호 자체라 그 번호를 아는 사람은 누구나 로그인할 수 있다. 이 앱은 배송지/전화번호 모두
// 자기입력만으로 인증되는 신뢰 모델이라 일관되지만, 실제 서비스 전에는 반드시 SMS OTP로 교체할 것.
function credentialsFor(phone: string) {
  return { email: `${phone}@gonggu-user.app`, password: phone };
}

export async function signInOrSignUpByPhone(phone: string): Promise<{ isNewUser: boolean }> {
  const { email, password } = credentialsFor(phone);
  console.log('Auth attempt:', { email, phone });

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  console.log('SignIn result:', { data: signInData, error: signInError });
  if (!signInError) return { isNewUser: false };

  console.log('SignUp attempt...');
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  console.log('SignUp result:', { data: signUpData, error: signUpError });
  if (signUpError) throw signUpError;
  return { isNewUser: true };
}
