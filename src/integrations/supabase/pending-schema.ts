import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as generatedClient } from './client';
import type { Database as Generated, Json } from './types';
import type { Campaign, Participant, Activity, Calls, Huddle, Metric, PrizePick, Audit, ScheduleSheet, ScheduleSheetRow, WeeklyCheck, RosterName } from '@/lib/fill-the-schedule';

/**
 * Schema the repository carries ahead of the live database.
 *
 * Lovable regenerates ./types.ts from the live database whenever its agent
 * syncs, so a table, column, or function whose migration is merged here but
 * not yet applied live disappears from the generated file on the next sync
 * (commit cd652fe did exactly that and broke typecheck on main). This module
 * declares those objects itself and merges them over the generated type:
 * where the generated file has the object, the generated definition wins;
 * where it does not, the declaration below fills the gap. The client
 * exported here is the same instance as ./client, only typed with the merged
 * schema, so nothing about what runs changes.
 *
 * Covered migrations. Delete an entry once its migration is applied live and
 * types.ts has been regenerated with it; by then the merge is a no-op.
 *
 *   20260922120000_manager_followups      manager_followups;
 *                                         payroll_settings.payroll_due_days_after_period,
 *                                         payroll_settings.pay_period_anchor
 *   20260922150000_manager_audited_paths  seal_close_day, reverse_pto_approval,
 *                                         withdraw_knowledge_approval
 *   20260922160000_office_pto_policy      org_pto_policy; pto_settings.policy_override;
 *                                         set_org_pto_policy
 *   20260929120000_pto_balance_guard      pto_available_hours, pto_allows_negative
 *   20261005181000_fill_the_schedule     fts_* campaign tables and write RPCs
 *   20261006090000_late_rule_counts_from escalation_policies.counts_from
 *   20261006093000_pto_usage             pto_usage; record_pto_usage, void_pto_usage
 *   20261006120000_doctor_titles         employees.title; save_team_member_contact(p_title)
 *
 * Same idea as ./knowledge-client.ts, generalised: one module, one merge.
 */

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type GeneratedSchema = Generated['public'];
type GeneratedTables = GeneratedSchema['Tables'];
type GeneratedFunctions = GeneratedSchema['Functions'];
type GeneratedRow<T extends keyof GeneratedTables> = GeneratedTables[T]['Row'];

/** 20260922120000_manager_followups.sql */
export type ManagerFollowupsTable = {
  Row: {
    created_at: string;
    created_by: string;
    due_at: string | null;
    id: string;
    item_key: string;
    note: string | null;
    org_id: string;
    owner_user_id: string | null;
    parked_until: string | null;
    requested_at: string | null;
    snoozed_until: string | null;
    updated_at: string;
    updated_by: string;
    work_state: string;
  };
  Insert: {
    created_at?: string;
    created_by: string;
    due_at?: string | null;
    id?: string;
    item_key: string;
    note?: string | null;
    org_id: string;
    owner_user_id?: string | null;
    parked_until?: string | null;
    requested_at?: string | null;
    snoozed_until?: string | null;
    updated_at?: string;
    updated_by: string;
    work_state?: string;
  };
  Update: {
    created_at?: string;
    created_by?: string;
    due_at?: string | null;
    id?: string;
    item_key?: string;
    note?: string | null;
    org_id?: string;
    owner_user_id?: string | null;
    parked_until?: string | null;
    requested_at?: string | null;
    snoozed_until?: string | null;
    updated_at?: string;
    updated_by?: string;
    work_state?: string;
  };
  Relationships: [
    {
      foreignKeyName: 'manager_followups_org_id_fkey';
      columns: ['org_id'];
      isOneToOne: false;
      referencedRelation: 'orgs';
      referencedColumns: ['id'];
    },
  ];
};

/** 20260922160000_office_pto_policy.sql */
export type OrgPtoPolicyTable = {
  Row: {
    allow_negative: boolean;
    created_at: string;
    max_balance: number;
    org_id: string;
    updated_at: string;
    updated_by: string | null;
    worked_hours_cap_weekly: number;
  };
  Insert: {
    allow_negative?: boolean;
    created_at?: string;
    max_balance?: number;
    org_id: string;
    updated_at?: string;
    updated_by?: string | null;
    worked_hours_cap_weekly?: number;
  };
  Update: {
    allow_negative?: boolean;
    created_at?: string;
    max_balance?: number;
    org_id?: string;
    updated_at?: string;
    updated_by?: string | null;
    worked_hours_cap_weekly?: number;
  };
  Relationships: [
    {
      foreignKeyName: 'org_pto_policy_org_id_fkey';
      columns: ['org_id'];
      isOneToOne: true;
      referencedRelation: 'orgs';
      referencedColumns: ['id'];
    },
  ];
};

