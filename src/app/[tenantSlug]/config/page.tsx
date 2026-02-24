"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function ConfigPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { data: tenant, isLoading } = useTenant(tenantSlug);
  const queryClient = useQueryClient();

  const [backendUrl, setBackendUrl] = useState("");
  const [urlInitialized, setUrlInitialized] = useState(false);
  const [healthStatus, setHealthStatus] = useState<"unknown" | "checking" | "connected" | "unreachable">("unknown");
  const [adminKey, setAdminKey] = useState("");
  const [keyStatus, setKeyStatus] = useState<"unknown" | "checking" | "configured" | "not_configured">("unknown");

  const checkHealth = useCallback(async (tenantId: string) => {
    setHealthStatus("checking");
    try {
      const { data, error } = await supabase.functions.invoke("proxy", {
        body: { action: "check_health", tenantId },
      });
      if (error) {
        setHealthStatus("unreachable");
        return;
      }
      setHealthStatus(data?.reachable ? "connected" : "unreachable");
    } catch {
      setHealthStatus("unreachable");
    }
  }, []);

  const checkAdminKey = useCallback(async (tenantId: string) => {
    setKeyStatus("checking");
    try {
      const { data, error } = await supabase.functions.invoke("proxy", {
        body: { action: "check_admin_key", tenantId },
      });
      if (error) {
        setKeyStatus("not_configured");
        return;
      }
      setKeyStatus(data?.exists ? "configured" : "not_configured");
    } catch {
      setKeyStatus("not_configured");
    }
  }, []);

  // Initialize form and run checks when tenant loads
  useEffect(() => {
    if (!tenant || urlInitialized) return;
    setBackendUrl(tenant.backend_url || "");
    setUrlInitialized(true);

    if (tenant.backend_url) {
      checkHealth(tenant.id);
    }
    checkAdminKey(tenant.id);
  }, [tenant, urlInitialized, checkHealth, checkAdminKey]);

  const urlMutation = useMutation({
    mutationFn: async (url: string) => {
      const { error } = await supabase
        .from("tenants")
        .update({ backend_url: url })
        .eq("id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["tenant", tenantSlug] });
      toast.success("Backend URL saved");
      checkHealth(tenant!.id);
    },
  });

  const keyMutation = useMutation({
    mutationFn: async (key: string) => {
      const { data, error } = await supabase.functions.invoke("proxy", {
        body: {
          action: "store_admin_key",
          tenantId: tenant!.id,
          key,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      setAdminKey("");
      setKeyStatus("configured");
      toast.success("Admin API key saved");
    },
    onError: (err) => {
      toast.error(`Failed to save API key: ${err.message}`);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!tenant) {
    return <div className="text-muted-foreground">Tenant not found</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Backend Configuration</h1>

      <Card>
        <CardHeader>
          <CardTitle>MetaSync Backend URL</CardTitle>
          <CardDescription>The base URL of the MetaSync backend for this tenant</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder="https://metasync.example.com"
            />
            <Button
              onClick={() => urlMutation.mutate(backendUrl)}
              disabled={urlMutation.isPending || !backendUrl}
            >
              {urlMutation.isPending ? "Saving..." : "Save & Validate"}
            </Button>
          </div>
          {healthStatus !== "unknown" && (
            <div>
              {healthStatus === "checking" ? (
                <Badge variant="outline">Checking...</Badge>
              ) : healthStatus === "connected" ? (
                <Badge variant="secondary">Connected</Badge>
              ) : (
                <Badge variant="destructive">Unreachable</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Admin API Key</CardTitle>
          <CardDescription>
            The MetaSync admin API key is stored securely in Vault and never displayed after saving.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Enter admin API key"
            />
            <Button
              onClick={() => keyMutation.mutate(adminKey)}
              disabled={keyMutation.isPending || !adminKey}
            >
              {keyMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
          <div>
            {keyStatus === "checking" ? (
              <Badge variant="outline">Checking...</Badge>
            ) : keyStatus === "configured" ? (
              <Badge variant="secondary">Configured</Badge>
            ) : (
              <Badge variant="outline">Not configured</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
