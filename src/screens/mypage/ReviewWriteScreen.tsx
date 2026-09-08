import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MyPageStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { pickAndUploadImage } from '../../lib/uploadImage';
import { colors, fontSize, fontWeight, minTouchSize, radius, screenPadding, spacing } from '../../theme';

type Props = NativeStackScreenProps<MyPageStackParamList, 'ReviewWrite'>;

const STARS = [1, 2, 3, 4, 5];
const MAX_PHOTOS = 3;

export function ReviewWriteScreen({ route, navigation }: Props) {
  const { groupBuyId, groupBuyTitle } = route.params;
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddPhoto = async () => {
    if (photos.length >= MAX_PHOTOS || uploadingPhoto) return;
    setUploadingPhoto(true);
    const url = await pickAndUploadImage('reviews');
    if (url) setPhotos((prev) => [...prev, url]);
    setUploadingPhoto(false);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setErrorMsg('로그인 세션이 없습니다.');
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from('reviews').insert({
      groupbuy_id: groupBuyId,
      author_id: user.id,
      rating,
      body: body.trim() || null,
      photos,
    });

    setSubmitting(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>후기 쓰기</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.groupBuyTitle}>{groupBuyTitle}</Text>

      <View style={styles.starRow}>
        {STARS.map((s) => (
          <Pressable key={s} onPress={() => setRating(s)} hitSlop={4}>
            <Text style={[styles.star, s <= rating && styles.starActive]}>★</Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={styles.bodyInput}
        placeholder="이용 후기를 남겨주세요 (선택)"
        placeholderTextColor={colors.textDisabled}
        value={body}
        onChangeText={setBody}
        multiline
        textAlignVertical="top"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
        {photos.map((url) => (
          <View key={url} style={styles.photoThumbWrap}>
            <Image source={{ uri: url }} style={styles.photoThumb} />
            <Pressable style={styles.photoRemove} onPress={() => setPhotos((prev) => prev.filter((p) => p !== url))} hitSlop={8}>
              <Text style={styles.photoRemoveText}>✕</Text>
            </Pressable>
          </View>
        ))}
        {photos.length < MAX_PHOTOS && (
          <Pressable style={styles.photoAddBtn} onPress={handleAddPhoto} disabled={uploadingPhoto}>
            {uploadingPhoto ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.photoAddText}>+ 사진{'\n'}{photos.length}/{MAX_PHOTOS}</Text>}
          </Pressable>
        )}
      </ScrollView>

      {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

      <Pressable style={[styles.cta, submitting && styles.ctaDisabled]} disabled={submitting} onPress={handleSubmit}>
        {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.ctaText}>후기 등록</Text>}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: screenPadding },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  back: { fontSize: 28, color: colors.textPrimary },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  groupBuyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.medium, color: colors.textSecondary, marginBottom: spacing.md },
  starRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  star: { fontSize: 36, color: colors.divider },
  starActive: { color: colors.amber },
  bodyInput: {
    minHeight: 140,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  photoRow: { marginTop: spacing.sm, flexGrow: 0 },
  photoThumbWrap: { marginRight: spacing.xs, position: 'relative' },
  photoThumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.fillSubtle },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: colors.white, fontSize: 11, fontWeight: fontWeight.bold },
  photoAddBtn: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddText: { fontSize: fontSize.base, color: colors.textSecondary, textAlign: 'center' },
  errorText: { color: colors.danger, fontSize: fontSize.md, marginTop: spacing.xs },
  cta: {
    height: minTouchSize,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: colors.white, fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
});
