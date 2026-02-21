"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Job {
  _id: string;
  status: string;
  operation: string;
  model: string;
  priority: number;
  clientReference?: string;
  createdAt: string;
}

const JOB_STATUSES = ["PENDING", "PROCESSING", "PROCESSED", "CONSUMED", "ERROR", "ERROR_CONSUMING", "CANCELED"];

const statusColors: Record<string, string> = {
  PENDING: "outline",
  PROCESSING: "secondary",
  PROCESSED: "secondary",
  CONSUMED: "secondary",
  ERROR: "destructive",
  ERROR_CONSUMING: "destructive",
  CANCELED: "outline",
};

export default function JobsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchAction, setBatchAction] = useState<"delete" | "update" | null>(null);
  const [batchStatus, setBatchStatus] = useState("");

  const queryParams: Record<string, string> = {};
  if (statusFilter) queryParams.status = statusFilter;

  const { data: jobs, isLoading, error } = useMetaSyncProxy<Job[]>({
    path: "/jobs",
    queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    tenantSlug,
  });

  const { data: summary } = useMetaSyncProxy<Record<string, number>>({
    path: "/jobs/summary",
    tenantSlug,
  });

  const batchDeleteMutation = useMetaSyncMutation<{ ids: string[] }, void>({
    path: "/jobs/batch",
    method: "DELETE",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, "/jobs"], ["metasync", tenantSlug, "/jobs/summary"]],
  });

  const batchUpdateMutation = useMetaSyncMutation<{ ids: string[]; status: string }, void>({
    path: "/jobs/batch",
    method: "PATCH",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, "/jobs"], ["metasync", tenantSlug, "/jobs/summary"]],
  });

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (!jobs) return;
    if (selected.size === jobs.length) setSelected(new Set());
    else setSelected(new Set(jobs.map((j) => j._id)));
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <Button onClick={() => router.push(`/${tenantSlug}/jobs/new`)}>
          <Plus className="mr-2 h-4 w-4" />
          New Job
        </Button>
      </div>

      {summary && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(summary).map(([status, count]) => (
            <Badge key={status} variant="outline" className="cursor-pointer" onClick={() => setStatusFilter(status)}>
              {status}: {count}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-4 items-center">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {JOB_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        {selected.size > 0 && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setBatchAction("update")}>
              Batch Update ({selected.size})
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setBatchAction("delete")}>
              <Trash2 className="mr-1 h-3 w-3" />
              Batch Delete ({selected.size})
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={jobs?.length ? selected.size === jobs.length : false} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Operation</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(jobs || []).map((job) => (
              <TableRow key={job._id}>
                <TableCell>
                  <Checkbox checked={selected.has(job._id)} onCheckedChange={() => toggleSelect(job._id)} />
                </TableCell>
                <TableCell className="cursor-pointer" onClick={() => router.push(`/${tenantSlug}/jobs/${job._id}`)}>
                  <Badge variant={(statusColors[job.status] as any) || "outline"}>{job.status}</Badge>
                </TableCell>
                <TableCell>{job.operation}</TableCell>
                <TableCell>{job.model}</TableCell>
                <TableCell>{job.priority}</TableCell>
                <TableCell className="text-muted-foreground">{job.clientReference || "-"}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(job.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
            {(!jobs || jobs.length === 0) && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No jobs found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={batchAction === "delete"} onOpenChange={() => setBatchAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batch Delete</DialogTitle>
            <DialogDescription>Delete {selected.size} selected jobs? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchAction(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              batchDeleteMutation.mutate({ ids: Array.from(selected) }, {
                onSuccess: () => { setBatchAction(null); setSelected(new Set()); toast.success("Jobs deleted"); },
              });
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchAction === "update"} onOpenChange={() => setBatchAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batch Update Status</DialogTitle>
            <DialogDescription>Update status of {selected.size} selected jobs.</DialogDescription>
          </DialogHeader>
          <Select value={batchStatus} onValueChange={setBatchStatus}>
            <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
            <SelectContent>
              {JOB_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchAction(null)}>Cancel</Button>
            <Button onClick={() => {
              batchUpdateMutation.mutate({ ids: Array.from(selected), status: batchStatus }, {
                onSuccess: () => { setBatchAction(null); setSelected(new Set()); toast.success("Jobs updated"); },
              });
            }} disabled={!batchStatus}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
