"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { IAMUsersFilters, IAMUsersResponse } from "@/types/iam";

export function useIAMUsers(filters: IAMUsersFilters = {}) {
  const { tenantId, role, assigned, search, page = 0, pageSize = 100 } = filters;

  return useQuery<IAMUsersResponse>({
    queryKey: ["iam-users", { tenantId, role, assigned, search, page, pageSize }],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const params = new URLSearchParams();
      if (tenantId) params.set("tenantId", tenantId);
      if (role) params.set("role", role);
      if (assigned !== undefined) params.set("assigned", String(assigned));
      if (search) params.set("search", search);
      params.set("limit", String(pageSize));
      params.set("offset", String(page * pageSize));

      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/iam-users?${params.toString()}`;
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

      return response.json();
    },
    staleTime: 30_000,
  });
}
