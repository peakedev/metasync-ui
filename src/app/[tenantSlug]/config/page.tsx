"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [healthStatus, setHealthStatus] = useState<"unknown" | "connected" | "unreachable">("unknown");
  const [adminKey, setAdminKey] = useState("");
  const [keyStatus, setKeyStatus] = useState<"unknown" | "configured" | "not_configured">("unknown");

  // Initialize form with tenant data
  if (tenant && !urlInitialized) {
    setBackendUrl(tenant.backend_url || "");
    setUrlInitialized(true);
    setKeyStatus(tenant.backend_url ? "unknown" : "not_configured");
  }

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
      // Validate by calling health
      try {
        const response = await supabase.functions.invoke("proxy", {
          body: {
            tenantId: tenant!.id,
            path: "/health",
            method: "GET",
          },
        });
        setHealthStatus(response.error ? "unreachable" : "connected");
      } catch {
        setHealthStatus("unreachable");
      }
      toast.success("Backend URL saved");
    },
  });

  const keyMutation = useMutation({
    mutationFn: async (key: string) => {
      const response = await supabase.functions.invoke("proxy", {
        body: {
          action: "store_admin_key",
          tenantId: tenant!.id,
          key,
        },
      });
      if (response.error) throw new Error(response.error.message);
    },
    onSuccess: () => {
      setAdminKey("");
      setKeyStatus("configured");
      toast.success("Admin API key saved");
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
              {healthStatus === "connected" ? (
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
            {keyStatus === "configured" ? (
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
