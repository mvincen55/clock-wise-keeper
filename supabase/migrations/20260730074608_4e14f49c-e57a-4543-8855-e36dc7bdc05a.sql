ALTER TABLE public.org_practice_settings
  ADD COLUMN IF NOT EXISTS roleplay_persona_style text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS roleplay_policy_tone text NOT NULL DEFAULT 'warm_professional',
  ADD COLUMN IF NOT EXISTS roleplay_notes text;

ALTER TABLE public.org_practice_settings
  ADD CONSTRAINT org_practice_settings_persona_style_check
  CHECK (roleplay_persona_style IN ('gentle','balanced','challenging','skeptical'));

ALTER TABLE public.org_practice_settings
  ADD CONSTRAINT org_practice_settings_policy_tone_check
  CHECK (roleplay_policy_tone IN ('warm_professional','plainspoken','formal','concierge'));