import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { createNotification } from '@/hooks/useNotifications';
import type { Tables } from '@/integrations/supabase/types';

/**
 * Incident reports — the office injury / exposure log.
 *
 * Every report files under an employee (the person it happened to) and
 * shows up in that employee's record. RLS decides who sees what: an
 * employee sees their own, owners and managers see the whole org. These
 * hooks never filter for security — they only shape what is asked for.
 *
 * Filing rules (also enforced by RLS): employees file for themselves,
 * owners and managers file for anyone on the team.
 */

export type IncidentReport = Tables<'incident_reports'>;

/** An active owner or manager — the pool a report can be signed off from. */
export type OrgAdmin = { user_id: string; role: 'owner' | 'manager' };

/**
 * The org's owners and managers. Every member may read these rows (RLS
 * allows active admin memberships org-wide) — the sign-off panel needs
 * them to know whether an owner is available to countersign.
 */
export function useOrgAdmins() {
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['org-admins', ctx?.org_id],
    enabled: !!ctx?.org_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OrgAdmin[]> => {
      const { data, error } = await supabase
        .from('org_members')
        .select('user_id, role')
        .eq('org_id', ctx!.org_id)
        .in('role', ['owner', 'manager'])
        .eq('status', 'active');
      if (error) throw error;
      return (data || []) as OrgAdmin[];
    },
  });
}

/** A report with the subject's name resolved for display. */
export type IncidentReportWithEmployee = IncidentReport & {
  employee: { display_name: string } | null;
};

const SELECT_WITH_EMPLOYEE =
  '*, employee:employees!incident_reports_employee_id_fkey(display_name)';

/** Every report the signed-in user is allowed to see, newest first. */
export function useIncidentReports() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['incident-reports', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<IncidentReportWithEmployee[]> => {
      const { data, error } = await supabase
        .from('incident_reports')
        .select(SELECT_WITH_EMPLOYEE)
        .order('incident_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as IncidentReportWithEmployee[];
    },
  });
}

