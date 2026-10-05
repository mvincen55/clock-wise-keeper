import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { CHOOSE_PASSWORD_PATH, needsPasswordChange } from '@/lib/password-change';

/**
 * Keeps a signed-in person whose login still has its temporary password out
 * of the app until they choose their own (see src/lib/password-change.ts).
 * Rendered inside the auth check and before the onboarding gate, so a new
 * member picks a password first and only then meets onboarding.
 */
export function PasswordGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (needsPasswordChange(user) && location.pathname !== CHOOSE_PASSWORD_PATH) {
    return <Navigate to={CHOOSE_PASSWORD_PATH} replace />;
  }
  return <>{children}</>;
}
