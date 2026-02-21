export interface IAMMember {
  userId: string;
  email: string;
  role: "tenant_admin" | "tenant_user";
  tenantId: string;
  tenantName: string;
  clientId: string | null;
  clientName: string | null;
  membershipCreatedAt: string;
}

export interface MembershipDetail {
  id: string;
  tenantId: string;
  tenantName: string;
  role: "tenant_admin" | "tenant_user";
  clientId: string | null;
  clientName: string | null;
  createdAt: string;
}

export interface InvitationDetail {
  id: string;
  tenantId: string;
  tenantName: string;
  role: "tenant_admin" | "tenant_user";
  clientId: string | null;
  clientName: string | null;
  status: "pending" | "accepted" | "expired";
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  invitedBy: string;
  email: string;
}

export interface IAMAuthUser {
  id: string;
  email: string;
  provider: string;
  createdAt: string;
}

export interface UserDetailResponse {
  user: IAMAuthUser;
  memberships: MembershipDetail[];
  invitations: InvitationDetail[];
}

export interface IAMUsersResponse {
  items: IAMMember[];
  total: number;
}

export interface OwnersResponse {
  owners: IAMAuthUser[];
}

export interface IAMUsersFilters {
  tenantId?: string;
  role?: "tenant_admin" | "tenant_user";
  assigned?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface IAMInvitationsFilters {
  tenantId?: string;
  role?: "tenant_admin" | "tenant_user";
}
