"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { proxyFetch } from "@/hooks/use-metasync-proxy";
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
import { Trash2, X, Plus } from "lucide-react";
import type { MembershipDetail } from "@/types/iam";

interface MembershipRowProps {
  membership: MembershipDetail;
  isLastAdmin: boolean;
  onChangeRole: (newRole: "tenant_admin" | "tenant_user") => void;
  onAssignClient: (clientId: string) => void;
  onUnassignClient: (clientId: string) => void;
  onRemove: () => void;
  isChangingRole?: boolean;
  isAssigning?: boolean;
  isRemoving?: boolean;
}

export function MembershipRow({
  membership,
  isLastAdmin,
  onChangeRole,
  onAssignClient,
  onUnassignClient,
  onRemove,
  isChangingRole,
  isAssigning,
  isRemoving,
}: MembershipRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: allClients = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["metasync-clients", membership.tenantId],
    queryFn: async () => {
      const result = await proxyFetch(membership.tenantId, "/clients") as Array<{
        clientId: string;
        name: string;
        enabled: boolean;
      }>;
      if (!Array.isArray(result)) return [];
      return result.filter((c) => c.enabled).map((c) => ({ id: c.clientId, name: c.name }));
    },
    enabled: membership.role === "tenant_user",
  });

  const assignedIds = new Set(membership.clients.map((c) => c.clientId));
  const unassignedClients = allClients.filter((c) => !assignedIds.has(c.id));

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-4">
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
      </div>

      {/* Client assignments (tenant_user only) */}
      {membership.role === "tenant_user" && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Assigned clients</div>
          <div className="flex flex-wrap gap-2">
            {membership.clients.map((c) => (
              <Badge key={c.clientId} variant="secondary" className="gap-1 pr-1">
                {c.clientName}
                <button
                  onClick={() => onUnassignClient(c.clientId)}
                  className="ml-1 rounded-sm p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {membership.clients.length === 0 && (
              <span className="text-sm text-muted-foreground">No clients assigned</span>
            )}
          </div>
          {unassignedClients.length > 0 && (
            <Select
              value=""
              onValueChange={(clientId) => onAssignClient(clientId)}
              disabled={isAssigning}
            >
              <SelectTrigger className="w-52" size="sm">
                <Plus className="mr-1 h-3 w-3" />
                <SelectValue placeholder="Add client" />
              </SelectTrigger>
              <SelectContent>
                {unassignedClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

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
