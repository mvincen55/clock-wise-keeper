import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type EditablePunch = {
  id: string | null;
  punch_type: 'in' | 'out';
  punch_time: string;
  original_punch_time: string | null;
  /** Marked for voiding on save (the row itself is never destroyed). */
  is_deleted: boolean;
  is_new: boolean;
  is_edited: boolean;
  source: string;
  location_lat: number | null;
  location_lng: number | null;
  voided_at: string | null;
  void_reason: string | null;
};

export type PunchEditOp =
  | { op: 'update'; id: string; punch_time: string; punch_type: 'in' | 'out'; source?: string }
  | { op: 'void'; id: string }
  | { op: 'insert'; punch_time: string; punch_type: 'in' | 'out' };

export type SavePunchEditsResult = {
  entry_id: string;
  entry_date: string;
  employee_id: string;
  applied_ops: number;
  audit_event_ids: string[];
};

/**
 * Diffs the editor state into the operation list save_punch_edits
 * applies atomically. Voided punches are immutable history and produce
 * no ops; removing a live punch is a void, never a delete.
 */
export function buildPunchEditOps(original: EditablePunch[], edited: EditablePunch[]): PunchEditOp[] {
  const ops: PunchEditOp[] = [];

  for (const orig of original) {
    if (!orig.id || orig.voided_at) continue;
    const survives = edited.some(ep => ep.id === orig.id && !ep.is_deleted);
    if (!survives) ops.push({ op: 'void', id: orig.id });
  }

  for (const ep of edited) {
    if (!ep.id || ep.is_new || ep.is_deleted || ep.voided_at) continue;
    const orig = original.find(o => o.id === ep.id);
    if (!orig || orig.voided_at) continue;
    const changed =
      orig.punch_time !== ep.punch_time ||
      orig.punch_type !== ep.punch_type ||
      orig.source !== ep.source;
    if (changed) {
      ops.push({
        op: 'update',
        id: ep.id,
        punch_time: ep.punch_time,
        punch_type: ep.punch_type,
        ...(orig.source !== ep.source ? { source: ep.source } : {}),
      });
    }
  }

  for (const ep of edited) {
    if (ep.is_new && !ep.is_deleted) {
      ops.push({ op: 'insert', punch_time: ep.punch_time, punch_type: ep.punch_type });
    }
  }

  return ops;
}

/** Person-readable copy for the RPC's structured rejections. */
export function friendlyEditError(message: string): string | null {
  if (message.includes('EDIT_SEQUENCE_INVALID')) return 'Punches must alternate in/out — fix the times or types and save again.';
  if (message.includes('EDIT_PUNCH_VOIDED')) return 'That punch is voided and can no longer be changed.';
  if (message.includes('EDIT_ADMIN_ONLY')) return 'Punch edits are manager-only. Submit a correction request instead.';
  if (message.includes('EDIT_REASON_REQUIRED')) return 'An edit reason is required.';
  if (message.includes('EDIT_ENTRY_NOT_FOUND')) return 'That day could not be found — refresh and try again.';
  return null;
}

/**
 * One transactional RPC replaces the old sequence of client writes:
 * the server resolves the target employee from the ENTRY row, applies
 * every operation or none of them, writes one reasoned audit row per
 * operation, normalizes ordering, and validates the final sequence.
 * Nothing here can half-apply or leave a phantom audit trail.
 */
export function useSavePunchEdits() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      entryId, entryDate, employeeId, original: originalPunches, edited: editedPunches, reason,
    }: {
      /** Null for a fully missed day — the RPC creates the entry (employeeId required). */
      entryId: string | null;
      entryDate: string;
      employeeId?: string | null;
      original: EditablePunch[]; edited: EditablePunch[]; reason: string;
    }): Promise<SavePunchEditsResult | null> => {
      if (!user) throw new Error('Not authenticated');

      const ops = buildPunchEditOps(originalPunches, editedPunches);
      if (ops.length === 0) return null;

      const { data, error } = await supabase.rpc('save_punch_edits', {
        p_entry_id: entryId,
        p_edits: ops as never,
        p_reason: reason,
        p_employee_id: entryId ? null : employeeId ?? null,
        p_entry_date: entryId ? null : entryDate,
      } as never);
      if (error) throw new Error(friendlyEditError(error.message ?? '') ?? error.message);
      return data as unknown as SavePunchEditsResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-entries'] });
      qc.invalidateQueries({ queryKey: ['time-entry'] });
      qc.invalidateQueries({ queryKey: ['tardies'] });
      qc.invalidateQueries({ queryKey: ['attendance-day-status'] });
      qc.invalidateQueries({ queryKey: ['audit-history'] });
    },
  });
}
