import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { AttestActionType, AttestFailure, AttestSuccess } from '@/lib/attestation';

/**
 * Per-employee sign-off PINs (the attestation primitive's identity factor).
 *
 * Reads return STATUS only — set / locked / when — never the hash: the
 * database grants no client access to employee_pins.pin_hash, so every
 * select here names its columns. Writes go exclusively through the
 * set_employee_pin / clear_employee_pin RPCs (admin for anyone in the org,
 * a member for their own record), and verification only ever happens
 * server-side in the `attest` edge function.
 */

export type PinStatus = {
  employeeId: string;
  hasPin: boolean;
  lockedUntil: string | null;
  updatedAt: string | null;
};

const PIN_COLUMNS = 'employee_id, org_id, failed_attempts, locked_until, set_by, created_at, updated_at';

/** PIN status for every employee in the org the caller may see (admins: all; members: their own). */
export function usePinStatuses() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['employee-pins', ctx?.org_id],
    enabled: !!ctx,
    queryFn: async (): Promise<Map<string, PinStatus>> => {
      const { data, error } = await supabase
        .from('employee_pins')
        .select(PIN_COLUMNS)
        .eq('org_id', ctx!.org_id);
      if (error) throw error;
      const map = new Map<string, PinStatus>();
      for (const row of data ?? []) {
        map.set(row.employee_id, {
          employeeId: row.employee_id,
          hasPin: true,
          lockedUntil: row.locked_until,
          updatedAt: row.updated_at,
        });
      }
      return map;
    },
  });
}

/** One employee's PIN status; absent row = no PIN set. */
export function usePinStatus(employeeId: string | undefined) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['employee-pin', employeeId],
    enabled: !!ctx && !!employeeId,
    queryFn: async (): Promise<PinStatus> => {
      const { data, error } = await supabase
        .from('employee_pins')
        .select(PIN_COLUMNS)
        .eq('employee_id', employeeId!)
        .maybeSingle();
      if (error) throw error;
      return {
        employeeId: employeeId!,
        hasPin: !!data,
        lockedUntil: data?.locked_until ?? null,
        updatedAt: data?.updated_at ?? null,
      };
    },
  });
}

/** The signed-in member's own PIN status. */
export function useMyPinStatus() {
  const { data: ctx } = useOrgContext();
  return usePinStatus(ctx?.employee_id);
}

export function useSetEmployeePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, pin }: { employeeId: string; pin: string }) => {
      const { error } = await supabase.rpc('set_employee_pin', {
        _employee_id: employeeId,
        _pin: pin,
      });
      if (error) throw error;
    },
    onSuccess: (_d, { employeeId }) => {
      qc.invalidateQueries({ queryKey: ['employee-pins'] });
      qc.invalidateQueries({ queryKey: ['employee-pin', employeeId] });
    },
  });
}

export function useClearEmployeePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId }: { employeeId: string }) => {
      const { error } = await supabase.rpc('clear_employee_pin', { _employee_id: employeeId });
      if (error) throw error;
    },
    onSuccess: (_d, { employeeId }) => {
      qc.invalidateQueries({ queryKey: ['employee-pins'] });
      qc.invalidateQueries({ queryKey: ['employee-pin', employeeId] });
    },
  });
}

export interface AttestInput {
  employeeId: string;
  pin: string;
  actionType: AttestActionType;
  relatedTable: string;
  relatedId: string;
  payload?: Record<string, unknown>;
}

export interface AttestOutcome {
  ok: boolean;
  result?: AttestSuccess;
  failure?: AttestFailure;
}

/**
 * Calls the `attest` edge function. Resolves with the server's verdict;
 * refusals (wrong PIN, lockout, no PIN) resolve as `{ ok: false, failure }`
 * rather than throwing, so dialogs can render the exact reason.
 */
export function useAttest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AttestInput): Promise<AttestOutcome> => {
      const { data, error } = await supabase.functions.invoke('attest', {
        body: {
          employee_id: input.employeeId,
          pin: input.pin,
          action_type: input.actionType,
          related_table: input.relatedTable,
          related_id: input.relatedId,
          payload: input.payload ?? {},
        },
      });
      if (error) {
        // FunctionsHttpError carries the JSON refusal body; read it so the
        // caller can tell "wrong PIN" from a transport failure.
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            return { ok: false, failure: (await ctx.json()) as AttestFailure };
          } catch {
            /* fall through to the generic failure below */
          }
        }
        return { ok: false, failure: { error: 'The sign-off service is unreachable. Try again.' } };
      }
      if (data?.verified) return { ok: true, result: data as AttestSuccess };
      return { ok: false, failure: (data ?? {}) as AttestFailure };
    },
    onSuccess: res => {
      if (res.ok) qc.invalidateQueries({ queryKey: ['employee-pin'] });
    },
  });
}
