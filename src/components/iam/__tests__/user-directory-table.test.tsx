import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { UserDirectoryTable } from "../user-directory-table";
import type { IAMMember } from "@/types/iam";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const mockItems: IAMMember[] = [
  {
    userId: "u1",
    email: "admin@acme.com",
    role: "tenant_admin",
    tenantId: "t1",
    tenantName: "Acme Corp",
    clients: [],
    membershipCreatedAt: "2024-01-15T00:00:00Z",
  },
  {
    userId: "u2",
    email: "user@acme.com",
    role: "tenant_user",
    tenantId: "t1",
    tenantName: "Acme Corp",
    clients: [{ clientId: "c1", clientName: "Client A" }],
    membershipCreatedAt: "2024-02-01T00:00:00Z",
  },
  {
    userId: "u3",
    email: "unassigned@acme.com",
    role: "tenant_user",
    tenantId: "t1",
    tenantName: "Acme Corp",
    clients: [],
    membershipCreatedAt: "2024-03-01T00:00:00Z",
  },
];

describe("UserDirectoryTable", () => {
  it("renders all columns correctly", () => {
    render(
      <UserDirectoryTable
        items={mockItems}
        total={3}
        page={0}
        pageSize={100}
        onPageChange={vi.fn()}
      />
    );

    expect(screen.getByText("admin@acme.com")).toBeInTheDocument();
    expect(screen.getByText("user@acme.com")).toBeInTheDocument();
    expect(screen.getByText("unassigned@acme.com")).toBeInTheDocument();
    expect(screen.getByText("Client A")).toBeInTheDocument();
  });

  it("shows 'Unassigned' badge when clients array is empty", () => {
    render(
      <UserDirectoryTable
        items={mockItems}
        total={3}
        page={0}
        pageSize={100}
        onPageChange={vi.fn()}
      />
    );

    const unassignedBadges = screen.getAllByText("Unassigned");
    expect(unassignedBadges.length).toBe(2); // admin has no client + unassigned user
  });

  it("links each row email to correct detail URL", () => {
    render(
      <UserDirectoryTable
        items={mockItems}
        total={3}
        page={0}
        pageSize={100}
        onPageChange={vi.fn()}
      />
    );

    const link = screen.getByText("admin@acme.com").closest("a");
    expect(link).toHaveAttribute("href", "/owner/iam/users/u1");
  });

  it("shows empty state when no items", () => {
    render(
      <UserDirectoryTable
        items={[]}
        total={0}
        page={0}
        pageSize={100}
        onPageChange={vi.fn()}
      />
    );

    expect(screen.getByText("No users found.")).toBeInTheDocument();
  });

  it("shows Admin badge for tenant_admin role", () => {
    render(
      <UserDirectoryTable
        items={mockItems}
        total={3}
        page={0}
        pageSize={100}
        onPageChange={vi.fn()}
      />
    );

    expect(screen.getByText("Admin")).toBeInTheDocument();
  });
});
