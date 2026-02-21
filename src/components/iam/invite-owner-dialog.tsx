"use client";

import { useState } from "react";
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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useIAMMutations } from "@/hooks/iam/use-iam-mutations";

export function InviteOwnerDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { inviteOwner } = useIAMMutations();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    inviteOwner.mutate(
      { email },
      {
        onSuccess: () => {
          toast.success(`Invitation sent to ${email}`);
          setEmail("");
          setOpen(false);
        },
        onError: (err) => {
          if (err.message === "duplicate_invitation") {
            setError("A pending invitation already exists for this email.");
          } else {
            setError(err.message);
          }
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEmail(""); setError(null); } }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Invite Owner
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Invite Owner</DialogTitle>
            <DialogDescription>Send an invitation to create a new owner account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="owner-email">Email</Label>
              <Input
                id="owner-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={inviteOwner.isPending || !email}>
              {inviteOwner.isPending ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
