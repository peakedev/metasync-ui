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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-assignments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "assign", userId, clientId }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-assignments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "unassign", userId, clientId }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
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
