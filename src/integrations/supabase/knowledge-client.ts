import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

/**
 * Narrow type bridge for the knowledge schema introduced by this branch.
 * The generated Database type cannot include unapplied migrations yet. Keeping
 * this bridge isolated preserves type safety without hand-editing generated code.
 * Regenerate Supabase types after the migrations are applied, then delete this file.
 */
type TableDefinition<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type KnowledgeCategoryRow = {
  id: string;
  org_id: string;
  area: 'handbook' | 'playbook';
  parent_id: string | null;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type KnowledgeItemRow = {
  id: string;
  org_id: string;
  category_id: string | null;
  kind: 'policy' | 'procedure';
  title: string;
  slug: string;
  summary: string;
  audience_roles: Array<'owner' | 'manager' | 'employee'>;
  current_published_version_id: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type KnowledgeVersionStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'published'
  | 'superseded'
  | 'retired';

export type KnowledgeVersionRow = {
  id: string;
  org_id: string;
  item_id: string;
  version_number: number;
  status: KnowledgeVersionStatus;
  change_summary: string;
  source_kind: 'manual' | 'imported' | 'ai_assisted' | 'migrated';
  based_on_version_id: string | null;
  effective_on: string | null;
  review_due_on: string | null;
  created_by: string;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeBlockRow = {
  id: string;
  org_id: string;
  version_id: string;
  block_key: string;
  block_type:
    | 'heading'
    | 'paragraph'
    | 'bullet_list'
    | 'numbered_list'
    | 'callout'
    | 'steps'
    | 'table'
    | 'script'
    | 'checklist'
    | 'image'
    | 'divider';
  sort_order: number;
  plain_text: string;
  data: Json;
  created_at: string;
  updated_at: string;
};

export type KnowledgeReviewRow = {
  id: string;
  org_id: string;
  version_id: string;
  reviewer_user_id: string;
  decision: 'approved' | 'changes_requested';
  note: string;
  decided_at: string;
};

type KnowledgeDatabase = {
  public: {
    Tables: {
      knowledge_categories: TableDefinition<
        KnowledgeCategoryRow,
        Partial<KnowledgeCategoryRow> & Pick<KnowledgeCategoryRow, 'org_id' | 'area' | 'name' | 'slug' | 'created_by'>,
        Partial<KnowledgeCategoryRow>
      >;
      knowledge_items: TableDefinition<
        KnowledgeItemRow,
        Partial<KnowledgeItemRow> & Pick<KnowledgeItemRow, 'org_id' | 'kind' | 'title' | 'slug' | 'created_by'>,
        Partial<KnowledgeItemRow>
      >;
      knowledge_versions: TableDefinition<
        KnowledgeVersionRow,
        Partial<KnowledgeVersionRow> & Pick<KnowledgeVersionRow, 'org_id' | 'item_id' | 'version_number' | 'created_by'>,
        Partial<KnowledgeVersionRow>
      >;
      knowledge_blocks: TableDefinition<
        KnowledgeBlockRow,
        Partial<KnowledgeBlockRow> & Pick<KnowledgeBlockRow, 'org_id' | 'version_id' | 'block_type'>,
        Partial<KnowledgeBlockRow>
      >;
      knowledge_reviews: TableDefinition<
        KnowledgeReviewRow,
        Partial<KnowledgeReviewRow> & Pick<KnowledgeReviewRow, 'org_id' | 'version_id' | 'reviewer_user_id' | 'decision'>,
        Partial<KnowledgeReviewRow>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      ensure_default_knowledge_categories: {
        Args: Record<string, never>;
        Returns: KnowledgeCategoryRow[];
      };
      create_knowledge_draft: {
        Args: {
          p_kind: 'policy' | 'procedure';
          p_title: string;
          p_summary?: string;
          p_category_id?: string | null;
          p_audience_roles?: string[];
          p_blocks?: Json;
        };
        Returns: string;
      };
      save_knowledge_draft: {
        Args: {
          p_version_id: string;
          p_title: string;
          p_summary?: string;
          p_category_id?: string | null;
          p_audience_roles?: string[];
          p_change_summary?: string;
          p_blocks?: Json;
        };
        Returns: KnowledgeVersionRow;
      };
      create_knowledge_revision: {
        Args: { p_item_id: string };
        Returns: string;
      };
      submit_knowledge_version_for_review: {
        Args: { p_version_id: string };
        Returns: KnowledgeVersionRow;
      };
      review_knowledge_version: {
        Args: { p_version_id: string; p_decision: string; p_note?: string };
        Returns: KnowledgeVersionRow;
      };
      publish_knowledge_version: {
        Args: { p_version_id: string };
        Returns: KnowledgeVersionRow;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export const knowledgeSupabase = supabase as unknown as SupabaseClient<KnowledgeDatabase>;
