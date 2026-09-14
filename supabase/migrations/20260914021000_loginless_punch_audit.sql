-- Preserve a valid audit actor when the employee has no auth account yet.
CREATE OR REPLACE FUNCTION public.log_punch_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_actor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('purple.punch_audited', true) = '1' THEN
      RETURN NEW;
    END IF;
    SELECT te.user_id INTO v_user_id FROM public.time_entries te WHERE te.id = NEW.time_entry_id;
    v_actor := COALESCE(NEW.edited_by, auth.uid());
    INSERT INTO public.audit_events (
      user_id, org_id, employee_id, actor_id, event_type,
      action_type, target_table, target_id, after_json,
      event_details, related_entry_id, related_date
    ) VALUES (
      COALESCE(v_user_id, v_actor, (SELECT created_by FROM public.time_entries WHERE id=NEW.time_entry_id)), NEW.org_id, NEW.employee_id, v_actor, 'punch_created',
      'insert', 'punches', NEW.id, to_jsonb(NEW),
      jsonb_build_object('source', NEW.source, 'seq', NEW.seq, 'target_employee_id', NEW.employee_id),
      NEW.time_entry_id, (SELECT entry_date FROM public.time_entries WHERE id = NEW.time_entry_id)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF current_setting('purple.punch_audited', true) = '1' THEN
      RETURN NEW;
    END IF;
    SELECT te.user_id INTO v_user_id FROM public.time_entries te WHERE te.id = NEW.time_entry_id;
    v_actor := COALESCE(NEW.edited_by, auth.uid());
    INSERT INTO public.audit_events (
      user_id, org_id, employee_id, actor_id, event_type,
      action_type, target_table, target_id, before_json, after_json,
      related_entry_id, related_date
    ) VALUES (
      COALESCE(v_user_id, v_actor, (SELECT created_by FROM public.time_entries WHERE id=NEW.time_entry_id)), NEW.org_id, NEW.employee_id, v_actor, 'punch_edit',
      'update', 'punches', NEW.id, to_jsonb(OLD), to_jsonb(NEW),
      NEW.time_entry_id, (SELECT entry_date FROM public.time_entries WHERE id = NEW.time_entry_id)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT te.user_id INTO v_user_id FROM public.time_entries te WHERE te.id = OLD.time_entry_id;
    v_actor := COALESCE(OLD.edited_by, auth.uid());
    INSERT INTO public.audit_events (
      user_id, org_id, employee_id, actor_id, event_type,
      action_type, target_table, target_id, before_json,
      related_entry_id, related_date
    ) VALUES (
      COALESCE(v_user_id, v_actor, (SELECT created_by FROM public.time_entries WHERE id=OLD.time_entry_id)), OLD.org_id, OLD.employee_id, v_actor, 'punch_deleted',
      'delete', 'punches', OLD.id, to_jsonb(OLD),
      OLD.time_entry_id, (SELECT entry_date FROM public.time_entries WHERE id = OLD.time_entry_id)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;
