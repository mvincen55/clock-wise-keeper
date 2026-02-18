-- Add trigger to enforce reason_text on attendance_exceptions when resolved/ignored
CREATE OR REPLACE FUNCTION public.validate_exception_reason()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
BEGIN
  IF NEW.status IN ('resolved', 'ignored') THEN
    IF NEW.reason_text IS NULL OR length(trim(NEW.reason_text)) = 0 THEN
      RAISE EXCEPTION 'reason_text is required when status is resolved or ignored';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER enforce_exception_reason
  BEFORE INSERT OR UPDATE ON public.attendance_exceptions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_exception_reason();