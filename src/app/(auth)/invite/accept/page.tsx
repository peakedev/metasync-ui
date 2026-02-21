"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><p>Loading...</p></div>}>
      <InviteAcceptContent />
    </Suspense>
  );
}

function InviteAcceptContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"processing" | "success" | "error" | "expired">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function processInvitation() {
      try {
        // The user should already be authenticated at this point
        // (Supabase magic link / invite link auto-signs in)
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          setStatus("error");
          setErrorMessage("No active session. Please try clicking the invitation link again.");
          return;
        }

        // Call complete-signup edge function
        const response = await supabase.functions.invoke("complete-signup", {});

        if (response.error) {
          const errorBody = response.data;
          if (errorBody?.error === "invitation_expired") {
            setStatus("expired");
            return;
          }
          if (errorBody?.error === "already_member") {
            // Already a member, just redirect
          } else {
            setStatus("error");
            setErrorMessage(errorBody?.error || response.error.message);
            return;
          }
        }

        // Refresh session to get updated JWT claims
        await supabase.auth.refreshSession();

        const { data: { session: refreshedSession } } = await supabase.auth.getSession();
        if (refreshedSession?.user?.app_metadata?.tenant_id) {
          const { data: tenant } = await supabase
            .from("tenants")
            .select("slug")
            .eq("id", refreshedSession.user.app_metadata.tenant_id)
            .single();

          if (tenant) {
            setStatus("success");
            setTimeout(() => router.push(`/${tenant.slug}/dashboard`), 1000);
            return;
          }
        }

        setStatus("success");
        setTimeout(() => router.push("/"), 1000);
      } catch (err) {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    }

    processInvitation();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === "processing" && (
            <>
              <CardTitle>Setting up your account</CardTitle>
              <CardDescription>Please wait while we complete your registration...</CardDescription>
            </>
          )}
          {status === "success" && (
            <>
              <CardTitle>Welcome!</CardTitle>
              <CardDescription>Your account has been set up. Redirecting...</CardDescription>
            </>
          )}
          {status === "expired" && (
            <>
              <CardTitle>Invitation expired</CardTitle>
              <CardDescription>This invitation link has expired. Please ask your admin to send a new one.</CardDescription>
            </>
          )}
          {status === "error" && (
            <>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>{errorMessage}</CardDescription>
            </>
          )}
        </CardHeader>
        {(status === "error" || status === "expired") && (
          <CardContent className="text-center">
            <Link href="/login">
              <Button variant="outline">Back to login</Button>
            </Link>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
