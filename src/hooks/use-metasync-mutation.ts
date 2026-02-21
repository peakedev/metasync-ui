"use client";

import { useMutation, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "./use-tenant";

interface MutationOptions {
  path: string;
  method?: string;
  tenantSlug: string;
  invalidateKeys?: string[][];
}

export function useMetaSyncMutation<TBody = unknown, TResponse = unknown>(
  options: MutationOptions,
  mutationOptions?: Partial<UseMutationOptions<TResponse, Error, TBody>>
) {
  const { data: tenant } = useTenant(options.tenantSlug);
  const queryClient = useQueryClient();

  return useMutation<TResponse, Error, TBody>({
    mutationFn: async (body: TBody) => {
      if (!tenant) throw new Error("Tenant not loaded");

      const response = await supabase.functions.invoke("proxy", {
        body: {
          tenantId: tenant.id,
          path: options.path,
          method: options.method || "POST",
          body,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Mutation failed");
      }

      return response.data as TResponse;
    },
    onSuccess: (...args) => {
      // Invalidate specified cache keys
      if (options.invalidateKeys) {
        options.invalidateKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
      mutationOptions?.onSuccess?.(...args);
    },
    ...mutationOptions,
  });
}
