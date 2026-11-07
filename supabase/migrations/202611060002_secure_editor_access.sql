-- Restringe estudiantes/comprobantes a identidades registradas como editor/admin.
-- Ejecutar solo después de verificar que editor_profiles contiene las cuentas autorizadas.

DO $$
DECLARE
  editor_count integer;
BEGIN
  SELECT count(*) INTO editor_count FROM public.editor_profiles;
  IF editor_count < 1 THEN
    RAISE EXCEPTION 'editor_profiles está vacío; registra al menos una cuenta autorizada antes de cambiar RLS';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_photo_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.editor_profiles ep
    WHERE ep.user_id = auth.uid()
      AND ep.role IN ('editor', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_photo_editor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_photo_editor() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_photo_editor() TO authenticated;

-- Evita que una persona autenticada se asigne el rol a sí misma.
ALTER TABLE public.editor_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read own editor profile" ON public.editor_profiles;
CREATE POLICY "Read own editor profile"
  ON public.editor_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Reemplaza las políticas generales que actualmente autorizan a todo autenticado.
DROP POLICY IF EXISTS "Autenticados pueden todo en estudiantes" ON public.estudiantes;
CREATE POLICY "Editors manage students"
  ON public.estudiantes FOR ALL TO authenticated
  USING (public.is_photo_editor())
  WITH CHECK (public.is_photo_editor());

DO $$
DECLARE
  target_table text;
BEGIN
  IF to_regclass('public.comprobantes') IS NOT NULL THEN
    target_table := 'comprobantes';
  ELSIF to_regclass('public.comprobante') IS NOT NULL THEN
    target_table := 'comprobante';
  ELSE
    RAISE NOTICE 'No se encontró tabla comprobantes/comprobante; se omite esta política';
    RETURN;
  END IF;

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Autenticados pueden todo en comprobantes', target_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Autenticados pueden todo en comprobante', target_table);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_photo_editor()) WITH CHECK (public.is_photo_editor())', 'Editors manage receipts', target_table);
END $$;
