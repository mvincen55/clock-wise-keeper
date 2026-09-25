import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOrgEmployees } from '@/hooks/useEmployees';
import { useOrgStaff } from '@/hooks/useStaffCodes';
import { buildChatDirectory, type ChatDirectory } from '@/lib/chat-directory';

/**
 * The people behind the chat surfaces (Messages page, chat dock): who each
 * user id is, and who the signed-in member may start a chat with.
 *
 * Read through the staff directory RPC rather than the employees table so an
 * employee — who may read only their own employees row — still sees their
 * teammates. See lib/chat-directory for the merge.
 */
export function useChatDirectory(): ChatDirectory & { isLoading: boolean } {
  const { user } = useAuth();
  const { data: staff, isLoading: staffLoading } = useOrgStaff();
  const { data: employees, isLoading: employeesLoading } = useOrgEmployees();
  const directory = useMemo(
    () => buildChatDirectory(staff ?? [], employees ?? [], user?.id),
    [staff, employees, user?.id],
  );
  return { ...directory, isLoading: staffLoading || employeesLoading };
}
