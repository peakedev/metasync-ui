"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { generatePassword } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { KeyRound, Copy, Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface ChangePasswordDialogProps {
  userId: string;
  userEmail: string;
}

export function ChangePasswordDialog({ userId, userEmail }: ChangePasswordDialogProps) {
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const changeMutation = useMutation({
    mutationFn: async (password: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/change-password`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, password }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success(`Password changed for ${userEmail}`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function reset() {
    setNewPassword(null);
    setCopied(false);
    setShowPassword(false);
    changeMutation.reset();
  }

  function handleSubmit() {
    const password = generatePassword();
    setNewPassword(password);
    changeMutation.mutate(password);
  }

  function handleCopy() {
    if (!newPassword) return;
    navigator.clipboard.writeText(newPassword);
    setCopied(true);
    toast.success("Password copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setOpen(false);
    reset();
  }

  const isChanged = changeMutation.isSuccess && newPassword;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="mr-2 h-4 w-4" />
          Change Password
        </Button>
      </DialogTrigger>
      <DialogContent>
        {!isChanged ? (
          <>
            <DialogHeader>
              <DialogTitle>Change Password</DialogTitle>
              <DialogDescription>
                Generate a new password for <strong>{userEmail}</strong>. The user will need to use this new password on their next login.
              </DialogDescription>
            </DialogHeader>
            {changeMutation.isError && (
              <p className="text-sm text-destructive">{changeMutation.error.message}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={changeMutation.isPending}>
                {changeMutation.isPending ? "Changing..." : "Generate New Password"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Password Changed</DialogTitle>
              <DialogDescription>
                New password generated for <strong>{userEmail}</strong>. Copy it and share it with the user.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>New Password</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This password will not be shown again. Make sure to copy it now.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
