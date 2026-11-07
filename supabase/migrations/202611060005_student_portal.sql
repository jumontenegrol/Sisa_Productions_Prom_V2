-- Student identity mapping. Auth users are created by the student-login Edge Function
-- only after the entered name and registered phone match the existing roster.
create table if not exists public.student_portal_accounts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  student_id integer not null unique references public.estudiantes(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.student_portal_accounts enable row level security;

create table if not exists public.student_login_attempts (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count smallint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.student_login_attempts enable row level security;

create or replace function public.consume_student_login_attempt(p_key_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts smallint;
begin
  insert into public.student_login_attempts (key_hash, window_started_at, attempt_count, updated_at)
  values (p_key_hash, now(), 1, now())
  on conflict (key_hash) do update set
    attempt_count = case
      when public.student_login_attempts.window_started_at < now() - interval '15 minutes' then 1
      else public.student_login_attempts.attempt_count + 1
    end,
    window_started_at = case
      when public.student_login_attempts.window_started_at < now() - interval '15 minutes' then now()
      else public.student_login_attempts.window_started_at
    end,
    updated_at = now()
  returning attempt_count into v_attempts;
  return v_attempts <= 8;
end;
$$;
revoke all on function public.consume_student_login_attempt(text) from public;
revoke all on function public.consume_student_login_attempt(text) from anon;
revoke all on function public.consume_student_login_attempt(text) from authenticated;
grant execute on function public.consume_student_login_attempt(text) to service_role;

create or replace function public.current_portal_student_id()
returns integer
language sql stable security definer
set search_path = ''
as $$
  select spa.student_id
  from public.student_portal_accounts spa
  where spa.auth_user_id = auth.uid()
  limit 1;
$$;
revoke all on function public.current_portal_student_id() from public;
revoke all on function public.current_portal_student_id() from anon;
grant execute on function public.current_portal_student_id() to authenticated;

create or replace function public.can_student_read_preview(p_object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_portal_accounts spa
    join public.student_photos sp on sp.student_id = spa.student_id
    where spa.auth_user_id = auth.uid()
      and sp.preview_path = p_object_name
  ) or exists (
    select 1
    from public.student_portal_accounts spa
    join public.estudiantes e on e.id = spa.student_id
    join public.selection_settings ss on e.plan_id in (ss.plan1_id, ss.plan2_id)
    join public.photo_campaigns c on c.id = ss.campaign_id
    where spa.auth_user_id = auth.uid()
      and c.center_image_path = p_object_name
  );
$$;
revoke all on function public.can_student_read_preview(text) from public;
revoke all on function public.can_student_read_preview(text) from anon;
grant execute on function public.can_student_read_preview(text) to authenticated;

drop policy if exists "Students read own photo metadata" on public.student_photos;
create policy "Students read own photo metadata"
  on public.student_photos for select to authenticated
  using (student_id = public.current_portal_student_id());

drop policy if exists "Students read own selections" on public.photo_selections;
create policy "Students read own selections"
  on public.photo_selections for select to authenticated
  using (student_id = public.current_portal_student_id());

drop policy if exists "Students read own private previews" on storage.objects;
create policy "Students read own private previews"
  on storage.objects for select to authenticated
  using (bucket_id = 'student-previews' and public.can_student_read_preview(name));

create or replace function public.get_student_portal_summary()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'student_id', e.id,
    'name', e.nombre,
    'grade', e.grado,
    'plan_id', e.plan_id,
    'campaign_id', c.id,
    'campaign_name', c.name,
    'opens_at', c.opens_at,
    'closes_at', c.closes_at,
    'center_image_path', c.center_image_path,
    'selections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'product', ps.product,
          'layout', ps.layout,
          'slot', ps.slot,
          'photo_id', ps.photo_id
        ) order by ps.product, ps.slot
      )
      from public.photo_selections ps
      where ps.student_id = e.id and ps.campaign_id = c.id
    ), '[]'::jsonb)
  )
  from public.student_portal_accounts spa
  join public.estudiantes e on e.id = spa.student_id
  join public.selection_settings ss on e.plan_id in (ss.plan1_id, ss.plan2_id)
  join public.photo_campaigns c on c.id = ss.campaign_id
  where spa.auth_user_id = auth.uid()
  order by c.created_at desc
  limit 1;
$$;
revoke all on function public.get_student_portal_summary() from public;
revoke all on function public.get_student_portal_summary() from anon;
grant execute on function public.get_student_portal_summary() to authenticated;

