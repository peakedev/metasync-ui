"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

  const [backendUrlDraft, setBackendUrlDraft] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");

  const backendUrl = backendUrlDraft ?? tenant?.backend_url ?? "";

  const { data: healthData, isFetching: isHealthChecking } = useQuery({
    queryKey: ["config", "health", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("proxy", {
        body: { action: "check_health", tenantId: tenant!.id },
      });
      if (error) return { reachable: false };
      return data as { reachable: boolean };
    },
    enabled: !!tenant?.backend_url,
    retry: false,
  });

  const { data: keyData, isFetching: isKeyChecking } = useQuery({
    queryKey: ["config", "admin_key", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("proxy", {
        body: { action: "check_admin_key", tenantId: tenant!.id },
      });
      if (error) return { exists: false };
      return data as { exists: boolean };
    },
    enabled: !!tenant,
    retry: false,
  });

  const healthStatus = !tenant?.backend_url
    ? "unknown"
    : isHealthChecking
      ? "checking"
      : healthData?.reachable
        ? "connected"
        : healthData
          ? "unreachable"
          : "unknown";

  const keyStatus = !tenant
    ? "unknown"
    : isKeyChecking
      ? "checking"
      : keyData?.exists
        ? "configured"
        : keyData
          ? "not_configured"
          : "unknown";

  const urlMutation = useMutation({
    mutationFn: async (url: string) => {
      const { error } = await supabase
        .from("tenants")
        .update({ backend_url: url })
        .eq("id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setBackendUrlDraft(null);
      queryClient.invalidateQueries({ queryKey: ["tenant", tenantSlug] });
      queryClient.invalidateQueries({ queryKey: ["config", "health", tenant!.id] });
      toast.success("Backend URL saved");
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
      queryClient.invalidateQueries({ queryKey: ["config", "admin_key", tenant!.id] });
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
              onChange={(e) => setBackendUrlDraft(e.target.value)}
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
