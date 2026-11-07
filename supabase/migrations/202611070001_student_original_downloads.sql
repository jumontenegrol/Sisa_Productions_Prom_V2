-- Permite que cada estudiante descargue solo sus originales y solo durante el plazo.
-- Los buckets permanecen privados; no se habilita acceso público.
-- Deja la campaña activa sin fecha de apertura y con el cierre solicitado: 17 nov 2026, 18:00 Colombia (23:00 UTC).
update public.photo_campaigns c
set opens_at = null,
    closes_at = timestamptz '2026-11-17 23:00:00+00'
where c.id = (
  select ss.campaign_id
  from public.selection_settings ss
  join public.photo_campaigns campaign on campaign.id = ss.campaign_id
  order by campaign.created_at desc
  limit 1
);

create or replace function public.can_student_download_original(p_object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_portal_accounts spa
    join public.student_photos sp on sp.student_id = spa.student_id
    join public.photo_campaigns c on c.id = sp.campaign_id
    where spa.auth_user_id = auth.uid()
      and sp.original_path = p_object_name
      and (c.opens_at is null or now() >= c.opens_at)
      and (c.closes_at is null or now() < c.closes_at)
  );
$$;
revoke all on function public.can_student_download_original(text) from public;
revoke all on function public.can_student_download_original(text) from anon;
grant execute on function public.can_student_download_original(text) to authenticated;

drop policy if exists "Students download own originals before deadline" on storage.objects;
create policy "Students download own originals before deadline"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'student-originals'
    and public.can_student_download_original(name)
  );
