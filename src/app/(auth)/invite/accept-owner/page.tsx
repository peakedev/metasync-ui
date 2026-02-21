"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export default function AcceptOwnerPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><p>Loading...</p></div>}>
      <AcceptOwnerContent />
    </Suspense>
  );
}

type Status = "processing" | "set-password" | "saving-password" | "success" | "error" | "expired" | "used";

function AcceptOwnerContent() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Password form state
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    async function processOwnerInvitation() {
      try {
        // The session was established by /auth/callback (PKCE code exchange)
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

        // Show the set-password form
        setStatus("set-password");
      } catch (err) {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    }

    processOwnerInvitation();
  }, [router]);

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
    setTimeout(() => router.push("/owner/tenants"), 1000);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        {status === "processing" && (
          <CardHeader className="text-center">
            <CardTitle>Setting up your owner account</CardTitle>
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
            <CardTitle>Welcome, Owner!</CardTitle>
            <CardDescription>Your account is ready. Redirecting to the admin console...</CardDescription>
          </CardHeader>
        )}

        {status === "expired" && (
          <>
            <CardHeader className="text-center">
              <CardTitle>Invitation expired</CardTitle>
              <CardDescription>This invitation has expired. Ask an owner to re-invite you.</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Link href="/login">
                <Button variant="outline">Back to login</Button>
              </Link>
            </CardContent>
          </>
        )}

        {status === "used" && (
          <>
            <CardHeader className="text-center">
              <CardTitle>Invitation already used</CardTitle>
              <CardDescription>This invitation has already been accepted.</CardDescription>
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
