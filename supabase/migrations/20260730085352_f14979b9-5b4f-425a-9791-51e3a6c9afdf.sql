ALTER TABLE public.user_notes
  ADD COLUMN IF NOT EXISTS order_rev integer NOT NULL DEFAULT 0;

-- Atomic, conflict-safe reorder.
--
-- The whole arrangement is written in ONE statement, guarded by a revision
-- check: if another device already moved these notes, _expected_rev no longer
-- matches and the call is rejected instead of interleaving two arrangements.
CREATE OR REPLACE FUNCTION public.reorder_user_notes(
  _ordered_ids uuid[],
  _expected_rev integer
)
RETURNS TABLE(id uuid, sort_order integer, order_rev integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current_rev integer;
  v_owned integer;
  v_total integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  -- Lock this person's notes for the duration of the transaction so two
  -- simultaneous reorders queue up rather than racing.
  PERFORM 1 FROM public.user_notes n WHERE n.user_id = v_uid FOR UPDATE;

  SELECT COALESCE(MAX(n.order_rev), 0), COUNT(*)
    INTO v_current_rev, v_total
    FROM public.user_notes n
   WHERE n.user_id = v_uid;

  IF v_current_rev <> _expected_rev THEN
    RAISE EXCEPTION 'note order changed elsewhere (rev % expected %)', v_current_rev, _expected_rev
      USING ERRCODE = '40001';
  END IF;

  SELECT COUNT(*) INTO v_owned
    FROM public.user_notes n
   WHERE n.user_id = v_uid
     AND n.id = ANY(_ordered_ids);

  IF v_owned <> COALESCE(array_length(_ordered_ids, 1), 0) THEN
    RAISE EXCEPTION 'note order refers to notes that are not yours' USING ERRCODE = '42501';
  END IF;

  -- A note created on another device that is missing from this list keeps its
  -- place at the end rather than being dropped.
  RETURN QUERY
  WITH desired AS (
    SELECT u.note_id, (u.pos - 1)::integer AS new_order
    FROM unnest(_ordered_ids) WITH ORDINALITY AS u(note_id, pos)
  ),
  final AS (
    SELECT n.id,
           COALESCE(d.new_order, v_total + n.sort_order) AS new_order
    FROM public.user_notes n
    LEFT JOIN desired d ON d.note_id = n.id
    WHERE n.user_id = v_uid
  )
  UPDATE public.user_notes n
     SET sort_order = f.new_order,
         order_rev = _expected_rev + 1,
         updated_at = now()
    FROM final f
   WHERE n.id = f.id
  RETURNING n.id, n.sort_order, n.order_rev;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_user_notes(uuid[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_user_notes(uuid[], integer) TO authenticated;

ALTER TABLE public.user_notes REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;