create or replace function public.save_student_photo_selection(
  p_campaign_id uuid,
  p_folder_photo_ids uuid[],
  p_retablo_layout smallint,
  p_retablo_photo_ids uuid[]
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student_id integer;
  v_plan_id integer;
  v_plan1_id integer;
  v_plan2_id integer;
  v_close_at timestamptz;
  v_open_at timestamptz;
  v_expected integer;
  v_count integer;
begin
  v_student_id := public.current_portal_student_id();
  if v_student_id is null then
    raise exception 'No hay un estudiante asociado a esta sesión';
  end if;

  select e.plan_id into v_plan_id
  from public.estudiantes e where e.id = v_student_id;
  if v_plan_id not in (1, 2) then
    raise exception 'Este plan no tiene acceso al portal de selección';
  end if;

  select c.opens_at, c.closes_at, ss.plan1_id, ss.plan2_id
    into v_open_at, v_close_at, v_plan1_id, v_plan2_id
  from public.photo_campaigns c
  join public.selection_settings ss on ss.campaign_id = c.id
  where c.id = p_campaign_id and v_plan_id in (ss.plan1_id, ss.plan2_id);
  if not found then
    raise exception 'No se encontró la campaña para este plan';
  end if;
  if v_open_at is not null and now() < v_open_at then
    raise exception 'La selección todavía no está abierta';
  end if;
  if v_close_at is not null and now() > v_close_at then
    raise exception 'El plazo de selección ya terminó';
  end if;

  if coalesce(array_length(p_folder_photo_ids, 1), 0) <> 2 then
    raise exception 'Debes elegir exactamente dos fotos para la carpeta';
  end if;
  select count(distinct x.photo_id) into v_count
  from unnest(p_folder_photo_ids) as x(photo_id);
  if v_count <> 2 then raise exception 'No se puede repetir una foto'; end if;

  if p_retablo_layout is null then
    raise exception 'Debes elegir un diseño de retablo';
  end if;

  if v_plan_id = v_plan1_id and p_retablo_layout not in (1, 2) then
    raise exception 'Ese diseño de retablo no está disponible para tu plan';
  elsif v_plan_id = v_plan2_id and p_retablo_layout not in (1, 2, 3) then
    raise exception 'Diseño de retablo no válido';
  end if;

  v_expected := case p_retablo_layout when 1 then 1 when 2 then 2 when 3 then 4 else 0 end;
  if coalesce(array_length(p_retablo_photo_ids, 1), 0) <> v_expected then
    raise exception 'La cantidad de fotos no coincide con el diseño elegido';
  end if;
  select count(distinct x.photo_id) into v_count
  from unnest(p_retablo_photo_ids) as x(photo_id);
  if v_count <> v_expected then raise exception 'No se puede repetir una foto'; end if;
  if p_folder_photo_ids && p_retablo_photo_ids then
    raise exception 'Una foto no puede repetirse entre productos';
  end if;

  select count(*) into v_count
  from public.student_photos sp
  where sp.id = any(p_folder_photo_ids)
    and sp.student_id = v_student_id
    and sp.campaign_id = p_campaign_id
    and sp.category = 'folder';
  if v_count <> 2 then raise exception 'Una foto de carpeta no corresponde a tu colección'; end if;

  select count(*) into v_count
  from public.student_photos sp
  where sp.id = any(p_retablo_photo_ids)
    and sp.student_id = v_student_id
    and sp.campaign_id = p_campaign_id
    and sp.category = 'retablo';
  if v_count <> v_expected then raise exception 'Una foto de retablo no corresponde a tu colección'; end if;

  delete from public.photo_selections
  where student_id = v_student_id and campaign_id = p_campaign_id;

  insert into public.photo_selections (student_id, campaign_id, product, layout, slot, photo_id)
  select v_student_id, p_campaign_id, 'folder', null, x.ordinality::smallint, x.photo_id
  from unnest(p_folder_photo_ids) with ordinality as x(photo_id, ordinality);

  insert into public.photo_selections (student_id, campaign_id, product, layout, slot, photo_id)
  select v_student_id, p_campaign_id, 'retablo', p_retablo_layout, x.ordinality::smallint, x.photo_id
  from unnest(p_retablo_photo_ids) with ordinality as x(photo_id, ordinality);
end;
$$;
revoke all on function public.save_student_photo_selection(uuid, uuid[], smallint, uuid[]) from public;
revoke all on function public.save_student_photo_selection(uuid, uuid[], smallint, uuid[]) from anon;
grant execute on function public.save_student_photo_selection(uuid, uuid[], smallint, uuid[]) to authenticated;

