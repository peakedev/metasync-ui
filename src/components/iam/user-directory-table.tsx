"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { IAMMember } from "@/types/iam";

interface UserDirectoryTableProps {
  items: IAMMember[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function UserDirectoryTable({
  items,
  total,
  page,
  pageSize,
  onPageChange,
}: UserDirectoryTableProps) {
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Tenant</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((member) => (
            <TableRow key={`${member.userId}-${member.tenantId}`}>
              <TableCell>
                <Link
                  href={`/owner/iam/users/${member.userId}`}
                  className="text-primary hover:underline font-medium"
                >
                  {member.email}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={member.role === "tenant_admin" ? "default" : "secondary"}>
                  {member.role === "tenant_admin" ? "Admin" : "User"}
                </Badge>
              </TableCell>
              <TableCell>{member.tenantName}</TableCell>
              <TableCell>
                {member.clientName ? (
                  member.clientName
                ) : (
                  <Badge variant="outline">Unassigned</Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(member.membershipCreatedAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No users found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
