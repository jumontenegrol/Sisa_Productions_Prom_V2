-- Unifica las colecciones existentes de 5 fotos de carpeta + 10 de retablo.
-- Conserva los IDs de foto y las selecciones ya registradas.

alter table public.student_photos
  drop constraint if exists student_photos_student_id_campaign_id_category_ordinal_key,
  drop constraint if exists student_photos_category_check,
  drop constraint if exists student_photos_ordinal_check;

-- Las fotos de retablo pasan a continuación de las cinco fotos de carpeta.
update public.student_photos
set ordinal = ordinal + 5
where category = 'retablo';

update public.student_photos
set category = 'collection'
where category in ('folder', 'retablo');

alter table public.student_photos
  add constraint student_photos_category_check check (category = 'collection'),
  add constraint student_photos_ordinal_check check (ordinal between 1 and 20),
  add constraint student_photos_student_campaign_ordinal_key unique (student_id, campaign_id, ordinal);

-- Permite reutilizar una imagen entre productos, pero no duplicarla dentro del mismo.
alter table public.photo_selections
  drop constraint if exists photo_selections_student_id_campaign_id_photo_id_key;

alter table public.photo_selections
  add constraint photo_selections_student_campaign_product_photo_key
  unique (student_id, campaign_id, product, photo_id);

-- La rotación se guarda únicamente para reconstruir la vista previa del estudiante.
-- No se expone en el informe CSV del editor.
alter table public.photo_selections
  add column if not exists rotation_degrees smallint not null default 0;

alter table public.photo_selections
  drop constraint if exists photo_selections_rotation_degrees_check;

alter table public.photo_selections
  add constraint photo_selections_rotation_degrees_check
  check (rotation_degrees in (0, 90, 180, 270));

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
          'photo_id', ps.photo_id,
          'rotation_degrees', ps.rotation_degrees
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
  if v_close_at is not null and now() >= v_close_at then
    raise exception 'El plazo de selección ya terminó';
  end if;

  select count(*) into v_count
  from public.student_photos sp
  where sp.student_id = v_student_id
    and sp.campaign_id = p_campaign_id
    and sp.category = 'collection';
  if v_count < 10 or v_count > 20 then
    raise exception 'La colección debe tener entre 10 y 20 fotos';
  end if;

  if coalesce(array_length(p_folder_photo_ids, 1), 0) <> 2 then
    raise exception 'Debes elegir exactamente dos fotos para la carpeta';
  end if;
  select count(distinct x.photo_id) into v_count
  from unnest(p_folder_photo_ids) as x(photo_id);
  if v_count <> 2 then raise exception 'No se puede repetir una foto dentro de la carpeta'; end if;

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
  if v_count <> v_expected then raise exception 'No se puede repetir una foto dentro del retablo'; end if;

  select count(*) into v_count
  from public.student_photos sp
  where sp.id = any(p_folder_photo_ids)
    and sp.student_id = v_student_id
    and sp.campaign_id = p_campaign_id
    and sp.category = 'collection';
  if v_count <> 2 then raise exception 'Una foto de carpeta no corresponde a tu colección'; end if;

  select count(*) into v_count
  from public.student_photos sp
  where sp.id = any(p_retablo_photo_ids)
    and sp.student_id = v_student_id
    and sp.campaign_id = p_campaign_id
    and sp.category = 'collection';
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

create or replace function public.save_student_photo_selection_with_rotation(
  p_campaign_id uuid,
  p_folder_photo_ids uuid[],
  p_retablo_layout smallint,
  p_retablo_photo_ids uuid[],
  p_folder_rotation_degrees smallint[],
  p_retablo_rotation_degrees smallint[]
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if coalesce(array_length(p_folder_rotation_degrees, 1), 0) <> 2
     or coalesce(array_length(p_retablo_rotation_degrees, 1), 0) <> coalesce(array_length(p_retablo_photo_ids, 1), 0) then
    raise exception 'La vista previa no coincide con las fotos elegidas';
  end if;

  perform public.save_student_photo_selection(
    p_campaign_id,
    p_folder_photo_ids,
    p_retablo_layout,
    p_retablo_photo_ids
  );

  update public.photo_selections ps
  set rotation_degrees = x.rotation_degrees
  from unnest(p_folder_photo_ids, p_folder_rotation_degrees) with ordinality
       as x(photo_id, rotation_degrees, ordinality)
  where ps.student_id = public.current_portal_student_id()
    and ps.campaign_id = p_campaign_id
    and ps.product = 'folder'
    and ps.slot = x.ordinality;

  update public.photo_selections ps
  set rotation_degrees = x.rotation_degrees
  from unnest(p_retablo_photo_ids, p_retablo_rotation_degrees) with ordinality
       as x(photo_id, rotation_degrees, ordinality)
  where ps.student_id = public.current_portal_student_id()
    and ps.campaign_id = p_campaign_id
    and ps.product = 'retablo'
    and ps.slot = x.ordinality;
end;
$$;
revoke all on function public.save_student_photo_selection_with_rotation(uuid, uuid[], smallint, uuid[], smallint[], smallint[]) from public;
revoke all on function public.save_student_photo_selection_with_rotation(uuid, uuid[], smallint, uuid[], smallint[], smallint[]) from anon;
grant execute on function public.save_student_photo_selection_with_rotation(uuid, uuid[], smallint, uuid[], smallint[], smallint[]) to authenticated;