/** One employee's reports — the incident section of their record. */
export function useEmployeeIncidentReports(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['incident-reports', 'employee', employeeId],
    enabled: !!employeeId,
    queryFn: async (): Promise<IncidentReport[]> => {
      const { data, error } = await supabase
        .from('incident_reports')
        .select('*')
        .eq('employee_id', employeeId!)
        .order('incident_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * The sign functions return the row they stamped. PostgREST hands a
 * composite-returning function back as an object; take either shape so a
 * wrapped row cannot quietly cost someone their notification.
 */
function signedRow(data: unknown): IncidentReport {
  return (Array.isArray(data) ? data[0] : data) as IncidentReport;
}

/**
 * Tell whoever can sign off that a report is waiting on them. Mirrors
 * the server's rule in countersign_incident_report(): a report about a
 * manager or an owner goes up to an owner, it never goes to the person
 * it is about, and if the subject was the org's only owner it falls back
 * to whoever is left rather than reaching nobody.
 */
async function notifyCountersigners(params: {
  orgId: string;
  actorUserId: string;
  reportId: string;
  countersignRole: string;
  subjectUserId: string | null;
  /** How the message names the subject: 'Dana Reyes' or 'You'. */
  subjectName: string;
  incidentDate: string;
}) {
  const { data: admins } = await supabase
    .from('org_members')
    .select('user_id, role')
    .eq('org_id', params.orgId)
    .in('role', ['owner', 'manager'])
    .eq('status', 'active');

  const pool = (admins || []).filter(
    a => a.user_id !== params.subjectUserId && a.user_id !== params.actorUserId
  );
  const owners = pool.filter(a => a.role === 'owner');
  const recipients =
    params.countersignRole === 'owner' && owners.length > 0 ? owners : pool;

  for (const admin of recipients) {
    await createNotification({
      org_id: params.orgId,
      recipient_user_id: admin.user_id,
      actor_user_id: params.actorUserId,
      notification_type: 'incident_report_signature_needed',
      title: 'Incident Report Needs Your Signature',
      message: `${params.subjectName} signed the incident report from ${params.incidentDate}. It needs your sign-off.`,
      related_table: 'incident_reports',
      related_id: params.reportId,
    });
  }
}

export interface IncidentReportInput {
  /** Who it happened to. Employees may only pass their own employee id. */
  employeeId: string;
  incidentDate: string;
  /** 'HH:MM' wall clock, or '' when nobody remembers the minute. */
  incidentTime: string;
  category: string;
  severity: string;
  location: string;
  description: string;
  bodyPart: string;
  deviceInvolved: string;
  ppeWorn: string;
  witnesses: string;
  immediateAction: string;
  medicalTreatment: string;
  workRelated: boolean;
  daysAway: number;
  /**
   * Typed full name, when someone files their own report and signs it in
   * the same breath. Only the person a report is about can sign, so the
   * form only offers this when they are the subject.
   */
  signature?: string;
}

/**
 * File a report. The subject is whatever employee the form passes; the
 * reporter is always the signed-in user, so a report always says who
 * wrote it and who it is about even when those differ.
 */
export function useFileIncidentReport() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: IncidentReportInput) => {
      if (!ctx || !user) throw new Error('Not authenticated');

      const { data: reporter } = await supabase
        .from('employees')
        .select('display_name')
        .eq('id', ctx.employee_id)
        .maybeSingle();
      const reporterName = reporter?.display_name || user.email || '';

      const { data: report, error } = await supabase
        .from('incident_reports')
        .insert({
          org_id: ctx.org_id,
          employee_id: input.employeeId,
          reported_by: user.id,
          reported_by_employee_id: ctx.employee_id,
          reported_by_name: reporterName,
          incident_date: input.incidentDate,
          incident_time: input.incidentTime || null,
          category: input.category,
          severity: input.severity,
          location: input.location.trim(),
          description: input.description.trim(),
          body_part: input.bodyPart.trim(),
          device_involved: input.deviceInvolved.trim(),
          ppe_worn: input.ppeWorn,
          witnesses: input.witnesses.trim(),
          immediate_action: input.immediateAction.trim(),
          medical_treatment: input.medicalTreatment,
          work_related: input.workRelated,
          days_away: input.daysAway,
        })
        .select('id, employee_id, countersign_role')
        .single();
      if (error) throw error;

      // Who it is about, for the notification wording.
      const { data: subject } = await supabase
        .from('employees')
        .select('display_name, user_id')
        .eq('id', input.employeeId)
        .maybeSingle();
      const subjectName = subject?.display_name || 'a team member';
      const aboutSelf = input.employeeId === ctx.employee_id;

      // Filing your own report and signing it is one motion. The
      // signature carries its own notification — an actionable one — so
      // it stands in for the generic "new report" note to the admins.
      const signature = aboutSelf ? (input.signature || '').trim() : '';
      if (signature) {
        const { error: signError } = await supabase.rpc('sign_incident_report_employee', {
          _report_id: report.id,
          _typed_name: signature,
        });
        if (signError) throw signError;

        await notifyCountersigners({
          orgId: ctx.org_id,
          actorUserId: user.id,
          reportId: report.id,
          countersignRole: report.countersign_role,
          subjectUserId: subject?.user_id ?? null,
          subjectName: reporterName,
          incidentDate: input.incidentDate,
        });
        return report;
      }

      // Owners and managers hear about every incident.
      const { data: admins } = await supabase
        .from('org_members')
        .select('user_id')
        .eq('org_id', ctx.org_id)
        .in('role', ['owner', 'manager'])
        .eq('status', 'active');

      const notified = new Set<string>([user.id]);
      for (const admin of admins || []) {
        if (notified.has(admin.user_id)) continue;
        notified.add(admin.user_id);
        await createNotification({
          org_id: ctx.org_id,
          recipient_user_id: admin.user_id,
          actor_user_id: user.id,
          notification_type: 'incident_report_new',
          title: 'New Incident Report',
          message: aboutSelf
            ? `${reporterName} filed an incident report: ${input.description.trim().slice(0, 120)}`
            : `${reporterName} filed an incident report for ${subjectName}: ${input.description.trim().slice(0, 120)}`,
          related_table: 'incident_reports',
          related_id: report.id,
        });
      }

      // A report filed about someone else lands in their record — tell them.
      if (!aboutSelf && subject?.user_id && !notified.has(subject.user_id)) {
        await createNotification({
          org_id: ctx.org_id,
          recipient_user_id: subject.user_id,
          actor_user_id: user.id,
          notification_type: 'incident_report_new',
          title: 'Incident Report Filed',
          message: `${reporterName} filed an incident report in your record for ${input.incidentDate}. Open it to read and sign.`,
          related_table: 'incident_reports',
          related_id: report.id,
        });
      }

      return report;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incident-reports'] });
      toast.success('Incident report filed');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not file the report'),
  });
}

/**
 * Edit the account of what happened. Managers may edit any report; the
 * person who filed it may keep correcting their own while it is open
 * (RLS and the guard trigger enforce both).
 */
