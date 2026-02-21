"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { IAMInvitationsFilters, InvitationDetail } from "@/types/iam";

export function useIAMInvitations(filters: IAMInvitationsFilters = {}) {
  const { tenantId, role } = filters;

  return useQuery<InvitationDetail[]>({
    queryKey: ["iam-invitations", { tenantId, role }],
    queryFn: async () => {
      let query = supabase
        .from("invitations")
        .select("id, tenant_id, role, client_id, status, expires_at, created_at, updated_at, invited_by, email, tenants(id, name), clients(id, name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }
      if (role) {
        query = query.eq("role", role);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((inv: any) => ({
        id: inv.id,
        tenantId: inv.tenants?.id || inv.tenant_id,
        tenantName: inv.tenants?.name || "",
        role: inv.role,
        clientId: inv.client_id,
        clientName: inv.clients?.name || null,
        status: inv.status,
        expiresAt: inv.expires_at,
        createdAt: inv.created_at,
        updatedAt: inv.updated_at,
        invitedBy: inv.invited_by,
        email: inv.email,
      }));
    },
    staleTime: 30_000,
  });
}
