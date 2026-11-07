-- Extensión del esquema existente. No recrea estudiantes ni planes.
-- Ajustar el tipo de student_id al tipo real de public.estudiantes.id antes de ejecutar.

create table if not exists public.editor_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.photo_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  opens_at timestamptz,
  closes_at timestamptz,
  center_image_path text,
  created_at timestamptz not null default now(),
  check (closes_at is null or opens_at is null or closes_at > opens_at)
);

create table if not exists public.student_photos (
  id uuid primary key default gen_random_uuid(),
  student_id integer not null references public.estudiantes(id) on delete cascade,
  campaign_id uuid not null references public.photo_campaigns(id) on delete cascade,
  category text not null check (category in ('folder', 'retablo')),
  ordinal smallint not null check (ordinal between 1 and 10),
  original_path text not null unique,
  preview_path text not null unique,
  width_px integer,
  height_px integer,
  created_at timestamptz not null default now(),
  unique(student_id, campaign_id, category, ordinal),
  unique(id, student_id, campaign_id)
);
create index if not exists student_photos_owner_idx on public.student_photos(student_id, campaign_id);

create table if not exists public.photo_selections (
  id uuid primary key default gen_random_uuid(),
  student_id integer not null references public.estudiantes(id) on delete cascade,
  campaign_id uuid not null references public.photo_campaigns(id) on delete cascade,
  product text not null check (product in ('folder', 'retablo')),
  layout smallint,
  slot smallint not null check (slot between 1 and 4),
  photo_id uuid not null,
  updated_at timestamptz not null default now(),
  foreign key (photo_id, student_id, campaign_id)
    references public.student_photos(id, student_id, campaign_id) on delete restrict,
  unique(student_id, campaign_id, product, slot),
  -- Evita reutilizar una misma foto en carpeta y retablo del mismo estudiante.
  unique(student_id, campaign_id, photo_id)
);

create table if not exists public.selection_settings (
  campaign_id uuid primary key references public.photo_campaigns(id) on delete cascade,
  plan1_id integer not null references public.planes(id),
  plan2_id integer not null references public.planes(id),
  folder_frame_width_cm numeric(5,2) not null default 20,
  folder_frame_height_cm numeric(5,2) not null default 30,
  retablo_plan1_width_cm numeric(5,2) not null default 30,
  retablo_plan1_height_cm numeric(5,2) not null default 45,
  retablo_plan2_width_cm numeric(5,2) not null default 50,
  retablo_plan2_height_cm numeric(5,2) not null default 70,
  updated_at timestamptz not null default now(),
  check (plan1_id <> plan2_id)
);

alter table public.editor_profiles enable row level security;
alter table public.photo_campaigns enable row level security;
alter table public.student_photos enable row level security;
alter table public.photo_selections enable row level security;
alter table public.selection_settings enable row level security;

-- Estas tablas no permiten acceso directo al cliente. Añadir políticas específicas
-- o RPCs SECURITY DEFINER revisadas para estudiante/editor; no abrirlas a authenticated.
-- El backend/Edge Function debe comprobar identidad, estudiante asociado, fecha límite,
-- plan y límites de fotos en una sola transacción antes de guardar selecciones.
