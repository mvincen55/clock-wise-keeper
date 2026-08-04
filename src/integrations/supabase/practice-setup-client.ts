import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

type TableDefinition<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type PracticeSetupSessionRow = {
  id: string;
  org_id: string;
  status: 'reviewing' | 'ready' | 'completed';
  created_by: string;
  last_scanned_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PracticeSetupSourceRow = {
  id: string;
  org_id: string;
  session_id: string;
  office_doc_id: string;
  status: 'pending' | 'confirmed' | 'source_only' | 'excluded' | 'converted';
  suggested_action: 'policy' | 'procedure' | 'source_only' | 'exclude' | 'review';
  confirmed_action: 'policy' | 'procedure' | 'source_only' | 'exclude' | null;
  suggestion_reason: string;
  confidence: number;
  duplicate_key: string;
  confirmed_category_id: string | null;
  converted_item_id: string | null;
  converted_version_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PracticeSetupFindingRow = {
  id: string;
  org_id: string;
  session_id: string;
  finding_type: 'possible_duplicate' | 'placement_mismatch' | 'empty_document' | 'large_mixed_document';
  severity: 'info' | 'review' | 'attention';
  group_key: string;
  title: string;
  detail: string;
  status: 'open' | 'resolved' | 'dismissed';
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PracticeSetupFindingSourceRow = {
  finding_id: string;
  source_id: string;
  org_id: string;
  created_at: string;
};

type PracticeSetupDatabase = {
  __InternalSupabase: { PostgrestVersion: '14.1' };
  public: {
    Tables: {
      practice_setup_sessions: TableDefinition<PracticeSetupSessionRow>;
      practice_setup_sources: TableDefinition<PracticeSetupSourceRow>;
      practice_setup_findings: TableDefinition<PracticeSetupFindingRow>;
      practice_setup_finding_sources: TableDefinition<PracticeSetupFindingSourceRow>;
    };
    Views: Record<string, never>;
    Functions: {
      initialize_practice_setup: {
        Args: { p_org_id: string };
        Returns: string;
      };
      confirm_practice_setup_source: {
        Args: { p_source_id: string; p_action: string; p_category_id?: string | null };
        Returns: PracticeSetupSourceRow;
      };
      convert_practice_setup_source: {
        Args: { p_source_id: string; p_title: string; p_summary: string; p_blocks: Json };
        Returns: string;
      };
      resolve_practice_setup_finding: {
        Args: { p_finding_id: string; p_status: string };
        Returns: PracticeSetupFindingRow;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export const practiceSetupSupabase = supabase as unknown as SupabaseClient<PracticeSetupDatabase>;
