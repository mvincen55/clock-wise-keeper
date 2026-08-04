import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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

  // Set up inactivity listeners
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

    const evaluate = (session: Session | null) => {
      setSession(session);
      const u = session?.user ?? null;
      setUser(u);
      if (!u) {
        setIsAllowed(false);
        setLoading(false);
        return;
      }
      // The allowlist check hits the server; defer it out of the auth
      // callback (supabase-js deadlocks on awaited calls inside it).
      setTimeout(async () => {
        try {
          const allowed = await checkAllowed(u);
          if (cancelled) return;
          setIsAllowed(allowed);
          // Logged in but not allowed: immediately sign out.
          if (!allowed) {
            await supabase.auth.signOut();
            if (cancelled) return;
            setUser(null);
            setSession(null);
          }
        } catch {
          if (cancelled) return;
          setIsAllowed(false);
        } finally {
          // Never leave the app stuck on a loading screen.
          if (!cancelled) setLoading(false);
        }
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      evaluate(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => evaluate(session));

    return () => {
      cancelled = true;
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
