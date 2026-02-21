"use client";

import { useSession } from "@/hooks/use-session";
import type { ReactNode } from "react";

interface RoleGuardProps {
  role: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGuard({ role, children, fallback = null }: RoleGuardProps) {
  const { claims, loading } = useSession();

  if (loading) return null;

  const roles = Array.isArray(role) ? role : [role];

  if (!claims.user_role || !roles.includes(claims.user_role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
