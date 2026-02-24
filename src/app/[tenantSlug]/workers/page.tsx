"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { Plus, Play, Square, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Worker { _id: string; workerId: string; status: string; config?: { pollInterval?: number; maxItemsPerBatch?: number }; createdAt: string; }

const statusColors: Record<string, "secondary" | "destructive" | "outline"> = { RUNNING: "secondary", ERROR: "destructive", STOPPED: "outline" };

export default function WorkersPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [newWorker, setNewWorker] = useState({ workerId: "", pollInterval: "5000", maxItemsPerBatch: "10" });

  const { data: workers, isPending, error, refetch, isRefetching } = useMetaSyncProxy<Worker[]>({ path: "/workers", tenantSlug });

  const createMutation = useMetaSyncMutation<Record<string, unknown>, Worker>({
    path: "/workers", method: "POST", tenantSlug, invalidateKeys: [["metasync", tenantSlug, "/workers"]],
  });
  const startMutation = useMetaSyncMutation<Record<string, never>, void>({ path: "", method: "POST", tenantSlug, invalidateKeys: [["metasync", tenantSlug, "/workers"]] });
  const stopMutation = useMetaSyncMutation<Record<string, never>, void>({ path: "", method: "POST", tenantSlug, invalidateKeys: [["metasync", tenantSlug, "/workers"]] });

  function toggleSelect(id: string) { const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); setSelected(next); }

  if (error) return <div className="space-y-6"><h1 className="text-2xl font-semibold">Workers</h1><MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Workers</h1>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />New Worker</Button>
      </div>

      {selected.size > 0 && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { Array.from(selected).forEach(id => { const w = workers?.find(w => w._id === id); if (w?.status === "STOPPED") startMutation.mutate({} as never); }); toast.success("Starting workers"); }}>
            <Play className="mr-1 h-3 w-3" />Bulk Start ({selected.size})
          </Button>
          <Button size="sm" variant="outline" onClick={() => { toast.success("Stopping workers"); }}>
            <Square className="mr-1 h-3 w-3" />Bulk Stop ({selected.size})
          </Button>
        </div>
      )}

      {isPending ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><Checkbox /></TableHead>
              <TableHead>Worker ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Poll Interval</TableHead>
              <TableHead>Batch Size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(workers || []).map(w => (
              <TableRow key={w._id}>
                <TableCell><Checkbox checked={selected.has(w._id)} onCheckedChange={() => toggleSelect(w._id)} /></TableCell>
                <TableCell className="font-medium cursor-pointer" onClick={() => router.push(`/${tenantSlug}/workers/${w._id}`)}>{w.workerId}</TableCell>
                <TableCell><Badge variant={statusColors[w.status] || "outline"}>{w.status}</Badge></TableCell>
                <TableCell>{w.config?.pollInterval || "-"}ms</TableCell>
                <TableCell>{w.config?.maxItemsPerBatch || "-"}</TableCell>
              </TableRow>
            ))}
            {(!workers || workers.length === 0) && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No workers yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate({ workerId: newWorker.workerId, config: { pollInterval: parseInt(newWorker.pollInterval), maxItemsPerBatch: parseInt(newWorker.maxItemsPerBatch) } }, { onSuccess: () => { setCreateOpen(false); toast.success("Worker created"); } }); }}>
            <DialogHeader><DialogTitle>Create Worker</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Worker ID</Label><Input value={newWorker.workerId} onChange={e => setNewWorker({...newWorker, workerId: e.target.value})} required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Poll Interval (ms)</Label><Input type="number" value={newWorker.pollInterval} onChange={e => setNewWorker({...newWorker, pollInterval: e.target.value})} /></div>
                <div className="space-y-2"><Label>Max Batch Size</Label><Input type="number" value={newWorker.maxItemsPerBatch} onChange={e => setNewWorker({...newWorker, maxItemsPerBatch: e.target.value})} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
