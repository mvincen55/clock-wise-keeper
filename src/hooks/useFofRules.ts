import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  DEFAULT_DISCOUNT_RULES,
  type FofDiscountRules,
} from '@/lib/fof/discounts';
import {
  SHIPPED_MEMBERSHIP_INCLUDED_CODES,
  SHIPPED_NEVER_COVERED_CODES,
  SHIPPED_NO_PREPAY_CODES,
} from '@/lib/fof/cdt';

/**
 * Org-scoped discount rules and code lists (Phase 2b). De-identified
 * configuration only. Rules and codes fall back to the shipped defaults
 * until the org's rows exist (the migration seeds every existing org, so
 * the fallback covers only a brand-new org before its seed).
 */

export type FofCodeRuleKind = 'never_covered' | 'no_prepay' | 'membership_included';

export interface FofCodeRules {
  neverCovered: ReadonlySet<string>;
  noPrepay: ReadonlySet<string>;
  membershipIncluded: ReadonlySet<string>;
}

export const DEFAULT_CODE_RULES: FofCodeRules = {
  neverCovered: SHIPPED_NEVER_COVERED_CODES,
  noPrepay: SHIPPED_NO_PREPAY_CODES,
  membershipIncluded: SHIPPED_MEMBERSHIP_INCLUDED_CODES,
};

/** Server-enforced bounds (mirrored client-side for friendly errors). */
export const DISCOUNT_RULE_BOUNDS = {
  percent: { min: 0, max: 100 },
  thresholdCents: { min: 0, max: 500_000 },
} as const;

export function useFofDiscountRules() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['fof-discount-rules', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<FofDiscountRules> => {
      if (!ctx) return DEFAULT_DISCOUNT_RULES;
      const { data, error } = await supabase
        .from('fof_discount_rules')
        .select('rule_key, enabled, percent, extra_percent, threshold_cents')
        .eq('org_id', ctx.org_id);
      if (error) throw error;
      const byKey = new Map((data ?? []).map(r => [r.rule_key, r]));
      const senior = byKey.get('senior');
      const courtesy = byKey.get('courtesy');
      const membership = byKey.get('membership');
      return {
        senior: senior
          ? {
              enabled: senior.enabled,
              percent: Number(senior.percent),
              thresholdCents: senior.threshold_cents,
            }
          : DEFAULT_DISCOUNT_RULES.senior,
        courtesy: courtesy
          ? { enabled: courtesy.enabled, percent: Number(courtesy.percent) }
          : DEFAULT_DISCOUNT_RULES.courtesy,
        membership: membership
          ? {
              enabled: membership.enabled,
              percent: Number(membership.percent),
              extraPercent: Number(membership.extra_percent),
            }
          : DEFAULT_DISCOUNT_RULES.membership,
      };
    },
  });
}

export interface DiscountRuleUpdate {
  ruleKey: 'senior' | 'courtesy' | 'membership';
  enabled: boolean;
  percent: number;
  extraPercent?: number;
  thresholdCents?: number;
}

export function useUpsertFofDiscountRule() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (update: DiscountRuleUpdate) => {
      if (!ctx) throw new Error('Not authenticated');
      const pctOk = (v: number) =>
        Number.isFinite(v) && v >= DISCOUNT_RULE_BOUNDS.percent.min && v <= DISCOUNT_RULE_BOUNDS.percent.max;
      if (!pctOk(update.percent) || (update.extraPercent !== undefined && !pctOk(update.extraPercent))) {
        throw new Error('Percent must be between 0 and 100');
      }
      if (
        update.thresholdCents !== undefined &&
        (!Number.isInteger(update.thresholdCents) ||
          update.thresholdCents < DISCOUNT_RULE_BOUNDS.thresholdCents.min ||
          update.thresholdCents > DISCOUNT_RULE_BOUNDS.thresholdCents.max)
      ) {
        throw new Error('Threshold must be between $0 and $5,000');
      }
      const { error } = await supabase.from('fof_discount_rules').upsert(
        {
          org_id: ctx.org_id,
          rule_key: update.ruleKey,
          enabled: update.enabled,
          percent: update.percent,
          ...(update.extraPercent !== undefined && { extra_percent: update.extraPercent }),
          ...(update.thresholdCents !== undefined && { threshold_cents: update.thresholdCents }),
        },
        { onConflict: 'org_id,rule_key' }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fof-discount-rules'] }),
  });
}

export function useFofCodeRules() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['fof-code-rules', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<FofCodeRules> => {
      if (!ctx) return DEFAULT_CODE_RULES;
      const { data, error } = await supabase
        .from('fof_code_rules')
        .select('kind, code')
        .eq('org_id', ctx.org_id);
      if (error) throw error;
      // No rows at all = never configured: shipped defaults. Any rows =
      // the org's lists are authoritative (an emptied list stays empty).
      if (!data || data.length === 0) return DEFAULT_CODE_RULES;
      const pick = (kind: FofCodeRuleKind) =>
        new Set(data.filter(r => r.kind === kind).map(r => r.code.toUpperCase()));
      return {
        neverCovered: pick('never_covered'),
        noPrepay: pick('no_prepay'),
        membershipIncluded: pick('membership_included'),
      };
    },
  });
}

export function useAddFofCodeRule() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ kind, code }: { kind: FofCodeRuleKind; code: string }) => {
      if (!ctx) throw new Error('Not authenticated');
      const normalized = code.trim().toUpperCase();
      if (!/^D\d{4}$/.test(normalized)) {
        throw new Error('Enter a CDT code like D4265');
      }
      const { error } = await supabase
        .from('fof_code_rules')
        .insert({ org_id: ctx.org_id, kind, code: normalized });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fof-code-rules'] }),
  });
}

export function useRemoveFofCodeRule() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ kind, code }: { kind: FofCodeRuleKind; code: string }) => {
      if (!ctx) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('fof_code_rules')
        .delete()
        .eq('org_id', ctx.org_id)
        .eq('kind', kind)
        .eq('code', code.trim().toUpperCase());
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fof-code-rules'] }),
  });
}
