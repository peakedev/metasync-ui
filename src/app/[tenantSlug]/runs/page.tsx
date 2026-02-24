"use client";

import { useParams, useRouter } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { Plus, RefreshCw } from "lucide-react";

interface Run { _id: string; status: string; currentIteration: number; maxIterations: number; createdAt: string; }

const statusColors: Record<string, "secondary" | "destructive" | "outline"> = { RUNNING: "secondary", COMPLETED: "secondary", FAILED: "destructive", CANCELLED: "destructive", PENDING: "outline", PAUSED: "outline" };

export default function RunsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const router = useRouter();
  const { data: runs, isPending, error, refetch, isRefetching } = useMetaSyncProxy<Run[]>({ path: "/runs", tenantSlug });

  if (error) return <div className="space-y-6"><h1 className="text-2xl font-semibold">Runs</h1><MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Runs</h1>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <Button onClick={() => router.push(`/${tenantSlug}/runs/new`)}><Plus className="mr-2 h-4 w-4" />New Run</Button>
      </div>
      {isPending ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(runs || []).map(run => (
              <TableRow key={run._id} className="cursor-pointer" onClick={() => router.push(`/${tenantSlug}/runs/${run._id}`)}>
                <TableCell className="font-mono text-sm">{run._id.substring(0, 8)}...</TableCell>
                <TableCell><Badge variant={statusColors[run.status] || "outline"}>{run.status}</Badge></TableCell>
                <TableCell>{run.currentIteration}/{run.maxIterations}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(run.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
            {(!runs || runs.length === 0) && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No runs yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