// Browser writes to this ledger are RPC-only; direct Insert/Update is never.
type FtsTable<T> = { Row: { [K in keyof T]: T[K] }; Insert: never; Update: never; Relationships: [] };
type FtsScoped<T> = FtsTable<T & { org_id: string; campaign_id: string }>;
export type FillScheduleTables = {
  fts_campaigns: FtsTable<Campaign>;
  fts_participants: FtsScoped<Participant>;
  fts_activities: FtsScoped<Activity>;
  fts_weekly_calls: FtsScoped<Calls>;
  fts_huddle_attendance: FtsScoped<Huddle>;
  fts_week_metrics: FtsScoped<Metric>;
  fts_prize_picks: FtsScoped<PrizePick>;
  fts_audit: FtsScoped<Audit>;
  fts_sheets: FtsScoped<ScheduleSheet>;
  fts_sheet_rows: FtsScoped<ScheduleSheetRow>;
  fts_weekly_checks: FtsScoped<WeeklyCheck>;
};
/** 20261006093000_pto_usage.sql — browser writes go through record_pto_usage / void_pto_usage. */
export type PtoUsageRow = {
  id: string;
  org_id: string;
  employee_id: string;
  user_id: string | null;
  usage_date: string;
  hours: number;
  note: string;
  source: 'employee' | 'manager' | 'day_off';
  day_off_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
};
export type PtoUsageTable = { Row: PtoUsageRow; Insert: never; Update: never; Relationships: [] };

type PendingTables = FillScheduleTables & {
  manager_followups: ManagerFollowupsTable;
  org_pto_policy: OrgPtoPolicyTable;
  pto_usage: PtoUsageTable;
};

/** Columns added to tables the generated file already has. */
type PendingColumns = {
  /** 20260922120000_manager_followups.sql */
  payroll_settings: {
    Row: { payroll_due_days_after_period: number | null; pay_period_anchor: string | null };
    Insert: { payroll_due_days_after_period?: number | null; pay_period_anchor?: string | null };
    Update: { payroll_due_days_after_period?: number | null; pay_period_anchor?: string | null };
  };
  /** 20260922160000_office_pto_policy.sql */
  pto_settings: {
    Row: { policy_override: boolean };
    Insert: { policy_override?: boolean };
    Update: { policy_override?: boolean };
  };
  /** 20261006090000_late_rule_counts_from.sql */
  escalation_policies: {
    Row: { counts_from: string | null };
    Insert: { counts_from?: string | null };
    Update: { counts_from?: string | null };
  };
  /** 20261006120000_doctor_titles.sql */
  employees: {
    Row: { title: string | null };
    Insert: { title?: string | null };
    Update: { title?: string | null };
  };
};

/**
 * Functions the generated file already has, but whose signature a migration
 * changed. Unlike PendingFunctions these win over the generated definition
 * until types.ts is regenerated; delete an entry once it is.
 */
type PendingFunctionChanges = {
  /** 20261006120000_doctor_titles.sql — p_title builds a "Dr. First" display name. */
  save_team_member_contact: {
    Args: {
      p_org_id: string;
      p_employee_id: string | null;
      p_first_name: string;
      p_middle_initial: string | null;
      p_last_name: string;
      p_email: string | null;
      p_contact?: Json;
      p_title?: string | null;
    };
    Returns: string;
  };
};

