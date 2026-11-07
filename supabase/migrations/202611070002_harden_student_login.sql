-- Refuerza la limitación de intentos del endpoint público de inicio de sesión.
-- Los hashes no contienen el nombre, teléfono ni IP en claro.
alter table public.student_login_attempts
  alter column attempt_count type integer using attempt_count::integer;

create index if not exists student_login_attempts_updated_at_idx
  on public.student_login_attempts (updated_at);

create or replace function public.consume_student_login_attempt_v2(
  p_key_hash text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_now timestamptz := now();
begin
  if p_key_hash !~ '^[a-f0-9]{64}$'
     or p_max_attempts < 1 or p_max_attempts > 1000
     or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'Invalid login throttle parameters';
  end if;

  insert into public.student_login_attempts (key_hash, window_started_at, attempt_count, updated_at)
  values (p_key_hash, v_now, 1, v_now)
  on conflict (key_hash) do update set
    attempt_count = case
      when public.student_login_attempts.window_started_at < v_now - make_interval(secs => p_window_seconds) then 1
      else public.student_login_attempts.attempt_count + 1
    end,
    window_started_at = case
      when public.student_login_attempts.window_started_at < v_now - make_interval(secs => p_window_seconds) then v_now
      else public.student_login_attempts.window_started_at
    end,
    updated_at = v_now
  returning attempt_count into v_attempts;

  return v_attempts <= p_max_attempts;
end;
$$;

revoke all on function public.consume_student_login_attempt_v2(text, integer, integer) from public;
revoke all on function public.consume_student_login_attempt_v2(text, integer, integer) from anon;
revoke all on function public.consume_student_login_attempt_v2(text, integer, integer) from authenticated;
grant execute on function public.consume_student_login_attempt_v2(text, integer, integer) to service_role;
