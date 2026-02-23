"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo } from "react";
import { useIAMUsers } from "@/hooks/iam/use-iam-users";
import { UserDirectoryFilters } from "@/components/iam/user-directory-filters";
import { UserDirectoryTable } from "@/components/iam/user-directory-table";
import { CreateUserDialog } from "@/components/iam/create-user-dialog";
import type { IAMUsersFilters } from "@/types/iam";

export default function UsersPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UsersPageContent />
    </Suspense>
  );
}

function UsersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters: IAMUsersFilters = useMemo(() => ({
    tenantId: searchParams.get("tenantId") || undefined,
    role: (searchParams.get("role") as IAMUsersFilters["role"]) || undefined,
    assigned: searchParams.get("assigned") !== null
      ? searchParams.get("assigned") === "true"
      : undefined,
    search: searchParams.get("search") || undefined,
    page: parseInt(searchParams.get("page") || "0", 10),
    pageSize: 100,
  }), [searchParams]);

  const { data, isLoading } = useIAMUsers(filters);

  const updateFilters = useCallback(
    (updates: Partial<IAMUsersFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { ...filters, ...updates };

      if (merged.tenantId) params.set("tenantId", merged.tenantId);
      else params.delete("tenantId");

      if (merged.role) params.set("role", merged.role);
      else params.delete("role");

      if (merged.assigned !== undefined) params.set("assigned", String(merged.assigned));
      else params.delete("assigned");

      if (merged.search) params.set("search", merged.search);
      else params.delete("search");

      if (merged.page && merged.page > 0) params.set("page", String(merged.page));
      else params.delete("page");

      router.push(`/owner/iam/users?${params.toString()}`);
    },
    [router, searchParams, filters]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <CreateUserDialog />
      </div>
      <UserDirectoryFilters
        filters={filters}
        onFilterChange={updateFilters}
      />
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <UserDirectoryTable
          items={data?.items || []}
          total={data?.total || 0}
          page={filters.page || 0}
          pageSize={filters.pageSize || 100}
          onPageChange={(p) => updateFilters({ page: p })}
        />
      )}
    </div>
  );
}
