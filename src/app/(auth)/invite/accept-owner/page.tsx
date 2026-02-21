"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function AcceptOwnerPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><p>Loading...</p></div>}>
      <AcceptOwnerContent />
    </Suspense>
  );
}

function AcceptOwnerContent() {
  const router = useRouter();
  const [status, setStatus] = useState<"processing" | "success" | "error" | "expired" | "used">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function processOwnerInvitation() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          setStatus("error");
          setErrorMessage("No active session. Please try clicking the invitation link again.");
          return;
        }

        // Call complete-owner-signup edge function
        const response = await supabase.functions.invoke("complete-owner-signup", {});

        if (response.error) {
          const errorBody = response.data;
          if (errorBody?.error === "invitation_expired") {
            setStatus("expired");
            return;
          }
          if (errorBody?.error === "invitation_already_used") {
            setStatus("used");
            return;
          }
          setStatus("error");
          setErrorMessage(errorBody?.error || response.error.message);
          return;
        }

        // Refresh session to get updated JWT with owner role
        await supabase.auth.refreshSession();

        setStatus("success");
        setTimeout(() => router.push("/owner/tenants"), 1000);
      } catch (err) {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    }

    processOwnerInvitation();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === "processing" && (
            <>
              <CardTitle>Setting up your owner account</CardTitle>
              <CardDescription>Please wait while we complete your registration...</CardDescription>
            </>
          )}
          {status === "success" && (
            <>
              <CardTitle>Welcome, Owner!</CardTitle>
              <CardDescription>Your owner account has been set up. Redirecting to the admin console...</CardDescription>
            </>
          )}
          {status === "expired" && (
            <>
              <CardTitle>Invitation expired</CardTitle>
              <CardDescription>This invitation has expired. Ask an owner to re-invite you.</CardDescription>
            </>
          )}
          {status === "used" && (
            <>
              <CardTitle>Invitation already used</CardTitle>
              <CardDescription>This invitation has already been accepted.</CardDescription>
            </>
          )}
          {status === "error" && (
            <>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>{errorMessage}</CardDescription>
            </>
          )}
        </CardHeader>
        {(status === "error" || status === "expired" || status === "used") && (
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
