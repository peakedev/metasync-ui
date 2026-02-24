"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { GripVertical, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Prompt {
  _id: string;
  name: string;
  prompt: string;
  status: string;
}

interface FlowDetail {
  _id: string;
  name: string;
  prompts: string[];
}

export default function FlowBuilderPage() {
  const { tenantSlug, id } = useParams<{ tenantSlug: string; id: string }>();
  const router = useRouter();
  const isNew = id === "new";
  const [name, setName] = useState("");
  const [selectedPromptIds, setSelectedPromptIds] = useState<string[]>([]);
  const [formInit, setFormInit] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const { data: flow, isPending: flowPending, error: flowError } = useMetaSyncProxy<FlowDetail>({
    path: `/prompt-flows/${id}`,
    tenantSlug,
    enabled: !isNew,
  });

  const { data: availablePrompts } = useMetaSyncProxy<Prompt[]>({
    path: "/prompts",
    tenantSlug,
  });

  if (flow && !formInit) {
    setName(flow.name);
    setSelectedPromptIds(flow.prompts);
    setFormInit(true);
  }

  const saveMutation = useMetaSyncMutation<Record<string, unknown>, FlowDetail>({
    path: isNew ? "/prompt-flows" : `/prompt-flows/${id}`,
    method: isNew ? "POST" : "PATCH",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, "/prompt-flows"]],
  });

  const deleteMutation = useMetaSyncMutation<Record<string, never>, void>({
    path: `/prompt-flows/${id}`,
    method: "DELETE",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, "/prompt-flows"]],
  });

  function handleSave() {
    saveMutation.mutate({ name, prompts: selectedPromptIds }, {
      onSuccess: (data) => {
        toast.success(isNew ? "Flow created" : "Flow updated");
        if (isNew && data._id) router.replace(`/${tenantSlug}/prompt-flows/${data._id}`);
      },
    });
  }

  function addPrompt(promptId: string) {
    if (!selectedPromptIds.includes(promptId)) {
      setSelectedPromptIds([...selectedPromptIds, promptId]);
    }
  }

  function removePrompt(index: number) {
    setSelectedPromptIds(selectedPromptIds.filter((_, i) => i !== index));
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const items = [...selectedPromptIds];
    const [removed] = items.splice(dragIndex, 1);
    items.splice(index, 0, removed);
    setSelectedPromptIds(items);
    setDragIndex(index);
  }

  function handleDragEnd() {
    setDragIndex(null);
  }

  const promptMap = new Map((availablePrompts || []).map((p) => [p._id, p]));

  if (!isNew && flowPending) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (!isNew && flowError) return <div className="space-y-6"><h1 className="text-2xl font-semibold">Flow</h1><MetaSyncError error={(flowError as Error).message} tenantSlug={tenantSlug} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{isNew ? "New Prompt Flow" : name}</h1>
        {!isNew && (
          <Button variant="destructive" size="sm" onClick={() => {
            if (confirm("Delete this flow?")) {
              deleteMutation.mutate({} as Record<string, never>, {
                onSuccess: () => router.push(`/${tenantSlug}/prompt-flows`),
              });
            }
          }}>
            <Trash2 className="mr-2 h-4 w-4" />Delete
          </Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Flow Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Flow Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Prompt Order (drag to reorder)</Label>
            <div className="space-y-2">
              {selectedPromptIds.map((pid, index) => {
                const prompt = promptMap.get(pid);
                return (
                  <div
                    key={`${pid}-${index}`}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className="flex items-center gap-2 rounded border p-3 bg-card cursor-move"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 text-sm">{prompt?.name || pid}</span>
                    {prompt && (
                      <span className="text-xs text-muted-foreground truncate max-w-xs">{prompt.prompt?.substring(0, 60)}...</span>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => removePrompt(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Add Prompt</Label>
            <div className="flex flex-wrap gap-2">
              {(availablePrompts || [])
                .filter((p) => !selectedPromptIds.includes(p._id))
                .map((p) => (
                  <Button key={p._id} size="sm" variant="outline" onClick={() => addPrompt(p._id)}>
                    + {p.name}
                  </Button>
                ))}
            </div>
          </div>

          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save Flow"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
