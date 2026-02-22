"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useUserDetail } from "@/hooks/iam/use-user-detail";
import { useIAMMutations } from "@/hooks/iam/use-iam-mutations";
import { UserDetailCard } from "@/components/iam/user-detail-card";
import { MembershipRow } from "@/components/iam/membership-row";
import { InvitationRow } from "@/components/iam/invitation-row";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function UserDetailPage() {
  const params = useParams<{ userId: string }>();
  const { data, isLoading, error } = useUserDetail(params.userId);
  const {
    changeRole,
    reassignClient,
    removeMembership,
    revokeInvitation,
    resendInvitation,
  } = useIAMMutations();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">User not found.</p>
          <Link href="/owner/iam/users">
            <Button variant="outline" className="mt-4">Back to users</Button>
          </Link>
        </div>
      </div>
    );
  }

  function isLastAdminForTenant(tenantId: string): boolean {
    return (
      data!.memberships.filter(
        (m) => m.tenantId === tenantId && m.role === "tenant_admin"
      ).length === 1
    );
  }

  function handleChangeRole(tenantId: string, newRole: "tenant_admin" | "tenant_user") {
    changeRole.mutate(
      { tenantId, userId: params.userId, newRole },
      {
        onError: (err) => {
          if (err.message?.includes("last_admin_demotion")) {
            toast.error("Cannot demote — tenant must retain at least one admin");
          } else {
            toast.error(err.message);
          }
        },
      }
    );
  }

  function handleReassignClient(tenantId: string, clientId: string | null) {
    reassignClient.mutate(
      { tenantId, userId: params.userId, clientId },
      { onError: (err) => toast.error(err.message) }
    );
  }

  function handleRemoveMembership(tenantId: string) {
    removeMembership.mutate(
      { tenantId, userId: params.userId },
      {
        onError: (err) => {
          if (err.message?.includes("last_admin_removal")) {
            toast.error("Cannot remove — tenant must retain at least one admin");
          } else {
            toast.error(err.message);
          }
        },
        onSuccess: () => toast.success("Membership removed"),
      }
    );
  }

  function handleResend(invitationId: string) {
    resendInvitation.mutate(
      { invitationId },
      {
        onSuccess: (data) => {
          if (data?.autoAccepted) {
            toast.success("User already has an account — added to tenant directly.");
          } else {
            toast.success("Invitation resent");
          }
        },
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
      <Link href="/owner/iam/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to users
      </Link>

      <UserDetailCard user={data.user} />

      {/* Memberships */}
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Memberships</h2>
        {data.memberships.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">No memberships.</p>
        ) : (
          data.memberships.map((m) => (
            <MembershipRow
              key={m.id}
              membership={m}
              isLastAdmin={m.role === "tenant_admin" && isLastAdminForTenant(m.tenantId)}
              onChangeRole={(newRole) => handleChangeRole(m.tenantId, newRole)}
              onReassignClient={(clientId) => handleReassignClient(m.tenantId, clientId)}
              onRemove={() => handleRemoveMembership(m.tenantId)}
              isChangingRole={changeRole.isPending}
              isReassigning={reassignClient.isPending}
              isRemoving={removeMembership.isPending}
            />
          ))
        )}
      </div>

      {/* Invitations */}
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Invitations</h2>
        {data.invitations.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">No invitations.</p>
        ) : (
          data.invitations.map((inv) => (
            <InvitationRow
              key={inv.id}
              invitation={inv}
              onResend={() => handleResend(inv.id)}
              onRevoke={() => handleRevoke(inv.id)}
              isResending={resendInvitation.isPending}
              isRevoking={revokeInvitation.isPending}
            />
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Changes take effect on the user&apos;s next login or session refresh.
      </p>
    </div>
  );
}
