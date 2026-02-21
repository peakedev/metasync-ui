"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IAMUsersFilters } from "@/types/iam";

interface UserDirectoryFiltersProps {
  filters: IAMUsersFilters;
  onFilterChange: (filters: Partial<IAMUsersFilters>) => void;
}

export function UserDirectoryFilters({ filters, onFilterChange }: UserDirectoryFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search || "");

  const { data: tenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name")
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Debounce search input
  useEffect(() => {
    const timeout = setTimeout(() => {
      onFilterChange({ search: searchInput || undefined, page: 0 });
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="w-64">
        <Input
          placeholder="Search by email..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      <Select
        value={filters.tenantId || "all"}
        onValueChange={(v) => onFilterChange({ tenantId: v === "all" ? undefined : v, page: 0 })}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="All tenants" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All tenants</SelectItem>
          {tenants.map((t) => (
            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.role || "all"}
        onValueChange={(v) =>
          onFilterChange({
            role: v === "all" ? undefined : (v as "tenant_admin" | "tenant_user"),
            page: 0,
          })
        }
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All roles" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All roles</SelectItem>
          <SelectItem value="tenant_admin">Admin</SelectItem>
          <SelectItem value="tenant_user">User</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.assigned === undefined ? "all" : String(filters.assigned)}
        onValueChange={(v) =>
          onFilterChange({
            assigned: v === "all" ? undefined : v === "true",
            page: 0,
          })
        }
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Assignment" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="true">Assigned</SelectItem>
          <SelectItem value="false">Unassigned</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
