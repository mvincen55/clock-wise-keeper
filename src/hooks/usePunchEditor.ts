import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { calculatePunchMinutes } from '@/lib/time-utils';

export type EditablePunch = {
  id: string | null;
  punch_type: 'in' | 'out';
  punch_time: string;
  original_punch_time: string | null;
  is_deleted: boolean;
  is_new: boolean;
  is_edited: boolean;
  source: string;
  location_lat: number | null;
  location_lng: number | null;
};

export function useSavePunchEdits() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      entryId,
      entryDate,
      original: originalPunches,
      edited: editedPunches,
      reason,
    }: {
      entryId: string;
      entryDate: string;
      original: EditablePunch[];
      edited: EditablePunch[];
      reason: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      // 1. Delete removed punches
      const deletedIds = originalPunches
        .filter(op => op.id && !editedPunches.some(ep => ep.id === op.id && !ep.is_deleted))
        .map(op => op.id!)
        .filter(Boolean);

      for (const id of deletedIds) {
        const orig = originalPunches.find(p => p.id === id);
        await supabase.from('audit_events').insert({
          user_id: user.id,
          event_type: 'punch_deleted',
          event_details: {
            entity_type: 'punch',
            entity_id: id,
            field_changed: 'punch',
            old_value: orig?.punch_time || '',
            new_value: '(deleted)',
            reason_comment: reason,
          } as any,
          related_entry_id: entryId,
          related_date: entryDate,
        });
        await supabase.from('punches').delete().eq('id', id);
      }

      // 2. Update edited punches
      const updatedPunches = editedPunches.filter(
        ep => ep.id && !ep.is_new && !ep.is_deleted && ep.is_edited
      );
      for (const ep of updatedPunches) {
        const orig = originalPunches.find(p => p.id === ep.id);

        // Log time change
        if (orig && orig.punch_time !== ep.punch_time) {
          await supabase.from('audit_events').insert({
            user_id: user.id,
            event_type: 'punch_edited',
            event_details: {
              entity_type: 'punch',
              entity_id: ep.id,
              field_changed: 'punch_time',
              old_value: orig.punch_time,
              new_value: ep.punch_time,
              reason_comment: reason,
            } as any,
            related_entry_id: entryId,
            related_date: entryDate,
          });
        }

        // Log type change
        if (orig && orig.punch_type !== ep.punch_type) {
          await supabase.from('audit_events').insert({
            user_id: user.id,
            event_type: 'punch_edited',
            event_details: {
              entity_type: 'punch',
              entity_id: ep.id,
              field_changed: 'punch_type',
              old_value: orig.punch_type,
              new_value: ep.punch_type,
              reason_comment: reason,
            } as any,
            related_entry_id: entryId,
            related_date: entryDate,
          });
        }

        // Log GPS changes
        if (orig) {
          if (orig.location_lat !== ep.location_lat) {
            await supabase.from('audit_events').insert({
              user_id: user.id,
              event_type: 'punch_edited',
              event_details: {
                entity_type: 'punch',
                entity_id: ep.id,
                field_changed: 'latitude',
                old_value: String(orig.location_lat ?? ''),
                new_value: String(ep.location_lat ?? ''),
                reason_comment: reason,
              } as any,
              related_entry_id: entryId,
              related_date: entryDate,
            });
          }
          if (orig.location_lng !== ep.location_lng) {
            await supabase.from('audit_events').insert({
              user_id: user.id,
              event_type: 'punch_edited',
              event_details: {
                entity_type: 'punch',
                entity_id: ep.id,
                field_changed: 'longitude',
                old_value: String(orig.location_lng ?? ''),
                new_value: String(ep.location_lng ?? ''),
                reason_comment: reason,
              } as any,
              related_entry_id: entryId,
              related_date: entryDate,
            });
          }
        }

        await supabase
          .from('punches')
          .update({
            punch_time: ep.punch_time,
            punch_type: ep.punch_type,
            is_edited: true,
            original_punch_time: orig?.punch_time || ep.punch_time,
            edited_at: new Date().toISOString(),
            edited_by: user.id,
            location_lat: ep.location_lat,
            location_lng: ep.location_lng,
          })
          .eq('id', ep.id!);
      }

      // Also update GPS-only changes (punches where only lat/lng changed but not time/type)
      const gpsOnlyUpdates = editedPunches.filter(ep => {
        if (!ep.id || ep.is_new || ep.is_deleted || ep.is_edited) return false;
        const orig = originalPunches.find(o => o.id === ep.id);
        if (!orig) return false;
        return orig.location_lat !== ep.location_lat || orig.location_lng !== ep.location_lng;
      });
      for (const ep of gpsOnlyUpdates) {
        const orig = originalPunches.find(p => p.id === ep.id)!;
        if (orig.location_lat !== ep.location_lat) {
          await supabase.from('audit_events').insert({
            user_id: user.id,
            event_type: 'punch_edited',
            event_details: {
              entity_type: 'punch',
              entity_id: ep.id,
              field_changed: 'latitude',
              old_value: String(orig.location_lat ?? ''),
              new_value: String(ep.location_lat ?? ''),
              reason_comment: reason,
            } as any,
            related_entry_id: entryId,
            related_date: entryDate,
          });
        }
        if (orig.location_lng !== ep.location_lng) {
          await supabase.from('audit_events').insert({
            user_id: user.id,
            event_type: 'punch_edited',
            event_details: {
              entity_type: 'punch',
              entity_id: ep.id,
              field_changed: 'longitude',
              old_value: String(orig.location_lng ?? ''),
              new_value: String(ep.location_lng ?? ''),
              reason_comment: reason,
            } as any,
            related_entry_id: entryId,
            related_date: entryDate,
          });
        }
        await supabase
          .from('punches')
          .update({
            is_edited: true,
            original_punch_time: orig.punch_time,
            edited_at: new Date().toISOString(),
            edited_by: user.id,
            location_lat: ep.location_lat,
            location_lng: ep.location_lng,
          })
          .eq('id', ep.id!);
      }

      // 3. Insert new punches
      const newPunches = editedPunches.filter(ep => ep.is_new && !ep.is_deleted);
      if (newPunches.length > 0) {
        const { data: maxP } = await supabase
          .from('punches')
          .select('seq')
          .eq('time_entry_id', entryId)
          .order('seq', { ascending: false })
          .limit(1)
          .maybeSingle();
        let nextSeq = (maxP?.seq ?? -1) + 1;

        for (const np of newPunches) {
          await supabase.from('audit_events').insert({
            user_id: user.id,
            event_type: 'punch_added_manually',
            event_details: {
              entity_type: 'punch',
              field_changed: 'punch',
              old_value: '(none)',
              new_value: `${np.punch_type} @ ${np.punch_time}`,
              reason_comment: reason,
            } as any,
            related_entry_id: entryId,
            related_date: entryDate,
          });

          await supabase.from('punches').insert({
            time_entry_id: entryId,
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
        }
      }

      // 4. Recompute total_minutes
      const { data: allPunches } = await supabase
        .from('punches')
        .select('punch_type, punch_time')
        .eq('time_entry_id', entryId)
        .order('seq');

      if (allPunches) {
        const totalMin = calculatePunchMinutes(allPunches);
        await supabase
          .from('time_entries')
          .update({ total_minutes: totalMin })
          .eq('id', entryId);
      }

      // 5. Re-sort seq numbers by time
      const { data: sortedPunches } = await supabase
        .from('punches')
        .select('id, punch_time')
        .eq('time_entry_id', entryId)
        .order('punch_time', { ascending: true });

      if (sortedPunches) {
        for (let i = 0; i < sortedPunches.length; i++) {
          await supabase
            .from('punches')
            .update({ seq: i })
            .eq('id', sortedPunches[i].id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-entries'] });
      qc.invalidateQueries({ queryKey: ['time-entry'] });
      qc.invalidateQueries({ queryKey: ['tardies'] });
    },
  });
}
