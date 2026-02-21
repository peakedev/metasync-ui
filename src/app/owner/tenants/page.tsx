"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, RotateCcw } from "lucide-react";
import type { Tables } from "@/types/supabase";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function TenantsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tables<"tenants"> | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, slug }: { name: string; slug: string }) => {
      const { data, error } = await supabase
        .from("tenants")
        .insert({ name, slug })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      resetForm();
    },
    onError: (err) => {
      if (err.message.includes("duplicate")) {
        setSlugError("This slug is already in use");
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("tenants").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      resetForm();
    },
  });

  const toggleDeleteMutation = useMutation({
    mutationFn: async ({ id, is_deleted }: { id: string; is_deleted: boolean }) => {
      const { error } = await supabase.from("tenants").update({ is_deleted }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenants"] }),
  });

  function resetForm() {
    setDialogOpen(false);
    setEditingTenant(null);
    setName("");
    setSlug("");
    setSlugError(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(tenant: Tables<"tenants">) {
    setEditingTenant(tenant);
    setName(tenant.name);
    setSlug(tenant.slug);
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSlugError(null);
    if (editingTenant) {
      updateMutation.mutate({ id: editingTenant.id, name });
    } else {
      createMutation.mutate({ name, slug });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tenants</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New Tenant
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingTenant ? "Edit Tenant" : "Create Tenant"}</DialogTitle>
                <DialogDescription>
                  {editingTenant ? "Update the tenant name." : "Create a new tenant for the platform."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!editingTenant) setSlug(slugify(e.target.value));
                    }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => {
                      if (!editingTenant) {
                        setSlug(slugify(e.target.value));
                        setSlugError(null);
                      }
                    }}
                    disabled={!!editingTenant}
                    required
                  />
                  {slugError && <p className="text-sm text-destructive">{slugError}</p>}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingTenant ? "Save" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Backend</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((tenant) => (
              <TableRow key={tenant.id} className={tenant.is_deleted ? "opacity-50" : ""}>
                <TableCell className="font-medium">{tenant.name}</TableCell>
                <TableCell className="text-muted-foreground">{tenant.slug}</TableCell>
                <TableCell>
                  {tenant.backend_url ? (
                    <Badge variant="secondary">Configured</Badge>
                  ) : (
                    <Badge variant="outline">Not configured</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {tenant.is_deleted ? (
                    <Badge variant="destructive">Disabled</Badge>
                  ) : (
                    <Badge variant="secondary">Active</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(tenant.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(tenant)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {tenant.is_deleted ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleDeleteMutation.mutate({ id: tenant.id, is_deleted: false })}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Disable this tenant?")) {
                            toggleDeleteMutation.mutate({ id: tenant.id, is_deleted: true });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {tenants.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No tenants yet. Create one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
