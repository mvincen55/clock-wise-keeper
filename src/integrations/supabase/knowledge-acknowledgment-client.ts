import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

/** Temporary isolated bridge until the acknowledgment migrations are applied and Supabase types are regenerated. */
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
  blocked_at: string | null;
  blocked_reason: string;
  blocking_user_id: string | null;
  snoozed_until: string | null;
  snooze_reason: string;
  snooze_count: number;
  question_text: string;
  question_asked_at: string | null;
  question_resolved_at: string | null;
  question_resolution: string;
  escalation_level: number;
  overdue_at: string | null;
  last_escalated_at: string | null;
  next_escalation_at: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeAcknowledgmentEventType =
  | 'assigned'
  | 'viewed'
  | 'blocked'
  | 'unblocked'
  | 'snoozed'
  | 'question_asked'
  | 'question_resolved'
  | 'overdue'
  | 'acknowledged'
  | 'waived'
  | 'reminder_in_app'
  | 'reminder_email_queued'
  | 'manager_escalated'
  | 'owner_escalated'
  | 'reactivated';

export type KnowledgeAcknowledgmentEventRow = {
  id: string;
  org_id: string;
  assignment_id: string;
  event_key: string;
  event_type: KnowledgeAcknowledgmentEventType;
  channel: 'system' | 'in_app' | 'email' | 'sms';
  actor_user_id: string | null;
  recipient_user_id: string | null;
  detail: string;
  metadata: Json;
  created_at: string;
};

export type KnowledgeAcknowledgmentEscalationSettingsRow = {
  org_id: string;
  routine_reminders_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  email_after_workdays: number;
  manager_after_workdays: number;
  owner_after_workdays: number;
  max_snoozes: number;
  max_snooze_workdays: number;
  question_pauses_escalation: boolean;
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
      knowledge_acknowledgment_events: TableDefinition<KnowledgeAcknowledgmentEventRow>;
      knowledge_acknowledgment_escalation_settings: TableDefinition<KnowledgeAcknowledgmentEscalationSettingsRow>;
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
      acknowledge_knowledge_version_with_question: {
        Args: { p_assignment_id: string; p_typed_name: string; p_question?: string | null };
        Returns: KnowledgeAcknowledgmentRow;
      };
      block_knowledge_acknowledgment: {
        Args: { p_assignment_id: string; p_reason: string; p_blocking_user_id?: string | null };
        Returns: KnowledgeAcknowledgmentRow;
      };
      unblock_knowledge_acknowledgment: {
        Args: { p_assignment_id: string; p_note?: string };
        Returns: KnowledgeAcknowledgmentRow;
      };
      snooze_knowledge_acknowledgment: {
        Args: { p_assignment_id: string; p_reason: string; p_workdays: number };
        Returns: KnowledgeAcknowledgmentRow;
      };
      ask_knowledge_acknowledgment_question: {
        Args: { p_assignment_id: string; p_question: string };
        Returns: KnowledgeAcknowledgmentRow;
      };
      resolve_knowledge_acknowledgment_question: {
        Args: { p_assignment_id: string; p_resolution: string };
        Returns: KnowledgeAcknowledgmentRow;
      };
      save_knowledge_acknowledgment_escalation_settings: {
        Args: {
          p_org_id: string;
          p_routine_reminders_enabled: boolean;
          p_quiet_hours_start: string;
          p_quiet_hours_end: string;
          p_email_after_workdays: number;
          p_manager_after_workdays: number;
          p_owner_after_workdays: number;
          p_max_snoozes: number;
          p_max_snooze_workdays: number;
          p_question_pauses_escalation: boolean;
        };
        Returns: KnowledgeAcknowledgmentEscalationSettingsRow;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export const acknowledgmentSupabase = supabase as unknown as SupabaseClient<AckDatabase>;
