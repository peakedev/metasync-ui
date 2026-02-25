"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const { user, claims, loading } = useSession();
  const [tenantLookupError, setTenantLookupError] = useState<string | null>(null);
  const attemptRef = useRef(0);

  const noTenantId =
    !loading && !!user && claims.user_role !== "owner" && !claims.tenant_id;

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

    if (!claims.tenant_id) return;

    const currentAttempt = ++attemptRef.current;

    async function resolveTenant() {
      // Reset error on every new attempt (e.g. when session refreshes)
      setTenantLookupError(null);

      const { data, error: queryError } = await supabase
        .from("tenants")
        .select("slug")
        .eq("id", claims.tenant_id!)
        .single();

      if (currentAttempt !== attemptRef.current) return;

      if (data) {
        router.push(`/${data.slug}/dashboard`);
        return;
      }

      // Retry once after a short delay — the JWT might not have propagated
      // to the RLS context on the very first request after login.
      if (currentAttempt <= 1) {
        await new Promise((r) => setTimeout(r, 500));
        if (currentAttempt !== attemptRef.current) return;

        const retry = await supabase
          .from("tenants")
          .select("slug")
          .eq("id", claims.tenant_id!)
          .single();

        if (currentAttempt !== attemptRef.current) return;

        if (retry.data) {
          router.push(`/${retry.data.slug}/dashboard`);
          return;
        }
      }

      console.error("[Home] Tenant lookup failed", {
        tenantId: claims.tenant_id,
        error: queryError,
      });
      setTenantLookupError("Your tenant could not be found. Please contact support.");
    }

    resolveTenant();
  }, [user, claims, loading, router]);

  const error = noTenantId
    ? "Your account is not associated with any tenant. Please contact your administrator or try signing in again."
    : tenantLookupError;

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="mx-auto max-w-md space-y-4 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
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
