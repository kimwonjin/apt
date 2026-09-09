import { supabase } from './supabase';

// Supabase Storage 'photos' 버킷 업로드 헬퍼.
// RLS 정책상 업로드 경로의 첫 폴더가 auth.uid() 와 같아야 하므로, 반드시 로그인 상태에서만 호출할 것.
export async function uploadPhoto(uri: string, folder: string): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요해요.');

  const response = await fetch(uri);
  const blob = await response.blob();
  const ext = blob.type.split('/')[1] || 'jpg';
  const path = `${user.id}/${folder}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from('photos').upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return data.publicUrl;
}
