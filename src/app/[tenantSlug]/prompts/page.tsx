"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Prompt {
  promptId: string;
  name: string;
  type: string;
  status: string;
  version: number;
  prompt: string;
  owner?: string;
  createdAt?: string;
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["ARCHIVE"],
  ARCHIVE: [],
};

export default function PromptsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [filters, setFilters] = useState({ name: "", status: "", type: "" });

  // Modal state: null = closed, "new" = create, string = edit promptId
  const [modalPromptId, setModalPromptId] = useState<string | null>(null);
  const isNew = modalPromptId === "new";
  const isOpen = modalPromptId !== null;

  const [form, setForm] = useState({ name: "", type: "system", prompt: "", status: "DRAFT" });

  const queryParams: Record<string, string> = {};
  if (filters.name) queryParams.name = filters.name;
  if (filters.status) queryParams.status = filters.status;
  if (filters.type) queryParams.type = filters.type;

  const { data: prompts, isPending, error, refetch, isRefetching } = useMetaSyncProxy<Prompt[]>({
    path: "/prompts",
    queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    tenantSlug,
  });

  const { data: promptDetail, isPending: detailPending, error: detailError } = useMetaSyncProxy<Prompt>({
    path: modalPromptId && !isNew ? `/prompts/${modalPromptId}` : "",
    tenantSlug,
    enabled: !!modalPromptId && !isNew,
  });

  // Populate form when detail loads
  useEffect(() => {
    if (promptDetail && !isNew) {
      setForm({
        name: promptDetail.name,
        type: promptDetail.type,
        prompt: promptDetail.prompt,
        status: promptDetail.status,
      });
    }
  }, [promptDetail, isNew]);

  // Reset form when opening for new
  useEffect(() => {
    if (isNew) {
      setForm({ name: "", type: "system", prompt: "", status: "DRAFT" });
    }
  }, [isNew]);

  const saveMutation = useMetaSyncMutation<Record<string, unknown>, Prompt>({
    path: isNew ? "/prompts" : `/prompts/${modalPromptId}`,
    method: isNew ? "POST" : "PATCH",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, "/prompts"]],
  });

  const deleteMutation = useMetaSyncMutation<Record<string, never>, void>({
    path: `/prompts/${modalPromptId}`,
    method: "DELETE",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, "/prompts"]],
  });

  function handleSave() {
    saveMutation.mutate(form, {
      onSuccess: (data) => {
        toast.success(isNew ? "Prompt created" : "Prompt updated");
        if (isNew) {
          setModalPromptId(data.promptId);
        }
      },
    });
  }

  function handleClose() {
    setModalPromptId(null);
    setForm({ name: "", type: "system", prompt: "", status: "DRAFT" });
  }

  const validTransitions = !isNew && promptDetail
    ? STATUS_TRANSITIONS[promptDetail.status] || []
    : ["DRAFT"];

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Prompts</h1>
        <MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Prompts</h1>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <Button onClick={() => setModalPromptId("new")}>
          <Plus className="mr-2 h-4 w-4" />
          New Prompt
        </Button>
      </div>

      <div className="flex gap-4">
        <Input
          placeholder="Filter by name..."
          value={filters.name}
          onChange={(e) => setFilters({ ...filters, name: e.target.value })}
          className="max-w-xs"
        />
        <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? "" : v })}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="PUBLISHED">Published</SelectItem>
            <SelectItem value="ARCHIVE">Archive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(prompts || []).map((prompt) => (
              <TableRow
                key={prompt.promptId}
                className="cursor-pointer"
                onClick={() => setModalPromptId(prompt.promptId)}
              >
                <TableCell className="font-medium">{prompt.name}</TableCell>
                <TableCell><Badge variant="outline">{prompt.type}</Badge></TableCell>
                <TableCell>
                  <Badge variant={prompt.status === "PUBLISHED" ? "secondary" : "outline"}>
                    {prompt.status}
                  </Badge>
                </TableCell>
                <TableCell>v{prompt.version}</TableCell>
                <TableCell className="text-muted-foreground">
                  {prompt.createdAt ? new Date(prompt.createdAt).toLocaleDateString() : "-"}
                </TableCell>
              </TableRow>
            ))}
            {(!prompts || prompts.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No prompts yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      {/* Prompt Editor Modal */}
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
          {!isNew && detailPending ? (
            <div className="p-6 space-y-4">
              <DialogTitle className="sr-only">Loading prompt</DialogTitle>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-40" />
            </div>
          ) : !isNew && detailError ? (
            <div className="p-6">
              <DialogTitle className="sr-only">Error loading prompt</DialogTitle>
              <MetaSyncError error={(detailError as Error).message} tenantSlug={tenantSlug} />
            </div>
          ) : (
            <>
              <DialogHeader className="px-6 pt-6 pb-0">
                <div className="flex items-center justify-between gap-4 pr-8">
                  <div>
                    <DialogTitle>{isNew ? "New Prompt" : form.name}</DialogTitle>
                    <DialogDescription>
                      {isNew ? "Create a new prompt" : `Edit prompt`}
                    </DialogDescription>
                  </div>
                  {!isNew && promptDetail && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline">v{promptDetail.version}</Badge>
                      <Badge variant={promptDetail.status === "PUBLISHED" ? "secondary" : "outline"}>
                        {promptDetail.status}
                      </Badge>
                    </div>
                  )}
                </div>
              </DialogHeader>

              <div className="flex-1 min-h-0 overflow-auto px-6 pt-4 pb-2 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={form.status}>{form.status}</SelectItem>
                        {validTransitions.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2 flex flex-col flex-1 min-h-0">
                  <Label>Prompt Content</Label>
                  <Textarea
                    value={form.prompt}
                    onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                    rows={14}
                    className="font-mono text-sm flex-1 min-h-[200px]"
                  />
                </div>
              </div>

              <DialogFooter className="px-6 pb-6 pt-2">
                {!isNew && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="mr-auto"
                    onClick={() => {
                      if (confirm("Delete this prompt?")) {
                        deleteMutation.mutate({} as Record<string, never>, {
                          onSuccess: () => {
                            toast.success("Prompt deleted");
                            handleClose();
                          },
                        });
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                )}
                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
