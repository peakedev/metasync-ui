"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { UserDetailResponse } from "@/types/iam";

export function useUserDetail(userId: string) {
  return useQuery<UserDetailResponse>({
    queryKey: ["user-detail", userId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/iam-user-detail?userId=${userId}`;
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
    enabled: !!userId,
    staleTime: 60_000,
  });
}
