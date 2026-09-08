import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export async function pickAndUploadImage(folder: string): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
  });
  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const ext = asset.uri.split('.').pop()?.split('?')[0] || 'jpg';
  const path = `${user.id}/${folder}/${Date.now()}.${ext}`;

  const response = await fetch(asset.uri);
  const blob = await response.blob();

  const { error } = await supabase.storage.from('photos').upload(path, blob, {
    contentType: asset.mimeType ?? 'image/jpeg',
  });
  if (error) return null;

  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return data.publicUrl;
}

// 여러 개 사진을 한 번에 골라서 모두 업로드하고 URL 배열을 반환
export async function pickAndUploadMultipleImages(folder: string, maxCount: number = 10): Promise<string[]> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
    selectionLimit: maxCount,
    allowsMultiple: true,
  });
  if (result.canceled || result.assets.length === 0) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const uploadedUrls: string[] = [];

  for (const asset of result.assets) {
    const ext = asset.uri.split('.').pop()?.split('?')[0] || 'jpg';
    const path = `${user.id}/${folder}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;

    const response = await fetch(asset.uri);
    const blob = await response.blob();

    const { error } = await supabase.storage.from('photos').upload(path, blob, {
      contentType: asset.mimeType ?? 'image/jpeg',
    });
    if (!error) {
      const { data } = supabase.storage.from('photos').getPublicUrl(path);
      uploadedUrls.push(data.publicUrl);
    }
  }

  return uploadedUrls;
}
