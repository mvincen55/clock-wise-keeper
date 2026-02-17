import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const ALLOWED_EMAILS = ['meganvincent43@gmail.com', 'mvincent@drharelick.com'];
const DEFAULT_TIMEOUT_MINUTES = 20;
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

  const checkAllowed = (u: User | null): boolean => {
    return !!u?.email && ALLOWED_EMAILS.includes(u.email.toLowerCase());
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      const u = session?.user ?? null;
      setUser(u);
      const allowed = checkAllowed(u);
      setIsAllowed(allowed);

      // If user logged in but not allowed, immediately sign out
      if (u && !allowed) {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setIsAllowed(false);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      const u = session?.user ?? null;
      setUser(u);
      const allowed = checkAllowed(u);
      setIsAllowed(allowed);
      if (u && !allowed) {
        supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setIsAllowed(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!ALLOWED_EMAILS.includes(email.toLowerCase())) {
      return { error: { message: 'Access denied.' } };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
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
