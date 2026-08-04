import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

/** Temporary isolated bridge until the acknowledgment migration is applied and Supabase types are regenerated. */
type TableDefinition<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type KnowledgeAcknowledgmentRow = {
  id: string;
  org_id: string;
  version_id: string;
  user_id: string;
  employee_id: string | null;
  role_at_assignment: 'owner' | 'manager' | 'employee';
  title_snapshot: string;
  version_number_snapshot: number;
  statement_snapshot: string;
  assigned_at: string;
  due_at: string;
  first_viewed_at: string | null;
  acknowledged_at: string | null;
  signed_name: string;
  waived_at: string | null;
  waived_reason: string;
  created_at: string;
  updated_at: string;
};

export type KnowledgeAcknowledgmentSettingsRow = {
  id: string;
  org_id: string;
  acknowledgment_required: boolean;
  acknowledgment_due_days: number | null;
  acknowledgment_statement: string;
};

type AckDatabase = {
  __InternalSupabase: { PostgrestVersion: '14.1' };
  public: {
    Tables: {
      knowledge_acknowledgments: TableDefinition<KnowledgeAcknowledgmentRow>;
      knowledge_versions: TableDefinition<KnowledgeAcknowledgmentSettingsRow>;
    };
    Views: Record<string, never>;
    Functions: {
      create_knowledge_draft_with_acknowledgment: {
        Args: {
          p_org_id: string;
          p_kind: string;
          p_title: string;
          p_summary?: string;
          p_category_id?: string | null;
          p_audience_roles?: string[];
          p_blocks?: Json;
          p_acknowledgment_required?: boolean;
          p_acknowledgment_due_days?: number | null;
          p_acknowledgment_statement?: string | null;
        };
        Returns: string;
      };
      save_knowledge_draft_with_acknowledgment: {
        Args: {
          p_version_id: string;
          p_title: string;
          p_summary?: string;
          p_category_id?: string | null;
          p_audience_roles?: string[];
          p_change_summary?: string;
          p_blocks?: Json;
          p_acknowledgment_required?: boolean;
          p_acknowledgment_due_days?: number | null;
          p_acknowledgment_statement?: string | null;
        };
        Returns: KnowledgeAcknowledgmentSettingsRow;
      };
      mark_knowledge_acknowledgment_viewed: {
        Args: { p_assignment_id: string };
        Returns: KnowledgeAcknowledgmentRow;
      };
      acknowledge_knowledge_version: {
        Args: { p_assignment_id: string; p_typed_name: string };
        Returns: KnowledgeAcknowledgmentRow;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export const acknowledgmentSupabase = supabase as unknown as SupabaseClient<AckDatabase>;
