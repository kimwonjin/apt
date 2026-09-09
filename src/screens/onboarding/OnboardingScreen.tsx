import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppState } from '../../state/AppStateContext';
import { supabase } from '../../lib/supabase';
import { signInOrSignUpByPhone } from '../../lib/auth';
import { AddressSearch, type DaumAddressResult } from '../../components/AddressSearch';
import { findOrCreateBuilding, type BuildingOption } from '../../lib/buildings';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

const SLIDES = [
  { title: '우리 빌딩에서, 점심을 더 싸게', body: '같은 빌딩 사람들과 모여 시키면 배달비가 확 줄어요.' },
  { title: '많이 모일수록, 더 깎여요', body: '인원과 주문 시간대에 따라 할인율이 실시간으로 올라가요.' },
  { title: '로비에서 한 번에 픽업', body: '층마다 나누지 않고 1층 로비에서 받아가요.' },
];

const PHONE_STEP = SLIDES.length;
const PROFILE_STEP = SLIDES.length + 1;
const VERIFY_STEP = SLIDES.length + 2;

export function OnboardingScreen() {
  const { refreshVerification } = useAppState();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<BuildingOption | null>(null);
  const [company, setCompany] = useState('');
  const [resolvingAddress, setResolvingAddress] = useState(false);
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
    const d = value.replace(/\D/g, '');
    if (d.length <= 3) return d;
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
  };

  const handlePhoneSubmit = async () => {
    if (!phone.trim() || phoneSubmitting) return;
    setPhoneSubmitting(true);
    setPhoneError(null);
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      setPhone(formatPhone(cleanPhone));
      const { isNewUser } = await signInOrSignUpByPhone(cleanPhone);
      if (isNewUser) {
        setStep(PROFILE_STEP);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).maybeSingle();
      if (!profile?.name?.trim()) {
        setStep(PROFILE_STEP);
        return;
      }
      const { data: membership } = await supabase
        .from('building_memberships')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (membership) await refreshVerification();
      else setStep(VERIFY_STEP);
    } catch (e) {
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
      .upsert({ id: user.id, phone: phone.replace(/\D/g, ''), name: realName.trim() }, { onConflict: 'id' });
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
      setSelected(await findOrCreateBuilding(addr));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '주소를 등록하지 못했어요. 다시 시도해주세요.');
    } finally {
      setResolvingAddress(false);
    }
  };

  const handleSubmit = async () => {
    if (!selected) return;
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
    const { error } = await supabase.from('building_memberships').insert({
      user_id: user.id,
      building_id: selected.id,
      company_name: company.trim() || null,
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
                onChangeText={(v) => setPhone(formatPhone(v))}
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
            <Text style={styles.title}>빌딩 인증</Text>
            <Text style={styles.body}>근무하는 빌딩 주소를 검색해주세요. 회사명은 선택이에요.</Text>
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
                placeholder="회사명 (선택)"
                placeholderTextColor={colors.textDisabled}
                value={company}
                onChangeText={setCompany}
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
          isVerifyStep && (!selected || submitting) && styles.ctaDisabled,
        ]}
        disabled={
          (isPhoneStep && (!phone.trim() || phoneSubmitting)) ||
          (isProfileStep && (!realName.trim() || profileSubmitting)) ||
          (isVerifyStep && (!selected || submitting))
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
          <Text style={styles.ctaText}>{isVerifyStep ? '인증하고 시작하기' : '다음'}</Text>
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
  mascot: { width: 180, height: 180, borderRadius: radius.lg, backgroundColor: colors.primaryLight, marginBottom: spacing.md },
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
