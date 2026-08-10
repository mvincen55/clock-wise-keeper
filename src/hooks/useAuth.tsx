import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { isInviteCompletionRoute } from '@/lib/invite-auth';

const DEFAULT_TIMEOUT_MINUTES = 0; // 0 = never auto-logout
const TIMEOUT_STORAGE_KEY = 'timevault_session_timeout_minutes';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAllowed: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  privacyLock: () => Promise<void>;
  sessionTimeoutMinutes: number;
  setSessionTimeoutMinutes: (minutes: number) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);
  const [sessionTimeoutMinutes, setTimeoutState] = useState(() => {
    const stored = localStorage.getItem(TIMEOUT_STORAGE_KEY);
    return stored ? parseInt(stored, 10) : DEFAULT_TIMEOUT_MINUTES;
  });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Id of the user who last passed the allowlist check. Lets evaluate() tell a
  // token refresh / tab-refocus re-auth of the vetted user apart from a real
  // sign-in, without reading state from a stale closure.
  const allowedUserIdRef = useRef<string | null>(null);

  // Access is decided server-side: the allowed_users table (maintained by
  // the invite flow) via the SECURITY DEFINER is_allowed_user(), the same
  // check RLS applies to every table. No emails live in client code.
  const checkAllowed = async (u: User | null): Promise<boolean> => {
    if (!u) return false;
    try {
      const { data, error } = await supabase.rpc('is_allowed_user');
      return !error && data === true;
    } catch {
      // Network/transient failure: treat as not allowed, never hang the app.
      return false;
    }
  };

  const clearInactivityTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const signOutClean = useCallback(async () => {
    clearInactivityTimer();
    allowedUserIdRef.current = null;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAllowed(false);
  }, [clearInactivityTimer]);

  const resetInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    if (sessionTimeoutMinutes > 0) {
      timeoutRef.current = setTimeout(() => {
        signOutClean();
      }, sessionTimeoutMinutes * 60 * 1000);
    }
  }, [sessionTimeoutMinutes, clearInactivityTimer, signOutClean]);

  useEffect(() => {
    if (!user || !isAllowed) return;

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handler = () => resetInactivityTimer();

    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetInactivityTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      clearInactivityTimer();
    };
  }, [user, isAllowed, resetInactivityTimer, clearInactivityTimer]);

  useEffect(() => {
    let cancelled = false;
    let evaluationVersion = 0;

    const evaluate = (nextSession: Session | null) => {
      const nextUser = nextSession?.user ?? null;

      // Tab refocus / token refresh for the already-vetted user: refresh the
      // session silently. Flipping loading here would unmount the page and
      // wipe unpersisted patient info; the allowlist stays enforced by RLS.
      if (nextUser && allowedUserIdRef.current === nextUser.id) {
        setSession(nextSession);
        setUser(nextUser);
        return;
      }

      const version = ++evaluationVersion;
      setSession(nextSession);
      setUser(nextUser);

      if (!nextUser) {
        allowedUserIdRef.current = null;
        setIsAllowed(false);
        setLoading(false);
        return;
      }

      setIsAllowed(false);
      setLoading(true);

      // The allowlist check hits the server; defer it out of the auth callback
      // because supabase-js can deadlock on awaited calls inside that callback.
      setTimeout(async () => {
        const allowed = await checkAllowed(nextUser);
        if (cancelled || version !== evaluationVersion) return;

        allowedUserIdRef.current = allowed ? nextUser.id : null;
        setIsAllowed(allowed);
        if (!allowed) {
          // Keep a not-yet-allowlisted session only on the narrow public routes
          // required to complete a valid token-backed invitation. Protected
          // application routes still require isAllowed.
          const completingInvite = isInviteCompletionRoute(
            window.location.pathname,
            window.location.search,
          );

          if (!completingInvite) {
            await supabase.auth.signOut();
            if (cancelled || version !== evaluationVersion) return;
            setUser(null);
            setSession(null);
          }
        }

        if (!cancelled && version === evaluationVersion) {
          setLoading(false);
        }
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      evaluate(nextSession);
    });

    supabase.auth.getSession().then(({ data: { session: nextSession } }) => evaluate(nextSession));

    return () => {
      cancelled = true;
      evaluationVersion += 1;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };
    // Same server-side gate RLS uses; deny and sign out non-allowlisted
    // accounts right here so the form shows a clear message.
    const allowed = await checkAllowed(data.user);
    if (!allowed) {
      await supabase.auth.signOut();
      return { error: { message: 'Access denied.' } };
    }
    return { error: null };
  };

  const privacyLock = async () => {
    await signOutClean();
  };

  const setSessionTimeoutMinutes = (minutes: number) => {
    setTimeoutState(minutes);
    localStorage.setItem(TIMEOUT_STORAGE_KEY, String(minutes));
  };

  return (
    <AuthContext.Provider value={{
      user, session, loading, isAllowed,
      signIn, signOut: signOutClean, privacyLock,
      sessionTimeoutMinutes, setSessionTimeoutMinutes,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
