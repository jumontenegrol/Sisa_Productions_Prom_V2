-- ============================================
-- Esquema de base de datos: Fotografía Colegio
-- Motor: PostgreSQL (Supabase)
-- ============================================

-- Planes de pago disponibles
create table if not exists planes (
    id serial primary key,
    nombre varchar(50) not null,       -- 'Plan 1', 'Plan 2'
    monto numeric(10,2) not null
);

insert into planes (nombre, monto) values
    ('Plan 1', 0),   -- Ajusta el monto real
    ('Plan 2', 0)    -- Ajusta el monto real
on conflict do nothing;

-- Estudiantes (cargados desde Excel)
create table if not exists estudiantes (
    id serial primary key,
    nombre varchar(150) not null,
    grado varchar(10) not null check (grado in ('1101','1102','1103','1104','1105')),
    nombre_padre varchar(150),
    telefono varchar(20),
    correo varchar(150),
    plan_id int references planes(id),
    monto_total numeric(10,2) default 0,
    monto_abonado numeric(10,2) default 0,
    pago_completo boolean default false,
    created_at timestamp default now(),
    updated_at timestamp default now()
);

create index if not exists idx_estudiantes_nombre on estudiantes using gin (to_tsvector('spanish', nombre));
create index if not exists idx_estudiantes_grado on estudiantes (grado);

-- Comprobantes de pago (uno por cada abono/actualización)
create table if not exists comprobantes (
    id serial primary key,
    estudiante_id int references estudiantes(id) on delete cascade,
    monto_pagado numeric(10,2) not null,   -- monto de ESTE abono especifico
    monto_abonado_acumulado numeric(10,2) not null, -- total acumulado al momento de emitir
    fecha_emision timestamp default now(),
    numero_comprobante varchar(30)
);

-- Trigger para mantener updated_at al día
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_estudiantes_updated_at on estudiantes;
create trigger trg_estudiantes_updated_at
before update on estudiantes
for each row execute function set_updated_at();

-- ============================================
-- Row Level Security
-- Solo usuarios autenticados (el admin) pueden leer/escribir
-- ============================================
alter table estudiantes enable row level security;
alter table comprobantes enable row level security;
alter table planes enable row level security;

create policy "Autenticados pueden todo en estudiantes"
    on estudiantes for all
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');

create policy "Autenticados pueden todo en comprobantes"
    on comprobantes for all
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');

create policy "Autenticados pueden leer planes"
    on planes for select
    using (auth.role() = 'authenticated');
