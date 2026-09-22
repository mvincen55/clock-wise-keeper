import ManagementShell from '@/components/management/ManagementShell';
import AttentionRoom from '@/components/management/AttentionRoom';

/**
 * Management → Attention (design §3.4): the sidebar lands here. The other
 * rooms are People, Payroll, and Office; the room switcher is in the shell.
 */
export default function Management() {
  return (
    <ManagementShell room="attention" wide>
      <AttentionRoom />
    </ManagementShell>
  );
}
