ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS learning_style text;
ALTER TABLE public.training_modules ADD COLUMN IF NOT EXISTS learning_style text;
ALTER TABLE public.training_modules ADD COLUMN IF NOT EXISTS audit jsonb;