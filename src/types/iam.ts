export interface ClientRef {
  clientId: string;
  clientName: string;
}

export interface IAMMember {
  userId: string;
  email: string;
  role: "tenant_admin" | "tenant_user";
  tenantId: string;
  tenantName: string;
  clients: ClientRef[];
  membershipCreatedAt: string;
}

export interface MembershipDetail {
  id: string;
  tenantId: string;
  tenantName: string;
  role: "tenant_admin" | "tenant_user";
  clients: ClientRef[];
  createdAt: string;
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
