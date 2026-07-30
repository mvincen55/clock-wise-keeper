CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  page_path text,
  title text NOT NULL DEFAULT 'Problem report',
  status text NOT NULL DEFAULT 'open',
  tier text NOT NULL DEFAULT 'standard',
  escalated_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_status_chk CHECK (status IN ('open','escalated','resolved')),
  CONSTRAINT support_tickets_tier_chk CHECK (tier IN ('standard','senior'))
);

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  role text NOT NULL,
  author_user_id uuid,
  content text NOT NULL DEFAULT '',
  attachment_path text,
  tier text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_messages_role_chk CHECK (role IN ('user','assistant','staff'))
);

CREATE INDEX support_tickets_org_status_idx ON public.support_tickets (org_id, status, created_at DESC);
CREATE INDEX support_tickets_user_idx ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX support_messages_ticket_idx ON public.support_messages (ticket_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
GRANT SELECT, INSERT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read org tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

CREATE POLICY "Members open their own tickets"
  ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));

CREATE POLICY "Members update their own tickets"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins update org tickets"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "Members read their ticket messages"
  ON public.support_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = ticket_id AND t.user_id = auth.uid()
  ));

CREATE POLICY "Admins read org ticket messages"
  ON public.support_messages FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

CREATE POLICY "Members write to their own tickets"
  ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    role = 'user'
    AND author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid() AND t.status <> 'resolved'
    )
  );

CREATE POLICY "Admins reply on org tickets"
  ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (role = 'staff' AND author_user_id = auth.uid() AND public.is_org_admin(org_id));

CREATE TRIGGER support_tickets_touch
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();