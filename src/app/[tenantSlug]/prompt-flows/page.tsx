"use client";

import { useParams, useRouter } from "next/navigation";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { MetaSyncError } from "@/components/metasync-error";
import { Plus } from "lucide-react";

interface PromptFlow {
  _id: string;
  name: string;
  prompts: string[];
  owner?: string;
  createdAt: string;
}

export default function PromptFlowsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const router = useRouter();

  const { data: flows, isLoading, error } = useMetaSyncProxy<PromptFlow[]>({
    path: "/prompt-flows",
    tenantSlug,
  });

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Prompt Flows</h1>
        <MetaSyncError error={(error as Error).message} tenantSlug={tenantSlug} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Prompt Flows</h1>
        <Button onClick={() => router.push(`/${tenantSlug}/prompt-flows/new`)}>
          <Plus className="mr-2 h-4 w-4" />
          New Flow
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prompts</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(flows || []).map((flow) => (
              <TableRow key={flow._id} className="cursor-pointer" onClick={() => router.push(`/${tenantSlug}/prompt-flows/${flow._id}`)}>
                <TableCell className="font-medium">{flow.name}</TableCell>
                <TableCell><Badge variant="outline">{flow.prompts.length} prompts</Badge></TableCell>
                <TableCell className="text-muted-foreground">{new Date(flow.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
            {(!flows || flows.length === 0) && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No prompt flows yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
