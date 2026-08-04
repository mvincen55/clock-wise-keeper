-- Version titles, summaries, categories, and audiences so editing a draft does
-- not change the currently published office copy. Also tighten composite
-- foreign keys so evidence and hierarchy links cannot cross organizations.

-- ================================================================
-- 1. Version-owned metadata
-- ================================================================

ALTER TABLE public.knowledge_versions
  ADD COLUMN title text,
  ADD COLUMN summary text,
  ADD COLUMN category_id uuid,
  ADD COLUMN audience_roles text[];

UPDATE public.knowledge_versions v
SET title = i.title,
    summary = i.summary,
    category_id = i.category_id,
    audience_roles = i.audience_roles
FROM public.knowledge_items i
WHERE i.id = v.item_id;

ALTER TABLE public.knowledge_versions
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN summary SET NOT NULL,
  ALTER COLUMN summary SET DEFAULT '',
  ALTER COLUMN audience_roles SET NOT NULL,
  ALTER COLUMN audience_roles SET DEFAULT ARRAY['owner', 'manager', 'employee']::text[];

ALTER TABLE public.knowledge_versions
  ADD CONSTRAINT knowledge_versions_title_check
    CHECK (length(trim(title)) > 0),
  ADD CONSTRAINT knowledge_versions_audience_roles_check
    CHECK (
      audience_roles <@ ARRAY['owner', 'manager', 'employee']::text[]
      AND cardinality(audience_roles) > 0
    ),
  ADD CONSTRAINT knowledge_versions_category_fk
    FOREIGN KEY (category_id, org_id)
    REFERENCES public.knowledge_categories(id, org_id)
    ON DELETE RESTRICT;

CREATE INDEX knowledge_versions_category_idx
  ON public.knowledge_versions(org_id, category_id, status);

-- ================================================================
-- 2. Organization-consistent references
-- ================================================================

CREATE UNIQUE INDEX IF NOT EXISTS office_docs_id_org_id_unique
  ON public.office_docs(id, org_id);
CREATE UNIQUE INDEX IF NOT EXISTS office_doc_chunks_id_org_id_unique
  ON public.office_doc_chunks(id, org_id);
CREATE UNIQUE INDEX knowledge_versions_id_org_item_unique
  ON public.knowledge_versions(id, org_id, item_id);

ALTER TABLE public.knowledge_categories
  DROP CONSTRAINT IF EXISTS knowledge_categories_parent_id_fkey;
ALTER TABLE public.knowledge_categories
  ADD CONSTRAINT knowledge_categories_parent_org_fk
  FOREIGN KEY (parent_id, org_id)
  REFERENCES public.knowledge_categories(id, org_id)
  ON DELETE RESTRICT;

ALTER TABLE public.knowledge_versions
  DROP CONSTRAINT IF EXISTS knowledge_versions_based_on_fk;
ALTER TABLE public.knowledge_versions
  ADD CONSTRAINT knowledge_versions_based_on_same_item_fk
  FOREIGN KEY (based_on_version_id, org_id, item_id)
  REFERENCES public.knowledge_versions(id, org_id, item_id)
  ON DELETE SET NULL;

ALTER TABLE public.knowledge_items
  DROP CONSTRAINT IF EXISTS knowledge_items_current_version_fk;
ALTER TABLE public.knowledge_items
  ADD CONSTRAINT knowledge_items_current_version_same_item_fk
  FOREIGN KEY (current_published_version_id, org_id, id)
  REFERENCES public.knowledge_versions(id, org_id, item_id)
  ON DELETE RESTRICT;

ALTER TABLE public.knowledge_evidence
  DROP CONSTRAINT IF EXISTS knowledge_evidence_office_doc_id_fkey,
  DROP CONSTRAINT IF EXISTS knowledge_evidence_office_doc_chunk_id_fkey;
ALTER TABLE public.knowledge_evidence
  ADD CONSTRAINT knowledge_evidence_office_doc_org_fk
    FOREIGN KEY (office_doc_id, org_id)
    REFERENCES public.office_docs(id, org_id)
    ON DELETE SET NULL,
  ADD CONSTRAINT knowledge_evidence_office_doc_chunk_org_fk
    FOREIGN KEY (office_doc_chunk_id, org_id)
    REFERENCES public.office_doc_chunks(id, org_id)
    ON DELETE SET NULL;

