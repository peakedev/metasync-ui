"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useIAMInvitations } from "@/hooks/iam/use-iam-invitations";
import { useIAMMutations } from "@/hooks/iam/use-iam-mutations";
import { IAMNav } from "@/components/iam/iam-nav";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RotateCcw, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import type { IAMInvitationsFilters } from "@/types/iam";

export default function InvitationsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InvitationsPageContent />
    </Suspense>
  );
}

function InvitationsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const filters: IAMInvitationsFilters = {
    tenantId: searchParams.get("tenantId") || undefined,
    role: (searchParams.get("role") as IAMInvitationsFilters["role"]) || undefined,
  };

  const { data: invitations = [], isLoading } = useIAMInvitations(filters);
  const { resendInvitation, revokeInvitation } = useIAMMutations();

  const { data: tenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name")
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Auto-expire stale invitations on mount
  useEffect(() => {
    const staleIds = invitations
      .filter((inv) => inv.status === "pending" && new Date(inv.expiresAt) < new Date())
      .map((inv) => inv.id);
    if (staleIds.length > 0) {
      supabase
        .from("invitations")
        .update({ status: "expired" as const })
        .in("id", staleIds)
        .then(() => queryClient.invalidateQueries({ queryKey: ["iam-invitations"] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitations.length]);

  function updateFilter(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/owner/iam/invitations?${params.toString()}`);
  }

  function handleResend(invitationId: string) {
    resendInvitation.mutate(
      { invitationId },
      {
        onSuccess: () => toast.success("Invitation resent"),
        onError: (err) => {
          if (err.message === "too_many_requests") {
            toast.error("Invitation was just resent, please wait");
          } else {
            toast.error(err.message);
          }
        },
      }
    );
  }

  function handleRevoke(invitationId: string) {
    revokeInvitation.mutate(
      { invitationId },
      {
        onSuccess: () => toast.success("Invitation revoked"),
        onError: (err) => toast.error(err.message),
      }
    );
  }

  return (
    <div className="space-y-6">
      <IAMNav />
      <h1 className="text-2xl font-semibold">Pending Invitations</h1>

      <div className="flex gap-3">
        <Select
          value={filters.tenantId || "all"}
          onValueChange={(v) => updateFilter("tenantId", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All tenants" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tenants</SelectItem>
            {tenants.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.role || "all"}
          onValueChange={(v) =>
            updateFilter("role", v === "all" ? undefined : v)
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="tenant_admin">Admin</SelectItem>
            <SelectItem value="tenant_user">User</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((inv) => {
              const isExpired = new Date(inv.expiresAt) < new Date();
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.email}</TableCell>
                  <TableCell>{inv.tenantName}</TableCell>
                  <TableCell>
                    <Badge variant={inv.role === "tenant_admin" ? "default" : "secondary"}>
                      {inv.role === "tenant_admin" ? "Admin" : "User"}
                    </Badge>
                  </TableCell>
                  <TableCell>{inv.clientName || "None"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <span className={isExpired ? "text-destructive flex items-center gap-1" : "text-muted-foreground"}>
                      {isExpired && <AlertTriangle className="h-3 w-3" />}
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResend(inv.id)}
                        disabled={resendInvitation.isPending}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Resend
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(inv.id)}
                        disabled={revokeInvitation.isPending}
                      >
                        <X className="mr-1 h-3 w-3" />
                        Revoke
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {invitations.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No pending invitations.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
