import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase
const mockFrom = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockGetSession = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

// Mock global fetch for edge function calls
vi.stubGlobal("fetch", mockFetch);

import { useIAMMutations } from "../use-iam-mutations";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return Wrapper;
};

describe("useIAMMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("changeRole", () => {
    it("sets client_id to null when promoting to tenant_admin", async () => {
      const eqChain = { eq: vi.fn().mockResolvedValue({ error: null }) };
      const updateChain = { eq: vi.fn().mockReturnValue(eqChain) };
      mockFrom.mockReturnValue({
        update: vi.fn().mockReturnValue(updateChain),
      });

      const { result } = renderHook(() => useIAMMutations(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.changeRole.mutate({
          tenantId: "t1",
          userId: "u1",
          newRole: "tenant_admin",
        });
      });

      await waitFor(() => {
        expect(result.current.changeRole.isSuccess).toBe(true);
      });

      expect(mockFrom).toHaveBeenCalledWith("tenant_memberships");
      // Verify the update payload includes client_id: null
      const updateCall = mockFrom.mock.results[0].value.update;
      expect(updateCall).toHaveBeenCalledWith({
        role: "tenant_admin",
        client_id: null,
      });
    });

    it("does not set client_id when changing to tenant_user", async () => {
      const eqChain = { eq: vi.fn().mockResolvedValue({ error: null }) };
      const updateChain = { eq: vi.fn().mockReturnValue(eqChain) };
      mockFrom.mockReturnValue({
        update: vi.fn().mockReturnValue(updateChain),
      });

      const { result } = renderHook(() => useIAMMutations(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.changeRole.mutate({
          tenantId: "t1",
          userId: "u1",
          newRole: "tenant_user",
        });
      });

      await waitFor(() => {
        expect(result.current.changeRole.isSuccess).toBe(true);
      });

      const updateCall = mockFrom.mock.results[0].value.update;
      expect(updateCall).toHaveBeenCalledWith({ role: "tenant_user" });
    });

    it("surfaces DB trigger error on last_admin_demotion", async () => {
      const eqChain = {
        eq: vi.fn().mockResolvedValue({
          error: { message: "last_admin_demotion: Cannot demote the last admin" },
        }),
      };
      const updateChain = { eq: vi.fn().mockReturnValue(eqChain) };
      mockFrom.mockReturnValue({
        update: vi.fn().mockReturnValue(updateChain),
      });

      const { result } = renderHook(() => useIAMMutations(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.changeRole.mutate({
          tenantId: "t1",
          userId: "u1",
          newRole: "tenant_user",
        });
      });

      await waitFor(() => {
        expect(result.current.changeRole.isError).toBe(true);
      });

      expect(result.current.changeRole.error?.message).toContain("last_admin_demotion");
    });
  });

  describe("revokeInvitation", () => {
    it("updates invitation status to expired", async () => {
      const eqResult = { eq: vi.fn().mockResolvedValue({ error: null }) };
      mockFrom.mockReturnValue({
        update: vi.fn().mockReturnValue(eqResult),
      });

      const { result } = renderHook(() => useIAMMutations(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.revokeInvitation.mutate({ invitationId: "inv-1" });
      });

      await waitFor(() => {
        expect(result.current.revokeInvitation.isSuccess).toBe(true);
      });

      expect(mockFrom).toHaveBeenCalledWith("invitations");
      const updateCall = mockFrom.mock.results[0].value.update;
      expect(updateCall).toHaveBeenCalledWith({ status: "expired" });
    });
  });

  describe("resendInvitation", () => {
    it("handles 429 too_many_requests response", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "too_many_requests" }),
      });

      const { result } = renderHook(() => useIAMMutations(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.resendInvitation.mutate({ invitationId: "inv-1" });
      });

      await waitFor(() => {
        expect(result.current.resendInvitation.isError).toBe(true);
      });

      expect(result.current.resendInvitation.error?.message).toBe("too_many_requests");
    });
  });

  describe("removeMembership", () => {
    it("surfaces DB trigger error on last_admin_removal", async () => {
      const eqChain = {
        eq: vi.fn().mockResolvedValue({
          error: { message: "last_admin_removal: Cannot remove the last admin" },
        }),
      };
      const deleteChain = { eq: vi.fn().mockReturnValue(eqChain) };
      mockFrom.mockReturnValue({
        delete: vi.fn().mockReturnValue(deleteChain),
      });

      const { result } = renderHook(() => useIAMMutations(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.removeMembership.mutate({
          tenantId: "t1",
          userId: "u1",
        });
      });

      await waitFor(() => {
        expect(result.current.removeMembership.isError).toBe(true);
      });

      expect(result.current.removeMembership.error?.message).toContain("last_admin_removal");
    });
  });
});
