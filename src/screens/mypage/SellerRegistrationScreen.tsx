import React, { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { AddressSearch, type DaumAddressResult } from '../../components/AddressSearch';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<MyPageStackParamList, 'SellerRegistration'>;

export function SellerRegistrationScreen({ navigation, route }: Props) {
  const scrollViewRef = useRef<ScrollView>(null);
  const fieldRefsMap = useRef<Record<string, number>>({});
  const [businessNo, setBusinessNo] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [representativeName, setRepresentativeName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [addressZip, setAddressZip] = useState('');
  const [businessAddressDetail, setBusinessAddressDetail] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [telecomRegNum, setTelecomRegNum] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  // route.params에서 주소 받기
  React.useEffect(() => {
    if (route.params?.selectedAddress) {
      const addr = route.params.selectedAddress;
      setBusinessAddress(addr.roadAddress || addr.jibunAddress);
      setAddressZip(addr.zonecode);
    }
  }, [route.params?.selectedAddress]);

  const fieldOrder = ['businessNo', 'businessName', 'representativeName', 'businessType', 'businessAddress', 'businessAddressDetail', 'telecomRegNum', 'bankName', 'accountNumber', 'accountHolder'];

  const handleAddressSelect = (addr: DaumAddressResult) => {
    setBusinessAddress(addr.roadAddress || addr.jibunAddress);
    setAddressZip(addr.zonecode);
  };

  const validateFields = () => {
    const newErrors: Record<string, boolean> = {};
    if (!businessNo.trim()) newErrors.businessNo = true;
    if (!businessName.trim()) newErrors.businessName = true;
    if (!representativeName.trim()) newErrors.representativeName = true;
    // 주소는 선택사항
    if (!businessType.trim()) newErrors.businessType = true;
    if (!telecomRegNum.trim()) newErrors.telecomRegNum = true;
    if (!bankName.trim()) newErrors.bankName = true;
    if (!accountNumber.trim()) newErrors.accountNumber = true;
    if (!accountHolder.trim()) newErrors.accountHolder = true;
    setErrors(newErrors);

    // 첫 번째 에러 필드로 스크롤
    if (Object.keys(newErrors).length > 0) {
      const firstErrorField = fieldOrder.find((field) => newErrors[field]);
      if (firstErrorField && fieldRefsMap.current[firstErrorField] !== undefined) {
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ y: Math.max(0, fieldRefsMap.current[firstErrorField] - 150), animated: true });
        }, 100);
      }
    }

    return Object.keys(newErrors).length === 0;
  };

  const formatBusinessNo = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 10)}`;
  };


  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMsg(null);

    if (!validateFields()) {
      setErrorMsg('필드를 모두 입력해주세요.');
      setSubmitting(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setErrorMsg('로그인 세션이 없습니다.');
      setSubmitting(false);
      return;
    }

    const { error: profileError } = await supabase.from('seller_profiles').upsert({
      user_id: user.id,
      business_no: businessNo.replace(/\D/g, ''),
      business_name: businessName.trim(),
      representative_name: representativeName.trim(),
      business_address: `${businessAddress.trim()} ${businessAddressDetail.trim()}`,
      address_zip: addressZip.trim(),
      business_type: businessType.trim(),
      telecom_reg_num: telecomRegNum.trim(),
      bank_name: bankName.trim(),
      account_number: accountNumber.trim(),
      account_holder: accountHolder.trim(),
      status: 'pending',
    });

    setSubmitting(false);
    if (profileError) {
      setErrorMsg(profileError.message);
      return;
    }

    // role_applications에 데이터가 없으면 insert
    const { data: existing } = await supabase
      .from('role_applications')
      .select('id')
      .eq('user_id', user.id)
      .eq('role', 'seller')
      .maybeSingle();

    if (!existing) {
      const { error: appError } = await supabase.from('role_applications').insert({
        user_id: user.id,
        role: 'seller',
        status: 'pending',
      });

      if (appError) {
        setErrorMsg(appError.message);
        return;
      }
    }

    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>판매자 정보 등록</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView ref={scrollViewRef} style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.sectionTitle}>기본 정보</Text>
        <View
          onLayout={(e) => {
            fieldRefsMap.current['businessNo'] = e.nativeEvent.layout.y;
          }}
        >
          <TextInput
            style={[styles.input, errors.businessNo && styles.inputError]}
            placeholder="사업자등록번호"
            placeholderTextColor={colors.textDisabled}
            value={businessNo}
            onChangeText={(value) => {
              setBusinessNo(formatBusinessNo(value));
              if (value.trim()) setErrors((e) => ({ ...e, businessNo: false }));
            }}
            keyboardType="number-pad"
          />
        </View>
        <View onLayout={(e) => { fieldRefsMap.current['businessName'] = e.nativeEvent.layout.y; }}>
          <TextInput
            style={[styles.input, errors.businessName && styles.inputError]}
            placeholder="상호(법인명)"
            placeholderTextColor={colors.textDisabled}
            value={businessName}
            onChangeText={(value) => {
              setBusinessName(value);
              if (value.trim()) setErrors((e) => ({ ...e, businessName: false }));
            }}
          />
        </View>
        <View onLayout={(e) => { fieldRefsMap.current['representativeName'] = e.nativeEvent.layout.y; }}>
          <TextInput
            style={[styles.input, errors.representativeName && styles.inputError]}
            placeholder="대표자 성명"
            placeholderTextColor={colors.textDisabled}
            value={representativeName}
            onChangeText={(value) => {
              setRepresentativeName(value);
              if (value.trim()) setErrors((e) => ({ ...e, representativeName: false }));
            }}
          />
        </View>
        <View onLayout={(e) => { fieldRefsMap.current['businessAddress'] = e.nativeEvent.layout.y; }}>
          {businessAddress ? (
            <View style={[styles.selectedAddressRow, errors.businessAddress && styles.selectedAddressRowError]}>
              <View>
                <Text style={styles.selectedAddressLabel}>기본 주소</Text>
                <Text style={styles.selectedAddressText}>{`(${addressZip}) ${businessAddress}`}</Text>
              </View>
              <Pressable onPress={() => { setBusinessAddress(''); setAddressZip(''); setBusinessAddressDetail(''); setErrors((e) => ({ ...e, businessAddress: false, businessAddressDetail: false })); }} hitSlop={8}>
                <Text style={styles.changeText}>변경</Text>
              </Pressable>
            </View>
          ) : (
            <AddressSearch onSelect={handleAddressSelect}>
              {(open) => (
                <Pressable
                  style={[styles.input, styles.addressButton, errors.businessAddress && styles.inputError]}
                  onPress={open}
                >
                  <Text style={{ color: colors.textDisabled, fontSize: fontSize.lg }}>
                    주소 검색
                  </Text>
                </Pressable>
              )}
            </AddressSearch>
          )}
        </View>
        {businessAddress && (
          <TextInput
            style={[styles.input, errors.businessAddressDetail && styles.inputError]}
            placeholder="상세주소 입력"
            placeholderTextColor={colors.textDisabled}
            value={businessAddressDetail}
            onChangeText={(value) => {
              setBusinessAddressDetail(value);
              if (value.trim()) setErrors((e) => ({ ...e, businessAddressDetail: false }));
            }}
          />
        )}

        <Text style={[styles.sectionTitle, errors.businessType && styles.errorLabel]}>업태</Text>
        <View onLayout={(e) => { fieldRefsMap.current['businessType'] = e.nativeEvent.layout.y; }}>
          <TextInput
            style={[styles.input, errors.businessType && styles.inputError]}
            placeholder="업태"
            placeholderTextColor={colors.textDisabled}
            value={businessType}
            onChangeText={(value) => {
              setBusinessType(value);
              if (value.trim()) setErrors((e) => ({ ...e, businessType: false }));
            }}
          />
        </View>

        <Text style={[styles.sectionTitle, errors.telecomRegNum && styles.errorLabel]}>통신판매업 신고</Text>
        <View onLayout={(e) => { fieldRefsMap.current['telecomRegNum'] = e.nativeEvent.layout.y; }}>
          <TextInput
            style={[styles.input, errors.telecomRegNum && styles.inputError]}
            placeholder="통신판매업 신고번호 (예: 제 2026-서울강남-0000 호)"
            placeholderTextColor={colors.textDisabled}
            value={telecomRegNum}
            onChangeText={(value) => {
              setTelecomRegNum(value);
              if (value.trim()) setErrors((e) => ({ ...e, telecomRegNum: false }));
            }}
          />
        </View>

        <Text style={[styles.sectionTitle, (errors.bankName || errors.accountNumber || errors.accountHolder) && styles.errorLabel]}>정산 계좌 정보</Text>
        <View onLayout={(e) => { fieldRefsMap.current['bankName'] = e.nativeEvent.layout.y; }}>
          <TextInput
            style={[styles.input, errors.bankName && styles.inputError]}
            placeholder="은행명"
            placeholderTextColor={colors.textDisabled}
            value={bankName}
            onChangeText={(value) => {
              setBankName(value);
              if (value.trim()) setErrors((e) => ({ ...e, bankName: false }));
            }}
          />
        </View>
        <View onLayout={(e) => { fieldRefsMap.current['accountNumber'] = e.nativeEvent.layout.y; }}>
          <TextInput
            style={[styles.input, errors.accountNumber && styles.inputError]}
            placeholder="계좌번호"
            placeholderTextColor={colors.textDisabled}
            value={accountNumber ? Number(accountNumber).toLocaleString('ko-KR') : ''}
            onChangeText={(value) => {
              const digits = value.replace(/\D/g, '');
              setAccountNumber(digits);
              if (digits.trim()) setErrors((e) => ({ ...e, accountNumber: false }));
            }}
            keyboardType="number-pad"
          />
        </View>
        <View onLayout={(e) => { fieldRefsMap.current['accountHolder'] = e.nativeEvent.layout.y; }}>
          <TextInput
            style={[styles.input, errors.accountHolder && styles.inputError]}
            placeholder="예금주명"
            placeholderTextColor={colors.textDisabled}
            value={accountHolder}
            onChangeText={(value) => {
              setAccountHolder(value);
              if (value.trim()) setErrors((e) => ({ ...e, accountHolder: false }));
            }}
          />
        </View>

        <Text style={styles.infoText}>
          ⓘ 모든 정보는 정확하게 입력해주세요. 서류 심사 후 승인된 상호명으로만 상품을 올릴 수 있습니다.
        </Text>

        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      </ScrollView>

      <Pressable
        style={[styles.cta, submitting && styles.ctaDisabled]}
        disabled={submitting}
        onPress={handleSubmit}
      >
        {submitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.ctaText}>등록 신청하기</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
  },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  content: { flex: 1 },
  contentContainer: { paddingHorizontal: screenPadding, paddingVertical: spacing.md, gap: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: minTouchSize,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
  },
  inputError: { borderColor: colors.danger, borderWidth: 2 },
  addressButton: { justifyContent: 'center' },
  selectedAddressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  selectedAddressRowError: { borderColor: colors.danger, borderWidth: 2 },
  selectedAddressLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  selectedAddressText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginTop: 4 },
  changeText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.semibold },
  errorLabel: { color: colors.danger },
  infoText: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 22 },
  errorText: { color: colors.danger, fontSize: fontSize.md },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: screenPadding,
    marginBottom: spacing.lg,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: colors.white, fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
});
