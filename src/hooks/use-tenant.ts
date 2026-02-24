"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "./use-session";
import type { Tables } from "@/types/supabase";

export function useTenant(slug: string) {
  const { session } = useSession();

  return useQuery<Tables<"tenants"> | null>({
    queryKey: ["tenant", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("slug", slug)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
      }
      return data;
    },
    enabled: !!slug && !!session,
  });
}
