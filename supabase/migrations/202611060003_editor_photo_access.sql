-- Permite a editores gestionar campañas, fotos y selecciones desde la web.
-- No da acceso a estudiantes que no tengan perfil de editor.

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'photo_campaigns',
    'student_photos',
    'photo_selections',
    'selection_settings'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Editors manage photo data', target_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_photo_editor()) WITH CHECK (public.is_photo_editor())',
      'Editors manage photo data', target_table
    );
  END LOOP;
END $$;

-- Los buckets siguen siendo privados. Solo cuentas editoras pueden operar
-- sobre sus objetos; los estudiantes recibirán URLs firmadas desde el backend.
DROP POLICY IF EXISTS "Editors manage student originals" ON storage.objects;
CREATE POLICY "Editors manage student originals"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'student-originals' AND public.is_photo_editor())
  WITH CHECK (bucket_id = 'student-originals' AND public.is_photo_editor());

DROP POLICY IF EXISTS "Editors manage student previews" ON storage.objects;
CREATE POLICY "Editors manage student previews"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'student-previews' AND public.is_photo_editor())
  WITH CHECK (bucket_id = 'student-previews' AND public.is_photo_editor());
