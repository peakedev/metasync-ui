"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, Trash2 } from "lucide-react";

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const { data: tenant, isLoading: tenantLoading } = useQuery({
    queryKey: ["tenant", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: admins = [], isLoading: adminsLoading } = useQuery({
    queryKey: ["tenant-admins", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select("*, user:user_id(email:raw_user_meta_data->email)")
        .eq("tenant_id", id)
        .eq("role", "tenant_admin");
      if (error) throw error;
      return data;
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await supabase.functions.invoke("invite", {
        body: { email, role: "tenant_admin", tenantId: id },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: () => {
      setInviteOpen(false);
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["tenant-admins", id] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("tenant_memberships")
        .delete()
        .eq("user_id", userId)
        .eq("tenant_id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenant-admins", id] }),
  });

  if (tenantLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!tenant) {
    return <div className="text-muted-foreground">Tenant not found</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{tenant.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Configuration Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">MetaSync Backend URL</span>
            {tenant.backend_url ? (
              <Badge variant="secondary">Configured</Badge>
            ) : (
              <Badge variant="outline">Not configured</Badge>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Admin API Key</span>
            <Badge variant="outline">Check in tenant config</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Tenant Admins</CardTitle>
            <CardDescription>Manage administrators for this tenant</CardDescription>
          </div>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Admin
          </Button>
        </CardHeader>
        <CardContent>
          {adminsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin: any) => (
                  <TableRow key={admin.id}>
                    <TableCell>{(admin as any).user?.email || admin.user_id}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(admin.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Remove this admin?")) {
                            removeMutation.mutate(admin.user_id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {admins.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                      No admins assigned yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              inviteMutation.mutate(inviteEmail);
            }}
          >
            <DialogHeader>
              <DialogTitle>Invite Tenant Admin</DialogTitle>
              <DialogDescription>
                Send an invitation email to a new admin for {tenant.name}.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="inviteEmail">Email address</Label>
              <Input
                id="inviteEmail"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
