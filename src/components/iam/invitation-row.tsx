"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RotateCcw, X, AlertTriangle } from "lucide-react";
import type { InvitationDetail } from "@/types/iam";

interface InvitationRowProps {
  invitation: InvitationDetail;
  onResend: () => void;
  onRevoke: () => void;
  isResending?: boolean;
  isRevoking?: boolean;
}

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  accepted: "secondary",
  expired: "destructive",
};

export function InvitationRow({
  invitation,
  onResend,
  onRevoke,
  isResending,
  isRevoking,
}: InvitationRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isExpired = new Date(invitation.expiresAt) < new Date();
  const isPending = invitation.status === "pending";

  return (
    <div className="flex items-center gap-4 rounded-lg border p-4">
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{invitation.tenantName}</span>
          <Badge variant={statusVariant[invitation.status]}>
            {invitation.status}
          </Badge>
          {isPending && isExpired && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Expired
            </Badge>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {invitation.role === "tenant_admin" ? "Admin" : "User"}
          {invitation.clientName && ` · ${invitation.clientName}`}
          {" · "}Invited {new Date(invitation.createdAt).toLocaleDateString()}
          {" · "}Expires {new Date(invitation.expiresAt).toLocaleDateString()}
        </div>
      </div>

      {isPending && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onResend}
            disabled={isResending}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            {isResending ? "Resending..." : "Resend"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={isRevoking}
          >
            <X className="mr-1 h-3 w-3" />
            Revoke
          </Button>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke invitation</DialogTitle>
            <DialogDescription>
              This will cancel the pending invitation to <strong>{invitation.tenantName}</strong>.
              The invite link will no longer work.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { onRevoke(); setConfirmOpen(false); }}
              disabled={isRevoking}
            >
              {isRevoking ? "Revoking..." : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
