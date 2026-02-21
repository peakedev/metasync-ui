"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const { user, claims, loading } = useSession();

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
          }
        });
    }
  }, [user, claims, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-muted-foreground">Redirecting...</div>
    </div>
  );
}
