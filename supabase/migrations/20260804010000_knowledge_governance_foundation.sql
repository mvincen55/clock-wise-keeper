-- Governed policy and procedure foundation for Purple Envelope.
--
-- office_docs / office_doc_chunks remain source evidence and extraction storage.
-- These tables hold the canonical, versioned content that can be reviewed,
-- approved, and published to the Policy Handbook or Practice Playbook.

-- ================================================================
-- 1. Core catalog and version tables
-- ================================================================

CREATE TABLE public.knowledge_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  area text NOT NULL CHECK (area IN ('handbook', 'playbook')),
  parent_id uuid REFERENCES public.knowledge_categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, area, slug),
  UNIQUE (id, org_id)
);

CREATE TABLE public.knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  category_id uuid,
  kind text NOT NULL CHECK (kind IN ('policy', 'procedure')),
  title text NOT NULL,
  slug text NOT NULL,
  summary text NOT NULL DEFAULT '',
  audience_roles text[] NOT NULL DEFAULT ARRAY['owner', 'manager', 'employee']::text[],
  current_published_version_id uuid,
  archived_at timestamptz,
  archived_by uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_items_audience_roles_check CHECK (
    audience_roles <@ ARRAY['owner', 'manager', 'employee']::text[]
    AND cardinality(audience_roles) > 0
  ),
  CONSTRAINT knowledge_items_category_fk
    FOREIGN KEY (category_id, org_id)
    REFERENCES public.knowledge_categories(id, org_id)
    ON DELETE RESTRICT,
  UNIQUE (org_id, kind, slug),
  UNIQUE (id, org_id)
);

CREATE TABLE public.knowledge_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  item_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'approved', 'published', 'superseded', 'retired')),
  change_summary text NOT NULL DEFAULT '',
  source_kind text NOT NULL DEFAULT 'manual'
    CHECK (source_kind IN ('manual', 'imported', 'ai_assisted', 'migrated')),
  based_on_version_id uuid,
  effective_on date,
  review_due_on date,
  created_by uuid NOT NULL,
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_versions_item_fk
    FOREIGN KEY (item_id, org_id)
    REFERENCES public.knowledge_items(id, org_id)
    ON DELETE CASCADE,
  CONSTRAINT knowledge_versions_based_on_fk
    FOREIGN KEY (based_on_version_id)
    REFERENCES public.knowledge_versions(id)
    ON DELETE SET NULL,
  UNIQUE (item_id, version_number),
  UNIQUE (id, org_id)
);

ALTER TABLE public.knowledge_items
  ADD CONSTRAINT knowledge_items_current_version_fk
  FOREIGN KEY (current_published_version_id, org_id)
  REFERENCES public.knowledge_versions(id, org_id)
  ON DELETE RESTRICT;

CREATE TABLE public.knowledge_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  version_id uuid NOT NULL,
  block_key text NOT NULL DEFAULT gen_random_uuid()::text,
  block_type text NOT NULL CHECK (block_type IN (
    'heading', 'paragraph', 'bullet_list', 'numbered_list', 'callout',
    'steps', 'table', 'script', 'checklist', 'image', 'divider'
  )),
  sort_order integer NOT NULL DEFAULT 0,
  plain_text text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_blocks_version_fk
    FOREIGN KEY (version_id, org_id)
    REFERENCES public.knowledge_versions(id, org_id)
    ON DELETE CASCADE,
  UNIQUE (version_id, block_key)
);

CREATE TABLE public.knowledge_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  version_id uuid NOT NULL,
  office_doc_id uuid REFERENCES public.office_docs(id) ON DELETE SET NULL,
  office_doc_chunk_id uuid REFERENCES public.office_doc_chunks(id) ON DELETE SET NULL,
  relation text NOT NULL DEFAULT 'supports'
    CHECK (relation IN ('supports', 'conflicts', 'context')),
  excerpt text NOT NULL DEFAULT '',
  source_label text NOT NULL DEFAULT '',
  source_page integer CHECK (source_page IS NULL OR source_page > 0),
  confidence numeric NOT NULL DEFAULT 1
    CHECK (confidence >= 0 AND confidence <= 1),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_evidence_version_fk
    FOREIGN KEY (version_id, org_id)
    REFERENCES public.knowledge_versions(id, org_id)
    ON DELETE CASCADE
);

