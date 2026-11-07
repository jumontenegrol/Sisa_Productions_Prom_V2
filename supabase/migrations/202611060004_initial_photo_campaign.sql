-- Crea la campaña inicial de selección fotográfica y fija productos/medidas.
-- Fechas y arte central quedan pendientes de confirmación.

DO $$
DECLARE
  campaign_uuid uuid;
BEGIN
  SELECT id INTO campaign_uuid
  FROM public.photo_campaigns
  WHERE name = 'Selección fotográfica - Promoción 2026'
  ORDER BY created_at
  LIMIT 1;

  IF campaign_uuid IS NULL THEN
    INSERT INTO public.photo_campaigns (name)
    VALUES ('Selección fotográfica - Promoción 2026')
    RETURNING id INTO campaign_uuid;
  END IF;

  INSERT INTO public.selection_settings (
    campaign_id,
    plan1_id,
    plan2_id,
    folder_frame_width_cm,
    folder_frame_height_cm,
    retablo_plan1_width_cm,
    retablo_plan1_height_cm,
    retablo_plan2_width_cm,
    retablo_plan2_height_cm
  ) VALUES (
    campaign_uuid,
    1,
    2,
    20,
    30,
    30,
    45,
    50,
    70
  )
  ON CONFLICT (campaign_id) DO UPDATE SET
    plan1_id = EXCLUDED.plan1_id,
    plan2_id = EXCLUDED.plan2_id,
    folder_frame_width_cm = EXCLUDED.folder_frame_width_cm,
    folder_frame_height_cm = EXCLUDED.folder_frame_height_cm,
    retablo_plan1_width_cm = EXCLUDED.retablo_plan1_width_cm,
    retablo_plan1_height_cm = EXCLUDED.retablo_plan1_height_cm,
    retablo_plan2_width_cm = EXCLUDED.retablo_plan2_width_cm,
    retablo_plan2_height_cm = EXCLUDED.retablo_plan2_height_cm,
    updated_at = now();
END $$;
