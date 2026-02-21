"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/supabase";

export function useTenant(slug: string) {
  return useQuery<Tables<"tenants"> | null>({
    queryKey: ["tenant", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("slug", slug)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // Not found
        throw error;
      }
      return data;
    },
    enabled: !!slug,
  });
}
