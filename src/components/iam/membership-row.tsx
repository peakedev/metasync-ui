"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Trash2 } from "lucide-react";
import type { MembershipDetail } from "@/types/iam";

interface MembershipRowProps {
  membership: MembershipDetail;
  isLastAdmin: boolean;
  onChangeRole: (newRole: "tenant_admin" | "tenant_user") => void;
  onReassignClient: (clientId: string | null) => void;
  onRemove: () => void;
  isChangingRole?: boolean;
  isReassigning?: boolean;
  isRemoving?: boolean;
}

export function MembershipRow({
  membership,
  isLastAdmin,
  onChangeRole,
  onReassignClient,
  onRemove,
  isChangingRole,
  isReassigning,
  isRemoving,
}: MembershipRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients", membership.tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("tenant_id", membership.tenantId)
        .eq("enabled", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: membership.role === "tenant_user",
  });

  return (
    <div className="flex items-center gap-4 rounded-lg border p-4">
      <div className="flex-1 space-y-1">
        <div className="font-medium">{membership.tenantName}</div>
        <div className="text-sm text-muted-foreground">
          Since {new Date(membership.createdAt).toLocaleDateString()}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Role selector */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Select
                  value={membership.role}
                  onValueChange={(v) => onChangeRole(v as "tenant_admin" | "tenant_user")}
                  disabled={isLastAdmin || isChangingRole}
                >
                  <SelectTrigger className="w-36" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tenant_admin">Admin</SelectItem>
                    <SelectItem value="tenant_user">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TooltipTrigger>
            {isLastAdmin && (
              <TooltipContent>Last admin — cannot demote or remove</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {/* Client selector (tenant_user only) */}
        {membership.role === "tenant_user" && (
          <Select
            value={membership.clientId || "unassigned"}
            onValueChange={(v) => onReassignClient(v === "unassigned" ? null : v)}
            disabled={isReassigning}
          >
            <SelectTrigger className="w-40" size="sm">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {membership.role === "tenant_admin" && (
          <Badge variant="secondary" className="w-40 justify-center">Admin key</Badge>
        )}

        {/* Remove button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isLastAdmin || isRemoving}
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TooltipTrigger>
            {isLastAdmin && (
              <TooltipContent>Last admin — cannot remove</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove membership</DialogTitle>
            <DialogDescription>
              User will lose access to <strong>{membership.tenantName}</strong> on next session refresh.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { onRemove(); setConfirmOpen(false); }}
              disabled={isRemoving}
            >
              {isRemoving ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