-- ================================================================
-- 3. Visibility and immutable metadata guards
-- ================================================================

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
    JOIN public.knowledge_versions v
      ON v.id = i.current_published_version_id
     AND v.item_id = i.id
     AND v.org_id = i.org_id
    WHERE i.id = p_item_id
      AND (
        public.is_org_admin(i.org_id)
        OR (
          public.is_org_member(i.org_id)
          AND v.status = 'published'
          AND public.knowledge_current_role(i.org_id) = ANY(v.audience_roles)
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
    JOIN public.knowledge_items i
      ON i.id = v.item_id
     AND i.org_id = v.org_id
    WHERE v.id = p_version_id
      AND (
        public.is_org_admin(v.org_id)
        OR (
          public.is_org_member(v.org_id)
          AND v.status = 'published'
          AND i.current_published_version_id = v.id
          AND public.knowledge_current_role(v.org_id) = ANY(v.audience_roles)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.guard_knowledge_item_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'Knowledge identity fields cannot be changed after creation';
  END IF;

  IF (
    NEW.title IS DISTINCT FROM OLD.title
    OR NEW.summary IS DISTINCT FROM OLD.summary
    OR NEW.category_id IS DISTINCT FROM OLD.category_id
    OR NEW.audience_roles IS DISTINCT FROM OLD.audience_roles
  ) AND COALESCE(current_setting('app.knowledge_publish', true), '') <> '1' THEN
    RAISE EXCEPTION 'Published knowledge metadata changes only when a version is published';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_knowledge_version_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.item_id IS DISTINCT FROM OLD.item_id
     OR NEW.version_number IS DISTINCT FROM OLD.version_number
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Knowledge version identity fields are immutable';
  END IF;

  IF (
    NEW.title IS DISTINCT FROM OLD.title
    OR NEW.summary IS DISTINCT FROM OLD.summary
    OR NEW.category_id IS DISTINCT FROM OLD.category_id
    OR NEW.audience_roles IS DISTINCT FROM OLD.audience_roles
    OR NEW.change_summary IS DISTINCT FROM OLD.change_summary
    OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
    OR NEW.based_on_version_id IS DISTINCT FROM OLD.based_on_version_id
    OR NEW.effective_on IS DISTINCT FROM OLD.effective_on
    OR NEW.review_due_on IS DISTINCT FROM OLD.review_due_on
  ) THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Reviewed or published knowledge metadata is immutable';
    END IF;
    IF COALESCE(current_setting('app.knowledge_authoring', true), '') <> '1' THEN
      RAISE EXCEPTION 'Draft metadata may only be changed through save_knowledge_draft';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_knowledge_version_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT kind INTO v_kind
  FROM public.knowledge_items
  WHERE id = NEW.item_id
    AND org_id = NEW.org_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'Knowledge item not found';
  END IF;

  PERFORM public.knowledge_assert_category_matches_kind(
    NEW.org_id,
    NEW.category_id,
    v_kind
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_knowledge_item_metadata
  BEFORE UPDATE ON public.knowledge_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_item_metadata();
CREATE TRIGGER guard_knowledge_version_metadata
  BEFORE UPDATE ON public.knowledge_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_version_metadata();
CREATE TRIGGER guard_knowledge_version_category
  BEFORE INSERT OR UPDATE OF category_id, item_id, org_id
  ON public.knowledge_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_version_category();

-- ================================================================
-- 4. Replace authoring actions to write version-owned metadata
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_knowledge_draft(
  p_kind text,
  p_title text,
  p_summary text DEFAULT '',
  p_category_id uuid DEFAULT NULL,
  p_audience_roles text[] DEFAULT ARRAY['owner', 'manager', 'employee']::text[],
  p_blocks jsonb DEFAULT '[{"block_type":"paragraph","plain_text":"Start writing here.","data":{}}]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
  v_item_id uuid;
  v_version_id uuid;
  v_slug text;
  v_block jsonb;
  v_index integer := 0;
BEGIN
  SELECT org_id, role::text
  INTO v_org_id, v_role
  FROM public.org_members
  WHERE user_id = auth.uid()
    AND status = 'active'
  ORDER BY created_at
  LIMIT 1;

  IF v_org_id IS NULL OR v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager may create knowledge';
  END IF;
  IF p_kind NOT IN ('policy', 'procedure') THEN
    RAISE EXCEPTION 'Knowledge kind must be policy or procedure';
  END IF;
  IF trim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'A title is required';
  END IF;
  IF NOT (
    p_audience_roles <@ ARRAY['owner', 'manager', 'employee']::text[]
    AND cardinality(p_audience_roles) > 0
  ) THEN
    RAISE EXCEPTION 'Select at least one valid audience role';
  END IF;

  PERFORM public.knowledge_assert_category_matches_kind(v_org_id, p_category_id, p_kind);
  PERFORM public.knowledge_validate_blocks(p_blocks);
  v_slug := public.knowledge_unique_slug(v_org_id, p_kind, p_title, NULL);

  INSERT INTO public.knowledge_items (
    org_id, category_id, kind, title, slug, summary,
    audience_roles, created_by
  ) VALUES (
    v_org_id, p_category_id, p_kind, trim(p_title), v_slug,
    trim(COALESCE(p_summary, '')), p_audience_roles, auth.uid()
  ) RETURNING id INTO v_item_id;

  INSERT INTO public.knowledge_versions (
    org_id, item_id, version_number, status, source_kind, created_by,
    title, summary, category_id, audience_roles
  ) VALUES (
    v_org_id, v_item_id, 1, 'draft', 'manual', auth.uid(),
    trim(p_title), trim(COALESCE(p_summary, '')), p_category_id, p_audience_roles
  ) RETURNING id INTO v_version_id;

  FOR v_block IN SELECT value FROM jsonb_array_elements(p_blocks)
  LOOP
    INSERT INTO public.knowledge_blocks (
      org_id, version_id, block_key, block_type, sort_order,
      plain_text, data
    ) VALUES (
      v_org_id,
      v_version_id,
      COALESCE(NULLIF(v_block ->> 'block_key', ''), gen_random_uuid()::text),
      v_block ->> 'block_type',
      v_index,
      COALESCE(v_block ->> 'plain_text', ''),
      COALESCE(v_block -> 'data', '{}'::jsonb)
    );
    v_index := v_index + 1;
  END LOOP;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, after_json
  ) VALUES (
    auth.uid(), v_org_id, auth.uid(), 'knowledge_draft_created', 'insert',
    'knowledge_items', v_item_id,
    jsonb_build_object('kind', p_kind, 'title', trim(p_title), 'version_id', v_version_id)
  );

  RETURN v_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_knowledge_draft(
  p_version_id uuid,
  p_title text,
  p_summary text DEFAULT '',
  p_category_id uuid DEFAULT NULL,
  p_audience_roles text[] DEFAULT ARRAY['owner', 'manager', 'employee']::text[],
  p_change_summary text DEFAULT '',
  p_blocks jsonb DEFAULT '[]'::jsonb
)
RETURNS public.knowledge_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version public.knowledge_versions;
  v_kind text;
  v_role text;
  v_block jsonb;
  v_index integer := 0;
BEGIN
  SELECT * INTO v_version
  FROM public.knowledge_versions
  WHERE id = p_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge version not found';
  END IF;

  SELECT role::text INTO v_role
  FROM public.org_members
  WHERE org_id = v_version.org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager may edit knowledge';
  END IF;
  IF v_version.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft versions may be edited';
  END IF;
  IF trim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'A title is required';
  END IF;
  IF NOT (
    p_audience_roles <@ ARRAY['owner', 'manager', 'employee']::text[]
    AND cardinality(p_audience_roles) > 0
  ) THEN
    RAISE EXCEPTION 'Select at least one valid audience role';
  END IF;

  SELECT kind INTO v_kind
  FROM public.knowledge_items
  WHERE id = v_version.item_id;

  PERFORM public.knowledge_assert_category_matches_kind(
    v_version.org_id,
    p_category_id,
    v_kind
  );
  PERFORM public.knowledge_validate_blocks(p_blocks);
  PERFORM set_config('app.knowledge_authoring', '1', true);

  UPDATE public.knowledge_versions
  SET title = trim(p_title),
      summary = trim(COALESCE(p_summary, '')),
      category_id = p_category_id,
      audience_roles = p_audience_roles,
      change_summary = trim(COALESCE(p_change_summary, ''))
  WHERE id = p_version_id
  RETURNING * INTO v_version;

  DELETE FROM public.knowledge_blocks WHERE version_id = p_version_id;
  FOR v_block IN SELECT value FROM jsonb_array_elements(p_blocks)
  LOOP
    INSERT INTO public.knowledge_blocks (
      org_id, version_id, block_key, block_type, sort_order,
      plain_text, data
    ) VALUES (
      v_version.org_id,
      p_version_id,
      COALESCE(NULLIF(v_block ->> 'block_key', ''), gen_random_uuid()::text),
      v_block ->> 'block_type',
      v_index,
      COALESCE(v_block ->> 'plain_text', ''),
      COALESCE(v_block -> 'data', '{}'::jsonb)
    );
    v_index := v_index + 1;
  END LOOP;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, after_json
  ) VALUES (
    auth.uid(), v_version.org_id, auth.uid(), 'knowledge_draft_saved', 'update',
    'knowledge_versions', p_version_id,
    jsonb_build_object('title', v_version.title, 'block_count', v_index)
  );

  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_knowledge_revision(p_item_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.knowledge_items;
  v_source public.knowledge_versions;
  v_role text;
  v_new_version_id uuid;
  v_next_number integer;
BEGIN
  SELECT * INTO v_item
  FROM public.knowledge_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge item not found';
  END IF;

  SELECT role::text INTO v_role
  FROM public.org_members
  WHERE org_id = v_item.org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager may create a revision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.knowledge_versions
    WHERE item_id = p_item_id AND status IN ('draft', 'in_review', 'approved')
  ) THEN
    RAISE EXCEPTION 'This item already has an open revision';
  END IF;

  SELECT * INTO v_source
  FROM public.knowledge_versions
  WHERE item_id = p_item_id
    AND status IN ('published', 'superseded')
  ORDER BY version_number DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A published or superseded version is required before creating a revision';
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1
  INTO v_next_number
  FROM public.knowledge_versions
  WHERE item_id = p_item_id;

  INSERT INTO public.knowledge_versions (
    org_id, item_id, version_number, status, source_kind,
    based_on_version_id, created_by,
    title, summary, category_id, audience_roles
  ) VALUES (
    v_item.org_id, p_item_id, v_next_number, 'draft', 'manual',
    v_source.id, auth.uid(),
    v_source.title, v_source.summary, v_source.category_id, v_source.audience_roles
  ) RETURNING id INTO v_new_version_id;

  INSERT INTO public.knowledge_blocks (
    org_id, version_id, block_key, block_type, sort_order,
    plain_text, data
  )
  SELECT
    org_id, v_new_version_id, gen_random_uuid()::text, block_type,
    sort_order, plain_text, data
  FROM public.knowledge_blocks
  WHERE version_id = v_source.id
  ORDER BY sort_order, id;

  INSERT INTO public.knowledge_evidence (
    org_id, version_id, office_doc_id, office_doc_chunk_id,
    relation, excerpt, source_label, source_page, confidence, created_by
  )
  SELECT
    org_id, v_new_version_id, office_doc_id, office_doc_chunk_id,
    relation, excerpt, source_label, source_page, confidence, auth.uid()
  FROM public.knowledge_evidence
  WHERE version_id = v_source.id;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, before_json, after_json
  ) VALUES (
    auth.uid(), v_item.org_id, auth.uid(), 'knowledge_revision_created', 'insert',
    'knowledge_versions', v_new_version_id,
    jsonb_build_object('based_on_version_id', v_source.id),
    jsonb_build_object('version_number', v_next_number)
  );

  RETURN v_new_version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_knowledge_version(p_version_id uuid)
RETURNS public.knowledge_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version public.knowledge_versions;
  v_role text;
  v_previous_id uuid;
BEGIN
  SELECT * INTO v_version
  FROM public.knowledge_versions
  WHERE id = p_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge version not found';
  END IF;

  SELECT role::text INTO v_role
  FROM public.org_members
  WHERE org_id = v_version.org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager may publish knowledge';
  END IF;
  IF v_version.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved version may be published';
  END IF;
  IF v_version.approved_by IS NULL OR v_version.approved_by = v_version.created_by THEN
    RAISE EXCEPTION 'Publication requires approval by someone other than the author';
  END IF;

  PERFORM 1 FROM public.knowledge_items
  WHERE id = v_version.item_id
  FOR UPDATE;

  SELECT id INTO v_previous_id
  FROM public.knowledge_versions
  WHERE item_id = v_version.item_id
    AND status = 'published'
  FOR UPDATE;

  PERFORM set_config('app.knowledge_workflow', '1', true);
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
  SET current_published_version_id = v_version.id,
      title = v_version.title,
      summary = v_version.summary,
      category_id = v_version.category_id,
      audience_roles = v_version.audience_roles
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

COMMENT ON COLUMN public.knowledge_versions.title IS
  'Version-owned title; published item metadata changes only at publication.';
COMMENT ON COLUMN public.knowledge_versions.audience_roles IS
  'Version-owned visibility so draft audience changes do not affect the live version.';
