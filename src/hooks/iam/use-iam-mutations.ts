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

  return {
    changeRole,
    reassignClient,
    removeMembership,
  };
}
