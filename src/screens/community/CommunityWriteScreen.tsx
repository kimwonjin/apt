import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommunityStackParamList } from '../../navigation/types';
import { useAppState } from '../../state/AppStateContext';
import { supabase } from '../../lib/supabase';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';
import { CommunityCategory } from '../../types/domain';

type Props = NativeStackScreenProps<CommunityStackParamList, 'CommunityWrite'>;

const CATEGORIES: CommunityCategory[] = ['동네소식', '나눔', '질문', '공구요청', '중고거래'];

export function CommunityWriteScreen({ navigation, route }: Props) {
  const { apartmentId } = useAppState();
  const editPostId = route.params?.editPostId;
  const isEditMode = !!editPostId;

  const [category, setCategory] = useState<CommunityCategory>('동네소식');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditMode);

  useEffect(() => {
    if (isEditMode) {
      (async () => {
        const { data } = await supabase
          .from('community_posts')
          .select('category, title, body')
          .eq('id', editPostId)
          .maybeSingle();

        if (data) {
          setCategory(data.category as CommunityCategory);
          setTitle(data.title);
          setBody(data.body);
        }
        setLoading(false);
      })();
    }
  }, [editPostId, isEditMode]);

  const isValid = apartmentId && title.trim().length > 0 && body.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid || !apartmentId || submitting) return;
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

    let error;
    if (isEditMode) {
      const res = await supabase
        .from('community_posts')
        .update({
          category,
          title: title.trim(),
          body: body.trim(),
        })
        .eq('id', editPostId);
      error = res.error;
    } else {
      const res = await supabase.from('community_posts').insert({
        apartment_id: apartmentId,
        author_id: user.id,
        category,
        title: title.trim(),
        body: body.trim(),
      });
      error = res.error;
    }

    setSubmitting(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    navigation.goBack();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{isEditMode ? '수정' : '글쓰기'}</Text>
        <Pressable onPress={handleSubmit} disabled={!isValid || submitting} hitSlop={8}>
          {submitting ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.submit, !isValid && styles.submitDisabled]}>등록</Text>
          )}
        </Pressable>
      </View>

      {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

      <View style={styles.chipRow}>
        {CATEGORIES.map((c) => {
          const active = c === category;
          return (
            <Pressable
              key={c}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setCategory(c)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        style={styles.titleInput}
        placeholder="제목을 입력하세요"
        placeholderTextColor={colors.textDisabled}
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={styles.bodyInput}
        placeholder="내용을 입력하세요"
        placeholderTextColor={colors.textDisabled}
        value={body}
        onChangeText={setBody}
        multiline
        textAlignVertical="top"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: screenPadding },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  submit: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.primary },
  submitDisabled: { color: colors.textDisabled },
  errorText: { color: colors.danger, fontSize: fontSize.md, marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', gap: spacing.xs, marginVertical: spacing.sm },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.fillSubtle },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: fontSize.md, color: colors.textSecondary },
  chipTextActive: { color: colors.white, fontWeight: fontWeight.semibold },
  titleInput: {
    minHeight: minTouchSize,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  bodyInput: { flex: 1, fontSize: fontSize.lg, color: colors.textPrimary, marginTop: spacing.sm },
});
