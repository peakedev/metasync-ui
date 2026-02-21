import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase
const mockInvoke = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

// Mock useTenant
const mockUseTenant = vi.fn();
vi.mock("@/hooks/use-tenant", () => ({
  useTenant: (...args: unknown[]) => mockUseTenant(...args),
}));

// Import after mocking
import { useMetaSyncMutation } from "../use-metasync-mutation";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe("useMetaSyncMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls supabase functions invoke with correct params", async () => {
    mockUseTenant.mockReturnValue({
      data: { id: "tenant-123", slug: "acme" },
    });

    mockInvoke.mockResolvedValue({
      data: { success: true },
      error: null,
    });

    const { result } = renderHook(
      () =>
        useMetaSyncMutation({
          path: "/api/models",
          method: "POST",
          tenantSlug: "acme",
        }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.mutate({ name: "test-model" });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockInvoke).toHaveBeenCalledWith("proxy", {
      body: {
        tenantId: "tenant-123",
        path: "/api/models",
        method: "POST",
        body: { name: "test-model" },
      },
    });
  });

  it("throws error when tenant not loaded", async () => {
    mockUseTenant.mockReturnValue({
      data: null,
    });

    const { result } = renderHook(
      () =>
        useMetaSyncMutation({
          path: "/api/models",
          tenantSlug: "acme",
        }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.mutate({ name: "test-model" });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("Tenant not loaded");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("invalidates query keys on success", async () => {
    mockUseTenant.mockReturnValue({
      data: { id: "tenant-123", slug: "acme" },
    });

    mockInvoke.mockResolvedValue({
      data: { id: "new-model" },
      error: null,
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useMetaSyncMutation({
          path: "/api/models",
          tenantSlug: "acme",
          invalidateKeys: [["models"], ["models", "list"]],
        }),
      { wrapper }
    );

    await act(async () => {
      result.current.mutate({ name: "new-model" });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["models"] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["models", "list"],
    });
  });
});
