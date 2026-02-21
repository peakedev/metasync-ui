"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><p>Loading...</p></div>}>
      <InviteAcceptContent />
    </Suspense>
  );
}

type Status = "processing" | "set-password" | "saving-password" | "success" | "error" | "expired";

function InviteAcceptContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [redirectPath, setRedirectPath] = useState<string>("/");

  // Password form state
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    async function processInvitation() {
      try {
        // The session was established by /auth/callback (PKCE code exchange)
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
            // Already a member — skip to password step
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
            setRedirectPath(`/${tenant.slug}/dashboard`);
          }
        }

        // Show the set-password form
        setStatus("set-password");
      } catch (err) {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    }

    processInvitation();
  }, [router, searchParams]);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setStatus("saving-password");

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setPasswordError(error.message);
      setStatus("set-password");
      return;
    }

    setStatus("success");
    setTimeout(() => router.push(redirectPath), 1000);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        {status === "processing" && (
          <CardHeader className="text-center">
            <CardTitle>Setting up your account</CardTitle>
            <CardDescription>Please wait while we complete your registration...</CardDescription>
          </CardHeader>
        )}

        {(status === "set-password" || status === "saving-password") && (
          <>
            <CardHeader className="text-center">
              <CardTitle>Set your password</CardTitle>
              <CardDescription>Choose a password so you can sign in later.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                {passwordError && (
                  <p className="text-sm text-destructive" role="alert">
                    {passwordError}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={status === "saving-password"}>
                  {status === "saving-password" ? "Saving..." : "Set password & continue"}
                </Button>
              </form>
            </CardContent>
          </>
        )}

        {status === "success" && (
          <CardHeader className="text-center">
            <CardTitle>Welcome!</CardTitle>
            <CardDescription>Your account is ready. Redirecting...</CardDescription>
          </CardHeader>
        )}

        {status === "expired" && (
          <>
            <CardHeader className="text-center">
              <CardTitle>Invitation expired</CardTitle>
              <CardDescription>This invitation link has expired. Please ask your admin to send a new one.</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Link href="/login">
                <Button variant="outline">Back to login</Button>
              </Link>
            </CardContent>
          </>
        )}

        {status === "error" && (
          <>
            <CardHeader className="text-center">
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>{errorMessage}</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Link href="/login">
                <Button variant="outline">Back to login</Button>
              </Link>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
