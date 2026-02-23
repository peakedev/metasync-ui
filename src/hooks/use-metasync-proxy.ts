"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "./use-tenant";
import { useSession } from "./use-session";
import { useClientContext } from "@/contexts/client-context";

interface ProxyOptions {
  path: string;
  queryParams?: Record<string, string>;
  enabled?: boolean;
  tenantSlug: string;
}

async function proxyFetch(
  tenantId: string,
  path: string,
  method = "GET",
  body?: unknown,
  clientId?: string | null
) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("No session");

  const payload: Record<string, unknown> = {
    tenantId,
    path,
    method,
    body: body,
  };
  if (clientId) payload.clientId = clientId;

  const response = await supabase.functions.invoke("proxy", {
    body: payload,
  });

  if (response.error) {
    throw new Error(response.error.message || "Proxy request failed");
  }

  return response.data;
}

export function useMetaSyncProxy<T = unknown>(
  options: ProxyOptions,
  queryOptions?: Partial<UseQueryOptions<T>>
) {
  const { data: tenant } = useTenant(options.tenantSlug);
  const { session } = useSession();
  const { selectedClientId } = useClientContext();

  const queryString = options.queryParams
    ? "?" + new URLSearchParams(options.queryParams).toString()
    : "";
  const fullPath = options.path + queryString;

  return useQuery<T>({
    queryKey: ["metasync", options.tenantSlug, options.path, options.queryParams, selectedClientId],
    queryFn: () => proxyFetch(tenant!.id, fullPath, "GET", undefined, selectedClientId) as Promise<T>,
    enabled: !!tenant && !!session && (options.enabled ?? true),
    ...queryOptions,
  });
}

export { proxyFetch };
