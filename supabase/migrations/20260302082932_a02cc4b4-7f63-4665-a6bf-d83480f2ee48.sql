CREATE UNIQUE INDEX IF NOT EXISTS attendance_exceptions_user_date_type_uniq 
ON public.attendance_exceptions (user_id, exception_date, type);