CREATE TABLE public.knowledge_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  version_id uuid NOT NULL,
  reviewer_user_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
  note text NOT NULL DEFAULT '',
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_reviews_version_fk
    FOREIGN KEY (version_id, org_id)
    REFERENCES public.knowledge_versions(id, org_id)
    ON DELETE CASCADE,
  UNIQUE (version_id, reviewer_user_id)
);

CREATE UNIQUE INDEX knowledge_versions_one_published_per_item_idx
  ON public.knowledge_versions(item_id)
  WHERE status = 'published';

CREATE INDEX knowledge_categories_org_area_idx
  ON public.knowledge_categories(org_id, area, sort_order);
CREATE INDEX knowledge_items_org_kind_idx
  ON public.knowledge_items(org_id, kind, archived_at, title);
CREATE INDEX knowledge_versions_item_status_idx
  ON public.knowledge_versions(item_id, status, version_number DESC);
CREATE INDEX knowledge_blocks_version_order_idx
  ON public.knowledge_blocks(version_id, sort_order, id);
CREATE INDEX knowledge_evidence_version_idx
  ON public.knowledge_evidence(version_id, relation);
CREATE INDEX knowledge_reviews_version_idx
  ON public.knowledge_reviews(version_id, decided_at DESC);

-- ================================================================
-- 2. Helpers and immutable-history guards
-- ================================================================

