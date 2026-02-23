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

export interface AssignedClient {
  id: string;
  name: string;
}

interface ClientContextValue {
  selectedClientId: string | null;
  setSelectedClientId: (id: string | null) => void;
  availableClients: AssignedClient[];
  isLoading: boolean;
}

const ClientContext = createContext<ClientContextValue>({
  selectedClientId: null,
  setSelectedClientId: () => {},
  availableClients: [],
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

  const { data: availableClients = [], isLoading } = useQuery<
    AssignedClient[]
  >({
    queryKey: ["user-client-assignments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_client_assignments")
        .select("client_id, clients(id, name)")
        .eq("user_id", user!.id);

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.clients?.id ?? row.client_id,
        name: row.clients?.name ?? "Unknown",
      }));
    },
    enabled: !!user && claims.user_role === "tenant_user",
  });

  // Derive the effective selected client ID:
  // - If not a tenant_user, no client selection applies
  // - If stored selection is still valid, keep it
  // - If only one client is available, auto-select it
  const effectiveClientId = useMemo(() => {
    if (claims.user_role !== "tenant_user" || isLoading) return null;

    const ids = availableClients.map((c) => c.id);

    if (selectedClientId && ids.includes(selectedClientId)) {
      return selectedClientId;
    }

    if (ids.length === 1) {
      return ids[0];
    }

    return null;
  }, [claims.user_role, isLoading, availableClients, selectedClientId]);

  // Sync auto-selected value back to state + localStorage (only when it changes)
  if (effectiveClientId !== prevAutoRef.current) {
    prevAutoRef.current = effectiveClientId;
    if (effectiveClientId !== selectedClientId) {
      // Schedule the state update via microtask to avoid set-state-in-render warning
      queueMicrotask(() => setSelectedClientId(effectiveClientId));
    }
  }

  return (
    <ClientContext.Provider
      value={{
        selectedClientId: effectiveClientId,
        setSelectedClientId,
        availableClients,
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
