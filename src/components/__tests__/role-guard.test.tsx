import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RoleGuard } from "../role-guard";

// Mock the useSession hook
const mockUseSession = vi.fn();
vi.mock("@/hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

describe("RoleGuard", () => {
  beforeEach(() => {
    mockUseSession.mockReset();
  });

  it("renders null while loading", () => {
    mockUseSession.mockReturnValue({
      claims: {},
      loading: true,
    });

    const { container } = render(
      <RoleGuard role="owner">
        <p>Protected content</p>
      </RoleGuard>
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders children when user has matching role (string)", () => {
    mockUseSession.mockReturnValue({
      claims: { user_role: "owner" },
      loading: false,
    });

    render(
      <RoleGuard role="owner">
        <p>Protected content</p>
      </RoleGuard>
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("renders children when user has matching role (array)", () => {
    mockUseSession.mockReturnValue({
      claims: { user_role: "tenant_admin" },
      loading: false,
    });

    render(
      <RoleGuard role={["owner", "tenant_admin"]}>
        <p>Admin content</p>
      </RoleGuard>
    );

    expect(screen.getByText("Admin content")).toBeInTheDocument();
  });

  it("renders fallback when user role doesn't match", () => {
    mockUseSession.mockReturnValue({
      claims: { user_role: "tenant_user" },
      loading: false,
    });

    render(
      <RoleGuard role="owner" fallback={<p>Access denied</p>}>
        <p>Protected content</p>
      </RoleGuard>
    );

    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders fallback when no user_role set", () => {
    mockUseSession.mockReturnValue({
      claims: {},
      loading: false,
    });

    render(
      <RoleGuard role="owner" fallback={<p>No role</p>}>
        <p>Protected content</p>
      </RoleGuard>
    );

    expect(screen.getByText("No role")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });
});
