"use client";

import { useParams, useRouter } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { Plus } from "lucide-react";

interface StreamSession { _id: string; streamId: string; model: string; status: string; totalTokens?: number; createdAt: string; }

export default function StreamsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const router = useRouter();
  const { data: streams, isLoading, error } = useMetaSyncProxy<StreamSession[]>({ path: "/stream", tenantSlug });

  if (error) return <div className="space-y-6"><h1 className="text-2xl font-semibold">Streams</h1><MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Streams</h1>
        <Button onClick={() => router.push(`/${tenantSlug}/streams/new`)}><Plus className="mr-2 h-4 w-4" />New Chat</Button>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stream ID</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(streams || []).map(s => (
              <TableRow key={s._id} className="cursor-pointer" onClick={() => router.push(`/${tenantSlug}/streams/${s._id}`)}>
                <TableCell className="font-mono text-sm">{s.streamId || s._id}</TableCell>
                <TableCell>{s.model}</TableCell>
                <TableCell><Badge variant={s.status === "COMPLETED" ? "secondary" : s.status === "ERROR" ? "destructive" : "outline"}>{s.status}</Badge></TableCell>
                <TableCell>{s.totalTokens || "-"}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
            {(!streams || streams.length === 0) && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No streams yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
