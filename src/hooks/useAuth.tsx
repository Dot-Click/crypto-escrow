import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { touchPresence } from "@/lib/presence.functions";

const PRESENCE_INTERVAL_MS = 4 * 60_000;

export type Profile = {
  id: string;
  display_name: string;
  role: "buyer" | "seller" | "both";
  email: string | null;
  trades_completed: number;
  country: string | null;
  referral_code: string;
  is_verified: boolean;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  isAdmin: false,
  loading: true,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const [{ data: p }, { data: roles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, role, email, trades_completed, country, referral_code, is_verified")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile((p as Profile | null) ?? null);
    setIsAdmin((roles ?? []).some((r) => r.role === "admin"));
  };

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) void loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user) {
        void loadProfile(next.user.id);
      } else {
        setProfile(null);
        setIsAdmin(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const touchPresenceFn = useServerFn(touchPresence);
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    void touchPresenceFn();
    const interval = setInterval(() => void touchPresenceFn(), PRESENCE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userId, touchPresenceFn]);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        profile,
        isAdmin,
        loading,
        refreshProfile: async () => {
          if (session?.user) await loadProfile(session.user.id);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