CREATE OR REPLACE FUNCTION public.knowledge_current_role(p_org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.org_members
  WHERE org_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.knowledge_can_read_item(p_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.knowledge_items i
    WHERE i.id = p_item_id
      AND (
        public.is_org_admin(i.org_id)
        OR (
          public.is_org_member(i.org_id)
          AND i.current_published_version_id IS NOT NULL
          AND public.knowledge_current_role(i.org_id) = ANY(i.audience_roles)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.knowledge_can_read_version(p_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.knowledge_versions v
    JOIN public.knowledge_items i ON i.id = v.item_id
    WHERE v.id = p_version_id
      AND (
        public.is_org_admin(v.org_id)
        OR (
          public.is_org_member(v.org_id)
          AND v.status = 'published'
          AND i.current_published_version_id = v.id
          AND public.knowledge_current_role(v.org_id) = ANY(i.audience_roles)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.knowledge_current_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.knowledge_can_read_item(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.knowledge_can_read_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.knowledge_current_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_can_read_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_can_read_version(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_knowledge_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_knowledge_item_publication_pointer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.current_published_version_id IS DISTINCT FROM OLD.current_published_version_id
     AND COALESCE(current_setting('app.knowledge_publish', true), '') <> '1' THEN
    RAISE EXCEPTION 'Published version pointers may only be changed through publish_knowledge_version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_knowledge_version_publication_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND (NEW.status = 'published' OR OLD.status = 'published')
     AND COALESCE(current_setting('app.knowledge_publish', true), '') <> '1' THEN
    RAISE EXCEPTION 'Published status may only be changed through publish_knowledge_version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_knowledge_draft_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_old_status text;
  v_new_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT status INTO v_old_status
    FROM public.knowledge_versions
    WHERE id = OLD.version_id;
    IF v_old_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Knowledge content is immutable after review begins';
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT status INTO v_new_status
    FROM public.knowledge_versions
    WHERE id = NEW.version_id;
    IF v_new_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Knowledge content is immutable after review begins';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_knowledge_history_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Reviewed or published knowledge versions cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER touch_knowledge_categories_updated_at
  BEFORE UPDATE ON public.knowledge_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_knowledge_updated_at();
CREATE TRIGGER touch_knowledge_items_updated_at
  BEFORE UPDATE ON public.knowledge_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_knowledge_updated_at();
CREATE TRIGGER touch_knowledge_versions_updated_at
  BEFORE UPDATE ON public.knowledge_versions
  FOR EACH ROW EXECUTE FUNCTION public.touch_knowledge_updated_at();
CREATE TRIGGER touch_knowledge_blocks_updated_at
  BEFORE UPDATE ON public.knowledge_blocks
  FOR EACH ROW EXECUTE FUNCTION public.touch_knowledge_updated_at();

CREATE TRIGGER guard_knowledge_item_publication_pointer
  BEFORE UPDATE ON public.knowledge_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_item_publication_pointer();
CREATE TRIGGER guard_knowledge_version_publication_status
  BEFORE UPDATE ON public.knowledge_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_version_publication_status();
CREATE TRIGGER guard_knowledge_blocks_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.knowledge_blocks
  FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_draft_content();
CREATE TRIGGER guard_knowledge_evidence_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.knowledge_evidence
  FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_draft_content();
CREATE TRIGGER guard_knowledge_version_history_delete
  BEFORE DELETE ON public.knowledge_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_history_delete();

-- ================================================================
-- 3. Review and publication RPCs
-- ================================================================

CREATE OR REPLACE FUNCTION public.submit_knowledge_version_for_review(p_version_id uuid)
RETURNS public.knowledge_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_version public.knowledge_versions;
  v_block_count integer;
BEGIN
  SELECT * INTO v_version
  FROM public.knowledge_versions
  WHERE id = p_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge version not found';
  END IF;
  IF NOT public.is_org_admin(v_version.org_id) THEN
    RAISE EXCEPTION 'Only an owner or manager may submit knowledge for review';
  END IF;
  IF v_version.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft versions may be submitted for review';
  END IF;

  SELECT count(*) INTO v_block_count
  FROM public.knowledge_blocks
  WHERE version_id = p_version_id;
  IF v_block_count = 0 THEN
    RAISE EXCEPTION 'A knowledge version must contain at least one block';
  END IF;

  UPDATE public.knowledge_versions
  SET status = 'in_review',
      submitted_by = auth.uid(),
      submitted_at = now()
  WHERE id = p_version_id
  RETURNING * INTO v_version;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, after_json
  ) VALUES (
    auth.uid(), v_version.org_id, auth.uid(), 'knowledge_review_submitted', 'update',
    'knowledge_versions', v_version.id,
    jsonb_build_object('status', v_version.status, 'version_number', v_version.version_number)
  );

  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_knowledge_version(
  p_version_id uuid,
  p_decision text,
  p_note text DEFAULT ''
)
RETURNS public.knowledge_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_version public.knowledge_versions;
  v_new_status text;
BEGIN
  IF p_decision NOT IN ('approved', 'changes_requested') THEN
    RAISE EXCEPTION 'Decision must be approved or changes_requested';
  END IF;

  SELECT * INTO v_version
  FROM public.knowledge_versions
  WHERE id = p_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge version not found';
  END IF;
  IF NOT public.is_org_admin(v_version.org_id) THEN
    RAISE EXCEPTION 'Only an owner or manager may review knowledge';
  END IF;
  IF v_version.status <> 'in_review' THEN
    RAISE EXCEPTION 'Only versions in review may be decided';
  END IF;
  IF v_version.created_by = auth.uid() THEN
    RAISE EXCEPTION 'The author cannot approve their own knowledge version';
  END IF;

  INSERT INTO public.knowledge_reviews (
    org_id, version_id, reviewer_user_id, decision, note
  ) VALUES (
    v_version.org_id, v_version.id, auth.uid(), p_decision, COALESCE(p_note, '')
  )
  ON CONFLICT (version_id, reviewer_user_id)
  DO UPDATE SET
    decision = EXCLUDED.decision,
    note = EXCLUDED.note,
    decided_at = now();

  v_new_status := CASE WHEN p_decision = 'approved' THEN 'approved' ELSE 'draft' END;

  UPDATE public.knowledge_versions
  SET status = v_new_status,
      approved_by = CASE WHEN p_decision = 'approved' THEN auth.uid() ELSE NULL END,
      approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END
  WHERE id = p_version_id
  RETURNING * INTO v_version;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, after_json, reason
  ) VALUES (
    auth.uid(), v_version.org_id, auth.uid(), 'knowledge_review_decided', 'update',
    'knowledge_versions', v_version.id,
    jsonb_build_object('decision', p_decision, 'status', v_new_status),
    NULLIF(COALESCE(p_note, ''), '')
  );

  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_knowledge_version(p_version_id uuid)
RETURNS public.knowledge_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_version public.knowledge_versions;
  v_previous_id uuid;
BEGIN
  SELECT * INTO v_version
  FROM public.knowledge_versions
  WHERE id = p_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge version not found';
  END IF;
  IF NOT public.is_org_admin(v_version.org_id) THEN
    RAISE EXCEPTION 'Only an owner or manager may publish knowledge';
  END IF;
  IF v_version.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved version may be published';
  END IF;
  IF v_version.approved_by IS NULL OR v_version.approved_by = v_version.created_by THEN
    RAISE EXCEPTION 'Publication requires approval by someone other than the author';
  END IF;

  PERFORM 1
  FROM public.knowledge_items
  WHERE id = v_version.item_id
  FOR UPDATE;

  SELECT id INTO v_previous_id
  FROM public.knowledge_versions
  WHERE item_id = v_version.item_id
    AND status = 'published'
  FOR UPDATE;

  PERFORM set_config('app.knowledge_publish', '1', true);

  IF v_previous_id IS NOT NULL THEN
    UPDATE public.knowledge_versions
    SET status = 'superseded'
    WHERE id = v_previous_id;
  END IF;

  UPDATE public.knowledge_versions
  SET status = 'published',
      published_by = auth.uid(),
      published_at = now()
  WHERE id = p_version_id
  RETURNING * INTO v_version;

  UPDATE public.knowledge_items
  SET current_published_version_id = v_version.id
  WHERE id = v_version.item_id;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, before_json, after_json
  ) VALUES (
    auth.uid(), v_version.org_id, auth.uid(), 'knowledge_version_published', 'update',
    'knowledge_versions', v_version.id,
    jsonb_build_object('previous_version_id', v_previous_id),
    jsonb_build_object('published_version_id', v_version.id, 'version_number', v_version.version_number)
  );

  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_knowledge_version_for_review(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_knowledge_version(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_knowledge_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_knowledge_version_for_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_knowledge_version(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_knowledge_version(uuid) TO authenticated;

-- ================================================================
-- 4. RLS and grants
-- ================================================================

ALTER TABLE public.knowledge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_reviews ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_blocks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_evidence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_reviews TO authenticated;
GRANT ALL ON public.knowledge_categories TO service_role;
GRANT ALL ON public.knowledge_items TO service_role;
GRANT ALL ON public.knowledge_versions TO service_role;
GRANT ALL ON public.knowledge_blocks TO service_role;
GRANT ALL ON public.knowledge_evidence TO service_role;
GRANT ALL ON public.knowledge_reviews TO service_role;

CREATE POLICY "Members read knowledge categories"
  ON public.knowledge_categories FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));
CREATE POLICY "Admins manage knowledge categories"
  ON public.knowledge_categories FOR ALL
  TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "Members read visible published knowledge items"
  ON public.knowledge_items FOR SELECT
  TO authenticated
  USING (public.knowledge_can_read_item(id));
CREATE POLICY "Admins manage knowledge items"
  ON public.knowledge_items FOR ALL
  TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "Members read visible published knowledge versions"
  ON public.knowledge_versions FOR SELECT
  TO authenticated
  USING (public.knowledge_can_read_version(id));
CREATE POLICY "Admins manage knowledge versions"
  ON public.knowledge_versions FOR ALL
  TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "Members read visible published knowledge blocks"
  ON public.knowledge_blocks FOR SELECT
  TO authenticated
  USING (public.knowledge_can_read_version(version_id));
CREATE POLICY "Admins manage knowledge blocks"
  ON public.knowledge_blocks FOR ALL
  TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "Admins manage knowledge evidence"
  ON public.knowledge_evidence FOR ALL
  TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "Admins manage knowledge reviews"
  ON public.knowledge_reviews FOR ALL
  TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

COMMENT ON TABLE public.knowledge_items IS
  'Canonical policy and procedure catalog. office_docs remain source evidence, not published truth.';
COMMENT ON TABLE public.knowledge_versions IS
  'Immutable-after-submission versions with separate review, approval, and publication states.';
COMMENT ON TABLE public.knowledge_blocks IS
  'Structured content blocks for handbook and playbook rendering.';
COMMENT ON TABLE public.knowledge_evidence IS
  'Traceable evidence linking canonical knowledge back to uploaded source documents and chunks.';