export function useUpdateIncidentReport() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: IncidentReportInput & { id: string }) => {
      const { error } = await supabase
        .from('incident_reports')
        .update({
          employee_id: input.employeeId,
          incident_date: input.incidentDate,
          incident_time: input.incidentTime || null,
          category: input.category,
          severity: input.severity,
          location: input.location.trim(),
          description: input.description.trim(),
          body_part: input.bodyPart.trim(),
          device_involved: input.deviceInvolved.trim(),
          ppe_worn: input.ppeWorn,
          witnesses: input.witnesses.trim(),
          immediate_action: input.immediateAction.trim(),
          medical_treatment: input.medicalTreatment,
          work_related: input.workRelated,
          days_away: input.daysAway,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incident-reports'] });
      toast.success('Incident report updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not update the report'),
  });
}

/**
 * The employee's signature. Only the person the report is about can give
 * it — the database checks that, not this hook — and giving it puts the
 * report in front of whoever has to sign off on it.
 *
 * Correcting a signed report clears its signatures (the guard trigger
 * does that), so a signature always covers the account as it read when
 * it was signed.
 */
export function useSignIncidentReport() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, typedName }: { id: string; typedName: string }) => {
      if (!ctx || !user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('sign_incident_report_employee', {
        _report_id: id,
        _typed_name: typedName,
      });
      if (error) throw error;
      const signed = signedRow(data);

      await notifyCountersigners({
        orgId: ctx.org_id,
        actorUserId: user.id,
        reportId: signed.id,
        countersignRole: signed.countersign_role,
        subjectUserId: user.id,
        subjectName: signed.employee_signature,
        incidentDate: signed.incident_date,
      });

      return signed;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incident-reports'] });
      toast.success('Signed — your managers have been notified');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not sign the report'),
  });
}

/**
 * The countersignature. An owner or manager, never the person the report
 * is about, and an owner specifically when the report is about a manager
 * or an owner — countersign_incident_report() enforces all of it.
 */
export function useCountersignIncidentReport() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, typedName }: { id: string; typedName: string }) => {
      if (!ctx || !user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('countersign_incident_report', {
        _report_id: id,
        _typed_name: typedName,
      });
      if (error) throw error;
      const signed = signedRow(data);

      // The person it happened to hears that the loop is closed.
      const { data: subject } = await supabase
        .from('employees')
        .select('user_id')
        .eq('id', signed.employee_id)
        .maybeSingle();

      if (subject?.user_id && subject.user_id !== user.id) {
        await createNotification({
          org_id: ctx.org_id,
          recipient_user_id: subject.user_id,
          actor_user_id: user.id,
          notification_type: 'incident_report_signed',
          title: 'Incident Report Signed',
          message: `${signed.manager_signature} signed off on your incident report from ${signed.incident_date}.`,
          related_table: 'incident_reports',
          related_id: signed.id,
        });
      }

      return signed;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incident-reports'] });
      toast.success('Signed off');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not sign the report'),
  });
}

export interface IncidentReviewInput {
  id: string;
  status: string;
  reviewNotes: string;
  followUpRequired: boolean;
  followUpNotes: string;
}

/** Manager follow-up: status, review notes, and the follow-up flag. */
export function useReviewIncidentReport() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: IncidentReviewInput) => {
      if (!ctx || !user) throw new Error('Not authenticated');

      const { data: reviewer } = await supabase
        .from('employees')
        .select('display_name')
        .eq('id', ctx.employee_id)
        .maybeSingle();

      const { data: updated, error } = await supabase
        .from('incident_reports')
        .update({
          status: input.status,
          review_notes: input.reviewNotes.trim(),
          follow_up_required: input.followUpRequired,
          follow_up_notes: input.followUpNotes.trim(),
          reviewed_by: user.id,
          reviewed_by_name: reviewer?.display_name || user.email || '',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', input.id)
        .select('id, employee_id, incident_date')
        .single();
      if (error) throw error;

      // Closing the loop is worth telling the person it happened to.
      if (input.status === 'closed') {
        const { data: subject } = await supabase
          .from('employees')
          .select('user_id')
          .eq('id', updated.employee_id)
          .maybeSingle();
        if (subject?.user_id && subject.user_id !== user.id) {
          await createNotification({
            org_id: ctx.org_id,
            recipient_user_id: subject.user_id,
            actor_user_id: user.id,
            notification_type: 'incident_report_closed',
            title: 'Incident Report Closed',
            message: `Your incident report from ${updated.incident_date} has been reviewed and closed.`,
            related_table: 'incident_reports',
            related_id: updated.id,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incident-reports'] });
      toast.success('Review saved');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save the review'),
  });
}

/** Owners and managers only (RLS). Used for reports filed in error. */
export function useDeleteIncidentReport() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('incident_reports').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incident-reports'] });
      toast.success('Incident report deleted');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not delete the report'),
  });
}
