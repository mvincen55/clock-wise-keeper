import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as generatedClient } from './client';
import type { Database as Generated } from './types';

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

type PendingTables = {
  manager_followups: ManagerFollowupsTable;
  org_pto_policy: OrgPtoPolicyTable;
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
};

/** 20260922150000_manager_audited_paths.sql and 20260922160000_office_pto_policy.sql */
type PendingFunctions = {
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
  GeneratedFunctions & {
    [K in Exclude<keyof PendingFunctions, keyof GeneratedFunctions>]: PendingFunctions[K];
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
