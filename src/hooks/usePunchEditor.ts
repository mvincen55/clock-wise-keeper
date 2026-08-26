import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

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

export function useSavePunchEdits() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  const insertAudit = async (event_type: string, event_details: any, related_entry_id: string, related_date: string) => {
    if (!user || !ctx) return;
    await supabase.from('audit_events').insert({
      user_id: user.id,
      org_id: ctx.org_id,
      employee_id: ctx.employee_id,
      actor_id: user.id,
      event_type,
      // target_employee_id is the editor's own record here because every
      // working call site is self-scoped; the transactional-editing phase
      // replaces this whole path with a server RPC that resolves the
      // target from the entry row instead.
      event_details: { ...event_details, target_employee_id: ctx.employee_id } as any,
      related_entry_id,
      related_date,
    });
  };

  return useMutation({
    mutationFn: async ({
      entryId, entryDate, original: originalPunches, edited: editedPunches, reason,
    }: {
      entryId: string; entryDate: string;
      original: EditablePunch[]; edited: EditablePunch[]; reason: string;
    }) => {
      if (!user || !ctx) throw new Error('Not authenticated');

      // Already-voided punches are immutable history: no op may touch them.
      const isVoided = (id: string | null) =>
        !!originalPunches.find(p => p.id === id)?.voided_at;

      // 1. Void removed punches. Rows are never deleted (FLSA retention;
      //    the DB raises on DELETE anyway) — they keep their seq and stop
      //    counting. Every write below is checked: a blocked write throws
      //    instead of leaving a phantom audit trail.
      const voidedIds = originalPunches
        .filter(op => op.id && !op.voided_at && !editedPunches.some(ep => ep.id === op.id && !ep.is_deleted))
        .map(op => op.id!).filter(Boolean);

      for (const id of voidedIds) {
        const orig = originalPunches.find(p => p.id === id);
        const { data: voidedRows, error: voidError } = await supabase
          .from('punches')
          .update({
            voided_at: new Date().toISOString(),
            voided_by: user.id,
            void_reason: reason,
          })
          .eq('id', id)
          .is('voided_at', null)
          .select('id');
        if (voidError) throw voidError;
        if (!voidedRows?.length) throw new Error('Void was blocked — no punch was changed.');
        await insertAudit('punch_voided', {
          entity_type: 'punch', entity_id: id, field_changed: 'punch',
          old_value: orig?.punch_time || '', new_value: '(voided)', reason_comment: reason,
        }, entryId, entryDate);
      }

      // 2. Update edited punches (never voided ones)
      const updatedPunches = editedPunches.filter(ep => ep.id && !ep.is_new && !ep.is_deleted && ep.is_edited && !isVoided(ep.id));
      const sourceOnlyChanges = editedPunches.filter(ep => {
        if (!ep.id || ep.is_new || ep.is_deleted || ep.is_edited || isVoided(ep.id)) return false;
        const orig = originalPunches.find(o => o.id === ep.id);
        return orig && orig.source !== ep.source;
      });
      const allUpdates = [...updatedPunches, ...sourceOnlyChanges];

      for (const ep of allUpdates) {
        const orig = originalPunches.find(p => p.id === ep.id);
        const { data: updatedRows, error: updateError } = await supabase.from('punches').update({
          punch_time: ep.punch_time, punch_type: ep.punch_type, source: ep.source as any,
          is_edited: true, original_punch_time: orig?.punch_time || ep.punch_time,
          edited_at: new Date().toISOString(), edited_by: user.id,
        }).eq('id', ep.id!).select('id');
        if (updateError) throw updateError;
        if (!updatedRows?.length) throw new Error('Edit was blocked — no punch was changed.');

        if (orig && orig.punch_time !== ep.punch_time) {
          await insertAudit('punch_edited', {
            entity_type: 'punch', entity_id: ep.id, field_changed: 'punch_time',
            old_value: orig.punch_time, new_value: ep.punch_time, reason_comment: reason,
          }, entryId, entryDate);
        }
        if (orig && orig.punch_type !== ep.punch_type) {
          await insertAudit('punch_edited', {
            entity_type: 'punch', entity_id: ep.id, field_changed: 'punch_type',
            old_value: orig.punch_type, new_value: ep.punch_type, reason_comment: reason,
          }, entryId, entryDate);
        }
        if (orig && orig.source !== ep.source) {
          await insertAudit('punch_edited', {
            entity_type: 'punch', entity_id: ep.id, field_changed: 'source',
            old_value: orig.source, new_value: ep.source, reason_comment: reason,
          }, entryId, entryDate);
        }
      }

      // 3. Insert new punches. Seq continues past MAX over ALL punches
      //    (voided included — their seq is kept forever, so new punches
      //    must never collide with it).
      const newPunches = editedPunches.filter(ep => ep.is_new && !ep.is_deleted);
      if (newPunches.length > 0) {
        const { data: maxP } = await supabase.from('punches').select('seq')
          .eq('time_entry_id', entryId).order('seq', { ascending: false }).limit(1).maybeSingle();
        let nextSeq = (maxP?.seq ?? -1) + 1;

        for (const np of newPunches) {
          const { error: insertError } = await supabase.from('punches').insert({
            time_entry_id: entryId,
            org_id: ctx.org_id,
            employee_id: ctx.employee_id,
            seq: nextSeq++,
            punch_type: np.punch_type,
            punch_time: np.punch_time,
            source: 'manual' as const,
            is_edited: true,
            original_punch_time: np.punch_time,
            edited_at: new Date().toISOString(),
            edited_by: user.id,
            location_lat: np.location_lat,
            location_lng: np.location_lng,
          });
          if (insertError) throw insertError;

          await insertAudit('punch_added_manually', {
            entity_type: 'punch', field_changed: 'punch',
            old_value: '(none)', new_value: `${np.punch_type} @ ${np.punch_time}`, reason_comment: reason,
          }, entryId, entryDate);
        }
      }

      // 4. total_minutes is recomputed by trg_recompute_punch on every
      // punch INSERT/UPDATE above — no client-side write, so the trigger
      // stays the single owner of that value.

      // 5. Seq is NEVER renumbered here: voided punches keep their seq,
      // and a dense re-sort would collide with them. The transactional
      // editing RPC (next phase) normalizes ordering server-side,
      // assigning fresh seqs past MAX(seq) in punch_time order.
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-entries'] });
      qc.invalidateQueries({ queryKey: ['time-entry'] });
      qc.invalidateQueries({ queryKey: ['tardies'] });
      qc.invalidateQueries({ queryKey: ['attendance-day-status'] });
    },
  });
}
