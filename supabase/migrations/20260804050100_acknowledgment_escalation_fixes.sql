-- Correct two PL/pgSQL defects found during the first read-only escalation audit.

CREATE OR REPLACE FUNCTION public.knowledge_record_acknowledgment_event(
  p_assignment_id uuid,
  p_event_key text,
  p_event_type text,
  p_channel text DEFAULT 'system',
  p_actor_user_id uuid DEFAULT NULL,
  p_recipient_user_id uuid DEFAULT NULL,
  p_detail text DEFAULT '',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_row_count integer := 0;
BEGIN
  SELECT org_id INTO v_org_id
  FROM public.knowledge_acknowledgments
  WHERE id = p_assignment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acknowledgment assignment not found';
  END IF;

  INSERT INTO public.knowledge_acknowledgment_events (
    org_id, assignment_id, event_key, event_type, channel,
    actor_user_id, recipient_user_id, detail, metadata
  ) VALUES (
    v_org_id,
    p_assignment_id,
    p_event_key,
    p_event_type,
    p_channel,
    p_actor_user_id,
    p_recipient_user_id,
    COALESCE(p_detail, ''),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (org_id, event_key) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_record_acknowledgment_event(uuid, text, text, text, uuid, uuid, text, jsonb)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_record_acknowledgment_event(uuid, text, text, text, uuid, uuid, text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.mark_knowledge_acknowledgment_viewed(p_assignment_id uuid)
RETURNS public.knowledge_acknowledgments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.knowledge_acknowledgments;
  v_was_viewed boolean := false;
BEGIN
  SELECT * INTO v_assignment
  FROM public.knowledge_acknowledgments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acknowledgment assignment not found';
  END IF;

  v_was_viewed := v_assignment.first_viewed_at IS NOT NULL;

  IF v_assignment.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned person can mark this version viewed';
  END IF;
  IF v_assignment.waived_at IS NOT NULL THEN
    RETURN v_assignment;
  END IF;
  IF NOT public.knowledge_acknowledgment_user_is_eligible(v_assignment) THEN
    RAISE EXCEPTION 'This acknowledgment is no longer assigned to an active eligible member';
  END IF;

  UPDATE public.knowledge_acknowledgments
  SET first_viewed_at = COALESCE(first_viewed_at, now())
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  IF NOT v_was_viewed THEN
    PERFORM public.knowledge_record_acknowledgment_event(
      v_assignment.id,
      'viewed:' || v_assignment.id,
      'viewed',
      'system',
      auth.uid(),
      auth.uid(),
      'The assigned person opened the exact published version.',
      '{}'::jsonb
    );
  END IF;

  RETURN v_assignment;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_knowledge_acknowledgment_viewed(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_knowledge_acknowledgment_viewed(uuid)
  TO authenticated;
