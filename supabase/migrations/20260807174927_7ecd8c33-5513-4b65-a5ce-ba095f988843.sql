CREATE TABLE public.marketing_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  practice_name text,
  role text,
  office_size text,
  email text NOT NULL,
  note text,
  source text NOT NULL DEFAULT 'website',
  ip_hash text,
  user_agent text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Deliberately no grants to anon or authenticated: public visitors submit
-- through the submit-lead edge function, which runs with the service role.
GRANT ALL ON public.marketing_leads TO service_role;

ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages marketing leads"
  ON public.marketing_leads FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_marketing_leads_ip_recent ON public.marketing_leads (ip_hash, created_at DESC);
CREATE INDEX idx_marketing_leads_email_recent ON public.marketing_leads (lower(email), created_at DESC);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_marketing_leads_updated_at
  BEFORE UPDATE ON public.marketing_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();