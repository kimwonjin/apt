-- 사진 업로드 인프라: Storage 버킷 + 정책, reviews 테이블에 photos 컬럼 추가.
-- 실행 방법: dnanhfsivegsebdzzzfn 프로젝트 SQL Editor에 전체 붙여넣고 Run.

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "public can view photos" on storage.objects;
create policy "public can view photos"
  on storage.objects for select
  using (bucket_id = 'photos');

drop policy if exists "users upload to own folder" on storage.objects;
create policy "users upload to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users update own photos" on storage.objects;
create policy "users update own photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete own photos" on storage.objects;
create policy "users delete own photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

alter table reviews add column if not exists photos text[] not null default '{}';
