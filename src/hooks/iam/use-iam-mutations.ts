"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
      const { error } = await supabase
        .from("tenant_memberships")
        .update({ role: newRole })
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["iam-users"] });
      queryClient.invalidateQueries({ queryKey: ["user-detail", variables.userId] });
    },
    onError: (err) => {
      toast.error(`Failed to change role: ${err.message}`);
    },
  });

  const assignClient = useMutation({
    mutationFn: async ({
      userId,
      clientId,
    }: {
      userId: string;
      clientId: string;
    }) => {
      const { error } = await supabase
        .from("user_client_assignments")
        .insert({ user_id: userId, client_id: clientId });

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["iam-users"] });
      queryClient.invalidateQueries({ queryKey: ["user-detail", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["user-client-assignments", variables.userId] });
      toast.success("Client assigned");
    },
    onError: (err) => {
      toast.error(`Failed to assign client: ${err.message}`);
    },
  });

  const unassignClient = useMutation({
    mutationFn: async ({
      userId,
      clientId,
    }: {
      userId: string;
      clientId: string;
    }) => {
      const { error } = await supabase
        .from("user_client_assignments")
        .delete()
        .eq("user_id", userId)
        .eq("client_id", clientId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["iam-users"] });
      queryClient.invalidateQueries({ queryKey: ["user-detail", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["user-client-assignments", variables.userId] });
      toast.success("Client unassigned");
    },
    onError: (err) => {
      toast.error(`Failed to unassign client: ${err.message}`);
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
    assignClient,
    unassignClient,
    removeMembership,
  };
}