/** 20260922150000_manager_audited_paths.sql and 20260922160000_office_pto_policy.sql */
type FtsActionArgs = { p_campaign_id: string; p_type: string; p_occurred_at: string; p_quantity: number; p_request_key: string; p_booked_by?: string | null };
type FtsWeekArgs = { p_campaign_id: string; p_employee_id: string; p_week_key: string; p_count: number };
export type FillScheduleFunctions = {
  fts_roster_names: { Args: { p_campaign_id: string }; Returns: RosterName[] };
  fts_print_sheet: { Args: { p_campaign_id: string; p_week_key: string; p_request_key: string }; Returns: ScheduleSheet };
  fts_void_sheet: { Args: { p_sheet_id: string }; Returns: ScheduleSheet };
  fts_apply_sheet_scan: { Args: { p_campaign_id: string; p_sheet_code: string; p_reader: string; p_rows: import('@/lib/fill-the-schedule').SheetReading[]; p_released_at: string; p_request_key: string }; Returns: Record<string, unknown> };
  fts_resolve_sheet_row: { Args: { p_row_id: string; p_action: string; p_employee_id?: string | null; p_link_activity_id?: string | null; p_occurred_at?: string | null; p_prepay_at?: string | null; p_reason?: string; p_verify_handoff?: boolean; p_verify_prepay?: boolean }; Returns: ScheduleSheetRow };
  fts_set_weekly_check: { Args: { p_campaign_id: string; p_week_key: string; p_key: string; p_checked: boolean }; Returns: WeeklyCheck };
  fts_set_auto_import: { Args: { p_campaign_id: string; p_enabled: boolean }; Returns: Campaign };
  fts_validate_reader: { Args: { p_campaign_id: string; p_rows: number; p_staff: number; p_accuracy: number; p_wrong_person: number; p_false_verified: number }; Returns: Campaign };
  fts_record_own: { Args: FtsActionArgs; Returns: Activity };
  fts_record_for: { Args: FtsActionArgs & { p_employee_id: string }; Returns: Activity };
  fts_withdraw_own: { Args: { p_activity_id: string; p_reason: string }; Returns: Activity };
  fts_verify: { Args: { p_activity_id: string; p_approve: boolean; p_reason?: string }; Returns: Activity };
  fts_reverse: { Args: { p_activity_id: string; p_reason: string }; Returns: Activity };
  fts_award_review: { Args: { p_campaign_id: string; p_employee_id: string; p_occurred_at: string; p_request_key: string }; Returns: Activity };
  fts_award_bonus: { Args: { p_parent_id: string; p_type: string; p_occurred_at: string; p_request_key: string }; Returns: Activity };
  fts_set_weekly_calls: { Args: FtsWeekArgs; Returns: Calls };
  fts_save_huddle: { Args: { p_campaign_id: string; p_date: string; p_on_time: string[] }; Returns: number };
  fts_set_open_hours: { Args: { p_campaign_id: string; p_week_key: string; p_hours: number | null }; Returns: Metric };
  fts_set_picks_received: { Args: FtsWeekArgs; Returns: PrizePick };
  fts_set_scoring_role: { Args: { p_campaign_id: string; p_employee_id: string; p_role: string | null; p_active: boolean }; Returns: Participant };
  fts_set_rate: { Args: { p_campaign_id: string; p_key: string; p_value: number | null }; Returns: Campaign };
};
type PendingFunctions = FillScheduleFunctions & {
  seal_close_day: {
    Args: { p_closeout_id: string; p_seal: boolean; p_reason?: string };
    Returns: GeneratedRow<'deposit_logs'>;
  };
  reverse_pto_approval: {
    Args: { p_request_id: string; p_reason: string };
    Returns: GeneratedRow<'pto_requests'>;
  };
  withdraw_knowledge_approval: {
    Args: { p_version_id: string; p_note?: string };
    Returns: GeneratedRow<'knowledge_versions'>;
  };
  set_org_pto_policy: {
    Args: { p_org_id: string; p_cap: number; p_max: number; p_allow_negative: boolean };
    Returns: OrgPtoPolicyTable['Row'];
  };
  /** 20260929120000_pto_balance_guard.sql */
  pto_available_hours: {
    Args: { p_employee_id: string };
    Returns: number | null;
  };
  pto_allows_negative: {
    Args: { p_employee_id: string };
    Returns: boolean;
  };
  /** 20261006093000_pto_usage.sql */
  record_pto_usage: {
    Args: { p_employee_id: string; p_usage_date: string; p_hours: number; p_note?: string };
    Returns: PtoUsageRow;
  };
  void_pto_usage: {
    Args: { p_id: string; p_reason?: string };
    Returns: PtoUsageRow;
  };
};

/** A generated table with the pending columns merged into its shapes; the generated relationships stay. */
type WithColumns<G, P> = G extends { Row: infer R; Insert: infer I; Update: infer U; Relationships: infer Rel }
  ? P extends { Row: infer PR; Insert: infer PI; Update: infer PU }
    ? { Row: Simplify<R & PR>; Insert: Simplify<I & PI>; Update: Simplify<U & PU>; Relationships: Rel }
    : G
  : G;

type MergedTables = Simplify<
  {
    [K in keyof GeneratedTables]: K extends keyof PendingColumns
      ? WithColumns<GeneratedTables[K], PendingColumns[K]>
      : GeneratedTables[K];
  } & {
    [K in Exclude<keyof PendingTables, keyof GeneratedTables>]: PendingTables[K];
  }
>;

type MergedFunctions = Simplify<
  Omit<GeneratedFunctions, keyof PendingFunctionChanges> & PendingFunctionChanges & {
    [K in Exclude<keyof PendingFunctions, keyof GeneratedFunctions | keyof PendingFunctionChanges>]: PendingFunctions[K];
  }
>;

/** The generated Database with the pending schema merged in. */
export type Database = Simplify<
  Omit<Generated, 'public'> & {
    public: Simplify<Omit<GeneratedSchema, 'Tables' | 'Functions'> & { Tables: MergedTables; Functions: MergedFunctions }>;
  }
>;

/** Row shape of a table in the merged schema, like `Tables<>` from ./types. */
export type PendingTablesRow<T extends keyof MergedTables> = MergedTables[T]['Row'];

/** The one Supabase client, typed with the merged schema. */
export const supabase = generatedClient as unknown as SupabaseClient<Database>;
