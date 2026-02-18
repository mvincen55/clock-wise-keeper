import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useToast } from '@/hooks/use-toast';

export function useCreateOrg() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orgName: string) => {
      if (!user) throw new Error('Not authenticated');

      const { data: org, error: orgErr } = await supabase
        .from('orgs')
        .insert({ name: orgName, created_by: user.id })
        .select()
        .single();
      if (orgErr) throw orgErr;

      const { error: memErr } = await supabase
        .from('org_members')
        .insert({ org_id: org.id, user_id: user.id, role: 'owner', status: 'active' });
      if (memErr) throw memErr;

      const { error: empErr } = await supabase
        .from('employees')
        .insert({
          org_id: org.id,
          user_id: user.id,
          display_name: user.email?.split('@')[0] || 'Owner',
          email: user.email,
        });
      if (empErr) throw empErr;

      return org;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-context'] });
      toast({ title: 'Organization created!' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useInviteEmployee() {
  const { data: ctx } = useOrgContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: 'manager' | 'employee' }) => {
      if (!ctx) throw new Error('No org context');
      const { data, error } = await supabase
        .from('org_invites')
        .insert({ org_id: ctx.org_id, email, role })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-invites'] });
      toast({ title: 'Invite created' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}
