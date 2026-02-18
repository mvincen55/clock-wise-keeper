import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

export type OfficeClosureRow = {
  id: string;
  user_id: string;
  closure_date: string;
  name: string;
  is_full_day: boolean;
  hours: number;
  created_at: string;
};

// Standard holidays with computed dates
const HOLIDAY_TEMPLATES = [
  { name: 'New Years Day', getDate: (y: number) => `${y}-01-01` },
  { name: "President's Day", getDate: (y: number) => nthWeekday(y, 2, 1, 3) }, // 3rd Monday Feb
  { name: 'MA Patriot\'s Day', getDate: (y: number) => nthWeekday(y, 4, 1, 3) }, // 3rd Monday Apr
  { name: 'Memorial Day', getDate: (y: number) => lastWeekday(y, 5, 1) }, // Last Monday May
  { name: 'Independence Day', getDate: (y: number) => `${y}-07-04` },
  { name: 'Labor Day', getDate: (y: number) => nthWeekday(y, 9, 1, 1) }, // 1st Monday Sep
  { name: "Indigenous People's Day", getDate: (y: number) => nthWeekday(y, 10, 1, 2) }, // 2nd Monday Oct
  { name: 'Thanksgiving Day', getDate: (y: number) => nthWeekday(y, 11, 4, 4) }, // 4th Thursday Nov
  { name: 'Day After Thanksgiving', getDate: (y: number) => {
    const tg = nthWeekday(y, 11, 4, 4);
    const d = new Date(tg + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }},
  { name: 'Christmas Day', getDate: (y: number) => `${y}-12-25` },
];

function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(year, month - 1, 1);
  let dayOfWeek = first.getDay();
  let diff = (weekday - dayOfWeek + 7) % 7;
  let day = 1 + diff + (n - 1) * 7;
  const d = new Date(year, month - 1, day);
  return d.toISOString().split('T')[0];
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(year, month, 0); // last day of month
  let dayOfWeek = last.getDay();
  let diff = (dayOfWeek - weekday + 7) % 7;
  last.setDate(last.getDate() - diff);
  return last.toISOString().split('T')[0];
}

/** Generate all closure dates for a given year, including the Christmas/NY week rule */
export function generateClosuresForYear(year: number): { name: string; closure_date: string }[] {
  const closures: { name: string; closure_date: string }[] = [];

  for (const tmpl of HOLIDAY_TEMPLATES) {
    closures.push({ name: tmpl.name, closure_date: tmpl.getDate(year) });
  }

  // Christmas week rule
  const christmasDate = new Date(`${year}-12-25T00:00:00`);
  const christmasDow = christmasDate.getDay(); // 0=Sun..6=Sat

  if (christmasDow <= 3) {
    // Sun, Mon, Tue, Wed → office closed for Christmas week (Mon-Fri of that week)
    const monday = new Date(christmasDate);
    monday.setDate(monday.getDate() - ((christmasDow === 0 ? 7 : christmasDow) - 1));
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      if (!closures.find(c => c.closure_date === ds)) {
        closures.push({ name: 'Christmas Week', closure_date: ds });
      }
    }
  } else {
    // Thu, Fri, Sat → office closed for New Years week (Mon-Fri of next week containing Jan 1)
    const nextYear = year + 1;
    const jan1 = new Date(`${nextYear}-01-01T00:00:00`);
    const jan1Dow = jan1.getDay();
    const monday = new Date(jan1);
    if (jan1Dow === 0) monday.setDate(monday.getDate() + 1);
    else if (jan1Dow === 6) monday.setDate(monday.getDate() + 2);
    else monday.setDate(monday.getDate() - (jan1Dow - 1));

    for (let i = 0; i < 5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      closures.push({ name: 'New Years Week', closure_date: ds });
    }
  }

  // Deduplicate by date
  const seen = new Set<string>();
  return closures.filter(c => {
    if (seen.has(c.closure_date)) return false;
    seen.add(c.closure_date);
    return true;
  }).sort((a, b) => a.closure_date.localeCompare(b.closure_date));
}

export function useOfficeClosures(year?: number) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['office-closures', year],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('office_closures').select('*').order('closure_date');
      if (year) {
        q = q.gte('closure_date', `${year}-01-01`).lte('closure_date', `${year}-12-31`);
      }
      const { data } = await q;
      return (data || []) as OfficeClosureRow[];
    },
  });
}

export function useGenerateClosures() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (year: number) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      const closures = generateClosuresForYear(year);
      const rows = closures.map(c => ({
        user_id: user.id,
        org_id: ctx.org_id,
        employee_id: ctx.employee_id,
        created_by: user.id,
        closure_date: c.closure_date,
        name: c.name,
        is_full_day: true,
        hours: 8,
      }));
      // Upsert to avoid duplicates
      const { error } = await supabase.from('office_closures').upsert(rows, {
        onConflict: 'user_id,closure_date',
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office-closures'] }),
  });
}

export function useAddClosure() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { closure_date: string; name: string; is_full_day?: boolean; hours?: number }) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      const { error } = await supabase.from('office_closures').insert({
        user_id: user.id,
        org_id: ctx.org_id,
        employee_id: ctx.employee_id,
        created_by: user.id,
        ...input,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office-closures'] }),
  });
}

export function useDeleteClosure() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('office_closures').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office-closures'] }),
  });
}
