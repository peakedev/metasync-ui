"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { IAMInvitationsFilters, InvitationDetail } from "@/types/iam";

export function useIAMInvitations(filters: IAMInvitationsFilters = {}) {
  const { tenantId, role } = filters;

  return useQuery<InvitationDetail[]>({
    queryKey: ["iam-invitations", { tenantId, role }],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const params = new URLSearchParams();
      if (tenantId) params.set("tenantId", tenantId);
      if (role) params.set("role", role);

      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/iam-invitations?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      const { items } = await response.json();
      return items;
    },
    staleTime: 30_000,
  });
}
