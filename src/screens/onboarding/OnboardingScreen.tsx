import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppState } from '../../state/AppStateContext';
import { supabase } from '../../lib/supabase';
import { signInOrSignUpByPhone } from '../../lib/auth';
import { AddressSearch, type DaumAddressResult } from '../../components/AddressSearch';
import { findOrCreateApartment, type ApartmentOption } from '../../lib/apartments';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

const SLIDES = [
  { title: '우리 아파트에서, 뭐든 저렴하게', body: '이웃과 함께 모이면 더 싸게 살 수 있어요.' },
  { title: '믿을 수 있는 이웃, 공구대장이 함께해요', body: '검수부터 분배·시공 조율까지 공구대장이 챙겨드려요.' },
  { title: '가구부터 시공까지, 우리 단지 맞춤 견적', body: '같은 평형·구조라 견적이 표준화돼요.' },
];

const PHONE_STEP = SLIDES.length;
const PROFILE_STEP = SLIDES.length + 1;
const VERIFY_STEP = SLIDES.length + 2;

// 디자인 컨셉/온보딩 리포트 기준: 3개 인트로 슬라이드 + 전화번호 로그인/가입 + 프로필 설정(이름) +
// 배송지 등록(단지+동/호). 전화번호가 곧 계정이라(src/lib/auth.ts), 이미 가입된 번호면 나머지
// 단계 없이 바로 앱으로 들어간다. 활동명 별도 없이 이름을 그대로 profiles.name(공개 표시용)에 쓴다.
export function OnboardingScreen() {
  const { refreshVerification, refreshRoleApplications } = useAppState();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<ApartmentOption | null>(null);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [dong, setDong] = useState('');
  const [ho, setHo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [phoneSubmitting, setPhoneSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [realName, setRealName] = useState('');
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const isPhoneStep = step === PHONE_STEP;
  const isProfileStep = step === PROFILE_STEP;
  const isVerifyStep = step === VERIFY_STEP;
  const isSlideStep = !isPhoneStep && !isProfileStep && !isVerifyStep;

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  };

  const handlePhoneSubmit = async () => {
    if (!phone.trim() || phoneSubmitting) return;
    setPhoneSubmitting(true);
    setPhoneError(null);
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      setPhone(formatPhone(cleanPhone));
      const { isNewUser } = await signInOrSignUpByPhone(cleanPhone);
      console.log('SignInOrSignUp result:', { isNewUser });
      if (!isNewUser) {
        // 기존 계정: 프로필/배송지 확인
        console.log('Existing user, checking profile and residency...');
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', user.id)
            .maybeSingle();

          if (!profile?.name || profile.name.trim() === '') {
            // 프로필 없음 → 이름 입력 단계로 이동
            console.log('User has no name, go to profile step...');
            setRealName('');
            setStep(PROFILE_STEP);
          } else {
            // 프로필 있음 → 배송지 확인
            const { data: residency } = await supabase
              .from('residencies')
              .select('id')
              .eq('user_id', user.id)
              .maybeSingle();

            if (residency) {
              // 배송지 있음 → 앱 진입
              console.log('User has profile and residency, entering app...');
              await Promise.all([refreshVerification(), refreshRoleApplications()]);
            } else {
              // 배송지 없음 → 배송지 등록 단계로 이동
              console.log('User has no residency, go to verify step...');
              setStep(VERIFY_STEP);
            }
          }
        }
      } else {
        // 새 계정: 이름 입력 단계로 이동
        setStep(PROFILE_STEP);
      }
    } catch (e) {
      console.error('handlePhoneSubmit error:', e);
      setPhoneError(e instanceof Error ? e.message : '로그인에 실패했어요. 다시 시도해주세요.');
    } finally {
      setPhoneSubmitting(false);
    }
  };

  const handleProfileSubmit = async () => {
    if (!realName.trim() || profileSubmitting) return;
    setProfileSubmitting(true);
    setProfileError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setProfileError('로그인 세션이 없습니다. 앱을 다시 시작해주세요.');
      setProfileSubmitting(false);
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, phone: phone.trim(), name: realName.trim() }, { onConflict: 'id' });

    setProfileSubmitting(false);
    if (error) {
      setProfileError(error.message);
      return;
    }
    setStep(VERIFY_STEP);
  };

  const handleAddressSelect = async (addr: DaumAddressResult) => {
    setErrorMsg(null);
    setResolvingAddress(true);
    try {
      const apartment = await findOrCreateApartment(addr);
      setSelected(apartment);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '주소를 등록하지 못했어요. 다시 시도해주세요.');
    } finally {
      setResolvingAddress(false);
    }
  };

  const handleSubmit = async () => {
    if (!selected || !dong.trim() || !ho.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setErrorMsg('로그인 세션이 없습니다. 앱을 다시 시작해주세요.');
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from('residencies').insert({
      user_id: user.id,
      apartment_id: selected.id,
      dong: dong.trim(),
      ho: ho.trim(),
      verified: true,
      verified_at: new Date().toISOString(),
    });

    setSubmitting(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    await refreshVerification();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {isSlideStep && (
        <Pressable style={styles.skip} onPress={() => setStep(PHONE_STEP)} hitSlop={8}>
          <Text style={styles.skipText}>건너뛰기</Text>
        </Pressable>
      )}

      <View style={styles.content}>
        {isPhoneStep ? (
          <>
            <Text style={styles.title}>전화번호로 시작하기</Text>
            <Text style={styles.body}>전화번호만 입력하면 가입/로그인이 한 번에 처리돼요.</Text>
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="전화번호"
                placeholderTextColor={colors.textDisabled}
                value={phone}
                onChangeText={(value) => setPhone(formatPhone(value))}
                keyboardType="phone-pad"
                returnKeyType="done"
                onSubmitEditing={handlePhoneSubmit}
              />
              {phoneError && <Text style={styles.errorText}>{phoneError}</Text>}
            </View>
          </>
        ) : isProfileStep ? (
          <>
            <Text style={styles.title}>프로필 설정</Text>
            <Text style={styles.body}>이름을 입력해주세요.</Text>
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="이름"
                placeholderTextColor={colors.textDisabled}
                value={realName}
                onChangeText={setRealName}
              />
              {profileError && <Text style={styles.errorText}>{profileError}</Text>}
            </View>
          </>
        ) : isVerifyStep ? (
          <>
            <Text style={styles.title}>배송지 등록</Text>
            <Text style={styles.body}>주소를 검색하고 동·호수를 입력해주세요.</Text>
            <View style={styles.form}>
              {selected ? (
                <View style={styles.selectedRow}>
                  <Text style={styles.selectedText}>{selected.name}</Text>
                  <Pressable onPress={() => setSelected(null)} hitSlop={8}>
                    <Text style={styles.changeText}>변경</Text>
                  </Pressable>
                </View>
              ) : (
                <AddressSearch onSelect={handleAddressSelect}>
                  {(open) => (
                    <Pressable
                      style={[styles.input, styles.addressButton]}
                      onPress={open}
                      disabled={resolvingAddress}
                    >
                      {resolvingAddress ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : (
                        <Text style={{ color: colors.textDisabled, fontSize: fontSize.lg }}>주소 검색</Text>
                      )}
                    </Pressable>
                  )}
                </AddressSearch>
              )}

              <TextInput
                style={styles.input}
                placeholder="동"
                placeholderTextColor={colors.textDisabled}
                value={dong}
                onChangeText={setDong}
                keyboardType="number-pad"
              />
              <TextInput
                style={styles.input}
                placeholder="호"
                placeholderTextColor={colors.textDisabled}
                value={ho}
                onChangeText={setHo}
                keyboardType="number-pad"
              />
              {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
            </View>
          </>
        ) : (
          <>
            <View style={styles.mascot} />
            <Text style={styles.title}>{SLIDES[step].title}</Text>
            <Text style={styles.body}>{SLIDES[step].body}</Text>
          </>
        )}
      </View>

      {isSlideStep && (
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>
      )}

      <Pressable
        style={[
          styles.cta,
          isPhoneStep && (!phone.trim() || phoneSubmitting) && styles.ctaDisabled,
          isProfileStep && (!realName.trim() || profileSubmitting) && styles.ctaDisabled,
          isVerifyStep && (!selected || !dong.trim() || !ho.trim() || submitting) && styles.ctaDisabled,
        ]}
        disabled={
          (isPhoneStep && (!phone.trim() || phoneSubmitting)) ||
          (isProfileStep && (!realName.trim() || profileSubmitting)) ||
          (isVerifyStep && (!selected || !dong.trim() || !ho.trim() || submitting))
        }
        onPress={
          isPhoneStep
            ? handlePhoneSubmit
            : isProfileStep
            ? handleProfileSubmit
            : isVerifyStep
            ? handleSubmit
            : () => setStep((s) => s + 1)
        }
      >
        {submitting || profileSubmitting || phoneSubmitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.ctaText}>{isVerifyStep ? '등록하고 시작하기' : '다음'}</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: screenPadding },
  skip: { alignSelf: 'flex-end', paddingVertical: spacing.sm },
  skipText: { color: colors.textSecondary, fontSize: fontSize.md },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  mascot: {
    width: 180,
    height: 180,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight,
    marginBottom: spacing.md,
  },
  title: { fontSize: fontSize.display, fontWeight: fontWeight.bold, color: colors.textPrimary, textAlign: 'center' },
  body: { fontSize: fontSize.xl, color: colors.textSecondary, textAlign: 'center' },
  form: { width: '100%', gap: spacing.sm, marginTop: spacing.lg },
  input: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: minTouchSize,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
  },
  addressButton: { justifyContent: 'center' },
  selectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: minTouchSize,
  },
  selectedText: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.primaryDark },
  changeText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.semibold },
  errorText: { color: colors.danger, fontSize: fontSize.md },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, marginBottom: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.divider },
  dotActive: { backgroundColor: colors.primary },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: colors.white, fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
});
