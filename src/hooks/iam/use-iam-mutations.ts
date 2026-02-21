"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useIAMMutations() {
  const queryClient = useQueryClient();

  const changeRole = useMutation({
    mutationFn: async ({
      tenantId,
      userId,
      newRole,
    }: {
      tenantId: string;
      userId: string;
      newRole: "tenant_admin" | "tenant_user";
    }) => {
      const updatePayload: Record<string, unknown> = { role: newRole };
      // Promoting to tenant_admin: clear client_id (admins use admin key)
      if (newRole === "tenant_admin") {
        updatePayload.client_id = null;
      }

      const { error } = await supabase
        .from("tenant_memberships")
        .update(updatePayload)
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["iam-users"] });
      queryClient.invalidateQueries({ queryKey: ["user-detail", variables.userId] });
    },
  });

  const reassignClient = useMutation({
    mutationFn: async ({
      tenantId,
      userId,
      clientId,
    }: {
      tenantId: string;
      userId: string;
      clientId: string | null;
    }) => {
      const { error } = await supabase
        .from("tenant_memberships")
        .update({ client_id: clientId })
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["iam-users"] });
      queryClient.invalidateQueries({ queryKey: ["user-detail", variables.userId] });
    },
  });

  const removeMembership = useMutation({
    mutationFn: async ({
      tenantId,
      userId,
    }: {
      tenantId: string;
      userId: string;
    }) => {
      const { error } = await supabase
        .from("tenant_memberships")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["iam-users"] });
      queryClient.invalidateQueries({ queryKey: ["user-detail", variables.userId] });
    },
  });

  const revokeInvitation = useMutation({
    mutationFn: async ({ invitationId }: { invitationId: string }) => {
      const { error } = await supabase
        .from("invitations")
        .update({ status: "expired" as const })
        .eq("id", invitationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["iam-users"] });
      queryClient.invalidateQueries({ queryKey: ["iam-invitations"] });
    },
  });

  const resendInvitation = useMutation({
    mutationFn: async ({ invitationId }: { invitationId: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/resend-invite`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invitationId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["iam-users"] });
      queryClient.invalidateQueries({ queryKey: ["iam-invitations"] });
    },
  });

  const inviteOwner = useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-owner`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-list"] });
    },
  });

  return {
    changeRole,
    reassignClient,
    removeMembership,
    revokeInvitation,
    resendInvitation,
    inviteOwner,
  };
}
