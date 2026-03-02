
UPDATE public.org_members 
SET role = 'owner', updated_at = now()
WHERE user_id = '44071dab-e03a-49bb-9d8d-c9bd8e4c3f75' 
  AND org_id = '852fc8e0-4071-499b-b655-f86d6f789cd5';
