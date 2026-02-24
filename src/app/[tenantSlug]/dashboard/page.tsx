"use client";

import { useParams } from "next/navigation";
import { useTenant } from "@/hooks/use-tenant";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useSession } from "@/hooks/use-session";
import { useClientContext } from "@/contexts/client-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Briefcase, HardDrive, MessageSquare, Play, Cpu, Key } from "lucide-react";

interface SummaryData {
  [key: string]: number;
}

function SummaryCard({
  title,
  icon,
  href,
  data,
  isLoading,
  error,
}: {
  title: string;
  icon: React.ReactNode;
  href: string;
  data?: SummaryData;
  isLoading: boolean;
  error?: Error | null;
}) {
  const total = data
    ? "total" in data
      ? data.total
      : Object.values(data).reduce((a, b) => (typeof b === "number" ? a + b : a), 0)
    : 0;

  return (
    <Link href={href}>
      <Card className="hover:bg-accent/50 transition-colors">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {icon}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-16" />
          ) : error ? (
            <div className="text-sm text-destructive">Unavailable</div>
          ) : (
            <div className="text-2xl font-bold">{total}</div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { data: tenant, isLoading: tenantLoading } = useTenant(tenantSlug);
  const { claims } = useSession();
  const { selectedClientId, availableClients } = useClientContext();
  const isAdmin = claims.user_role === "tenant_admin" || claims.user_role === "owner";

  const { data: jobSummary, isPending: jobsLoading, error: jobsError } = useMetaSyncProxy<SummaryData>({
    path: "/jobs/summary",
    tenantSlug,
    enabled: !!tenant,
  });

  const { data: workerSummary, isPending: workersLoading, error: workersError } = useMetaSyncProxy<SummaryData>({
    path: "/workers/summary",
    tenantSlug,
    enabled: !!tenant,
  });

  const { data: streamSummary, isPending: streamsLoading, error: streamsError } = useMetaSyncProxy<SummaryData>({
    path: "/stream/summary",
    tenantSlug,
    enabled: !!tenant,
  });

  const { data: models, isPending: modelsLoading, error: modelsError } = useMetaSyncProxy<unknown[]>({
    path: "/models",
    tenantSlug,
    enabled: !!tenant && isAdmin,
  });

  const { data: clients, isPending: clientsLoading, error: clientsError } = useMetaSyncProxy<unknown[]>({
    path: "/clients",
    tenantSlug,
    enabled: !!tenant && isAdmin,
  });

  if (tenantLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!tenant) {
    return <div className="text-muted-foreground">Tenant not found</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {claims.user_role === "tenant_user" && availableClients.length === 0 && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          You are not assigned to any client yet. Contact your tenant admin to get access to MetaSync operations.
        </div>
      )}

      {claims.user_role === "tenant_user" && availableClients.length > 0 && !selectedClientId && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          You have access to {availableClients.length} client{availableClients.length > 1 ? "s" : ""}. Select a client from the sidebar to start working.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          title="Jobs"
          icon={<Briefcase className="h-4 w-4 text-muted-foreground" />}
          href={`/${tenantSlug}/jobs`}
          data={jobSummary ?? undefined}
          isLoading={jobsLoading}
          error={jobsError as Error | null}
        />
        <SummaryCard
          title="Workers"
          icon={<HardDrive className="h-4 w-4 text-muted-foreground" />}
          href={`/${tenantSlug}/workers`}
          data={workerSummary ?? undefined}
          isLoading={workersLoading}
          error={workersError as Error | null}
        />
        <SummaryCard
          title="Streams"
          icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
          href={`/${tenantSlug}/streams`}
          data={streamSummary ?? undefined}
          isLoading={streamsLoading}
          error={streamsError as Error | null}
        />
        <SummaryCard
          title="Runs"
          icon={<Play className="h-4 w-4 text-muted-foreground" />}
          href={`/${tenantSlug}/runs`}
          data={undefined}
          isLoading={false}
        />
        {isAdmin && (
          <>
            <SummaryCard
              title="Models"
              icon={<Cpu className="h-4 w-4 text-muted-foreground" />}
              href={`/${tenantSlug}/models`}
              data={models ? { total: models.length } : undefined}
              isLoading={modelsLoading}
              error={modelsError as Error | null}
            />
            <SummaryCard
              title="Clients"
              icon={<Key className="h-4 w-4 text-muted-foreground" />}
              href={`/${tenantSlug}/clients`}
              data={clients ? { total: clients.length } : undefined}
              isLoading={clientsLoading}
              error={clientsError as Error | null}
            />
          </>
        )}
      </div>
    </div>
  );
}
