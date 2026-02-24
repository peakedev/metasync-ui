"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

interface PromptDetail {
  _id?: string;
  id?: string;
  prompt_id?: string;
  name: string;
  type: string;
  prompt: string;
  status: string;
  version: number;
  owner?: string;
}

function getPromptId(prompt: PromptDetail): string {
  return prompt._id ?? prompt.id ?? prompt.prompt_id ?? prompt.name;
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["ARCHIVE"],
  ARCHIVE: [],
};

export default function PromptEditorPage() {
  const { tenantSlug, id } = useParams<{ tenantSlug: string; id: string }>();
  const router = useRouter();
  const { claims } = useSession();
  const isNew = id === "new";
  const [form, setForm] = useState({ name: "", type: "system", prompt: "", status: "DRAFT" });
  const [formInit, setFormInit] = useState(false);

  const { data: promptData, isPending, error } = useMetaSyncProxy<PromptDetail>({
    path: `/prompts/${id}`,
    tenantSlug,
    enabled: !isNew,
  });

  if (promptData && !formInit) {
    setForm({
      name: promptData.name,
      type: promptData.type,
      prompt: promptData.prompt,
      status: promptData.status,
    });
    setFormInit(true);
  }

  const saveMutation = useMetaSyncMutation<Record<string, unknown>, PromptDetail>({
    path: isNew ? "/prompts" : `/prompts/${id}`,
    method: isNew ? "POST" : "PATCH",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, "/prompts"]],
  });

  const deleteMutation = useMetaSyncMutation<Record<string, never>, void>({
    path: `/prompts/${id}`,
    method: "DELETE",
    tenantSlug,
    invalidateKeys: [["metasync", tenantSlug, "/prompts"]],
  });

  function handleSave() {
    saveMutation.mutate(form, {
      onSuccess: (data) => {
        toast.success(isNew ? "Prompt created" : "Prompt updated");
        if (isNew) router.replace(`/${tenantSlug}/prompts/${getPromptId(data)}`);
      },
    });
  }

  const validTransitions = promptData ? STATUS_TRANSITIONS[promptData.status] || [] : ["DRAFT"];

  if (!isNew && isPending) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (!isNew && error) return <div className="space-y-6"><h1 className="text-2xl font-semibold">Prompt</h1><MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{isNew ? "New Prompt" : form.name}</h1>
        <div className="flex gap-2">
          {!isNew && promptData && (
            <>
              <Badge variant="outline">v{promptData.version}</Badge>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm("Delete this prompt?")) {
                    deleteMutation.mutate({} as Record<string, never>, {
                      onSuccess: () => router.push(`/${tenantSlug}/prompts`),
                    });
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Prompt Editor</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
          <div className="space-y-2">
            <Label>Prompt Content</Label>
            <Textarea
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              rows={12}
              className="font-mono text-sm"
            />
          </div>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
