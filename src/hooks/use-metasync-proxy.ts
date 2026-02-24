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

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const rawRes = await globalThis.fetch(`${sbUrl}/functions/v1/proxy`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify(payload),
  });
  const rawBody = await rawRes.text();

  if (!rawRes.ok) {
    let msg = "Proxy request failed";
    try {
      const parsed = JSON.parse(rawBody);
      msg = parsed.error ?? parsed.detail ?? parsed.message ?? rawBody;
    } catch {
      msg = rawBody || `HTTP ${rawRes.status}`;
    }
    throw new Error(msg);
  }

  try { return JSON.parse(rawBody); } catch { return rawBody; }
}

export function useMetaSyncProxy<T = unknown>(
  options: ProxyOptions,
  queryOptions?: Partial<UseQueryOptions<T>>
) {
  const { data: tenant } = useTenant(options.tenantSlug);
  const { session } = useSession();
  const { selectedClientId, isLoading: clientLoading } = useClientContext();

  const queryString = options.queryParams
    ? "?" + new URLSearchParams(options.queryParams).toString()
    : "";
  const fullPath = options.path + queryString;

  return useQuery<T>({
    queryKey: ["metasync", options.tenantSlug, options.path, options.queryParams, selectedClientId],
    queryFn: () => proxyFetch(tenant!.id, fullPath, "GET", undefined, selectedClientId) as Promise<T>,
    enabled: !!tenant && !!session && !clientLoading && (options.enabled ?? true),
    ...queryOptions,
  });
}

export { proxyFetch };
