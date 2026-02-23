"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const { user, claims, loading } = useSession();
  const [tenantMissing, setTenantMissing] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push("/login");
      return;
    }

    if (claims.user_role === "owner") {
      router.push("/owner/tenants");
      return;
    }

    if (claims.tenant_id) {
      supabase
        .from("tenants")
        .select("slug")
        .eq("id", claims.tenant_id)
        .single()
        .then(({ data }) => {
          if (data) {
            router.push(`/${data.slug}/dashboard`);
          } else {
            setTenantMissing(true);
          }
        });
    }
  }, [user, claims, loading, router]);

  // Derive error message from state — avoids calling setState synchronously in the effect
  const errorMessage = useMemo(() => {
    if (loading || !user) return null;
    if (tenantMissing) return "Your tenant could not be found. Please contact support.";
    if (!claims.user_role && !claims.tenant_id) {
      return "Your account is not associated with any tenant. Please contact your administrator or try signing in again.";
    }
    return null;
  }, [loading, user, claims, tenantMissing]);

  if (errorMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="mx-auto max-w-md space-y-4 text-center">
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}
            className="text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Sign out and try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-muted-foreground">Redirecting...</div>
    </div>
  );
}
