"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

export interface AppClaims {
  user_role?: "owner" | "tenant_admin" | "tenant_user";
  tenant_id?: string | null;
}

function decodeJwtClaims(accessToken: string | undefined): AppClaims {
  if (!accessToken) return {};
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1]));
    return (payload.app_metadata ?? {}) as AppClaims;
  } catch {
    return {};
  }
}

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const claims = useMemo(
    () => decodeJwtClaims(session?.access_token),
    [session?.access_token]
  );

  return { user, session, claims, loading };
}
