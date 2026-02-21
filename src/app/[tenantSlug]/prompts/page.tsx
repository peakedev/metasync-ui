"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { useMetaSyncMutation } from "@/hooks/use-metasync-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { Plus } from "lucide-react";

interface Prompt {
  _id: string;
  name: string;
  type: string;
  status: string;
  version: number;
  owner?: string;
  createdAt: string;
}

export default function PromptsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const router = useRouter();
  const [filters, setFilters] = useState({ name: "", status: "", type: "" });

  const queryParams: Record<string, string> = {};
  if (filters.name) queryParams.name = filters.name;
  if (filters.status) queryParams.status = filters.status;
  if (filters.type) queryParams.type = filters.type;

  const { data: prompts, isLoading, error } = useMetaSyncProxy<Prompt[]>({
    path: "/prompts",
    queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    tenantSlug,
  });

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
        <h1 className="text-2xl font-semibold">Prompts</h1>
        <Button onClick={() => router.push(`/${tenantSlug}/prompts/new`)}>
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

      {isLoading ? (
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
              <TableRow key={prompt._id} className="cursor-pointer" onClick={() => router.push(`/${tenantSlug}/prompts/${prompt._id}`)}>
                <TableCell className="font-medium">{prompt.name}</TableCell>
                <TableCell><Badge variant="outline">{prompt.type}</Badge></TableCell>
                <TableCell>
                  <Badge variant={prompt.status === "PUBLISHED" ? "secondary" : "outline"}>
                    {prompt.status}
                  </Badge>
                </TableCell>
                <TableCell>v{prompt.version}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(prompt.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
            {(!prompts || prompts.length === 0) && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No prompts yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
