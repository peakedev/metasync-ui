"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/use-session";
import { proxyFetch } from "@/hooks/use-metasync-proxy";

export interface AssignedClient {
  id: string;
  name: string;
}

interface ClientContextValue {
  selectedClientId: string | null;
  setSelectedClientId: (id: string | null) => void;
  availableClients: AssignedClient[];
  clientsWithKeys: Set<string>;
  isLoading: boolean;
}

const ClientContext = createContext<ClientContextValue>({
  selectedClientId: null,
  setSelectedClientId: () => {},
  availableClients: [],
  clientsWithKeys: new Set(),
  isLoading: true,
});

const STORAGE_KEY = "metasync_selected_client";

function readStoredClient(): string | null {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

export function ClientProvider({ children }: { children: ReactNode }) {
  const { user, claims } = useSession();
  const [selectedClientId, setSelectedClientIdState] = useState<string | null>(
    () => readStoredClient()
  );
  const prevAutoRef = useRef<string | null>(null);

  const isTenantAdmin = claims.user_role === "tenant_admin";
  const isTenantUser = claims.user_role === "tenant_user";

  const setSelectedClientId = useCallback((id: string | null) => {
    setSelectedClientIdState(id);
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEY, id);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Tenant users: fetch assigned client IDs from junction table
  const { data: userClients = [], isLoading: userClientsLoading } = useQuery<
    AssignedClient[]
  >({
    queryKey: ["user-client-assignments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_client_assignments")
        .select("client_id")
        .eq("user_id", user!.id);

      if (error) throw error;

      return (data || []).map((row) => ({
        id: row.client_id,
        name: row.client_id,
      }));
    },
    enabled: !!user && isTenantUser,
  });

  // Tenant admins: fetch all clients from MetaSync backend via proxy
  const { data: adminClients = [], isLoading: adminClientsLoading } = useQuery<
    AssignedClient[]
  >({
    queryKey: ["tenant-clients", claims.tenant_id],
    queryFn: async () => {
      const result = await proxyFetch(claims.tenant_id!, "/clients") as Array<{
        clientId: string;
        name: string;
        enabled: boolean;
      }>;

      if (!Array.isArray(result)) return [];

      return result
        .filter((c) => c.enabled)
        .map((c) => ({ id: c.clientId, name: c.name }));
    },
    enabled: !!user && isTenantAdmin && !!claims.tenant_id,
  });

  const availableClients = isTenantAdmin ? adminClients : userClients;
  const isLoading = isTenantAdmin ? adminClientsLoading : userClientsLoading;

  // Batch-check which clients have API keys stored in Vault
  const clientIds = useMemo(
    () => availableClients.map((c) => c.id),
    [availableClients]
  );

  const { data: keyMap = {} } = useQuery<Record<string, boolean>>({
    queryKey: ["client-keys-check", claims.tenant_id, clientIds],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return {};

      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const res = await globalThis.fetch(`${sbUrl}/functions/v1/proxy`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({
          action: "check_client_keys",
          tenantId: claims.tenant_id,
          clientIds,
        }),
      });

      if (!res.ok) return {};
      const body = await res.json();
      return (body.keys ?? {}) as Record<string, boolean>;
    },
    enabled: !!user && isTenantAdmin && !!claims.tenant_id && clientIds.length > 0,
  });

  const clientsWithKeys = useMemo(
    () => new Set(Object.entries(keyMap).filter(([, v]) => v).map(([k]) => k)),
    [keyMap]
  );

  // Derive the effective selected client ID:
  // - tenant_user: auto-select first available if none stored
  // - tenant_admin: default to null (tenant-wide), only use stored if still valid AND has key
  const effectiveClientId = useMemo(() => {
    if ((!isTenantUser && !isTenantAdmin) || isLoading) return null;
    if (availableClients.length === 0) return null;

    const ids = availableClients.map((c) => c.id);

    if (selectedClientId && ids.includes(selectedClientId)) {
      if (isTenantAdmin && !clientsWithKeys.has(selectedClientId)) {
        return null;
      }
      return selectedClientId;
    }

    // Auto-select first client only for tenant_user, not for admin
    if (isTenantUser) {
      return ids[0];
    }

    return null;
  }, [isTenantUser, isTenantAdmin, isLoading, availableClients, selectedClientId, clientsWithKeys]);

  // Sync auto-selected value back to state + localStorage (only when it changes)
  if (effectiveClientId !== prevAutoRef.current) {
    prevAutoRef.current = effectiveClientId;
    if (effectiveClientId !== selectedClientId) {
      queueMicrotask(() => setSelectedClientId(effectiveClientId));
    }
  }

  return (
    <ClientContext.Provider
      value={{
        selectedClientId: effectiveClientId,
        setSelectedClientId,
        availableClients,
        clientsWithKeys,
        isLoading,
      }}
    >
      {children}
    </ClientContext.Provider>
  );
}

export function useClientContext() {
  return useContext(ClientContext);
}
