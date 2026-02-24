import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Store the auth state change callback so we can trigger it in tests
let authStateCallback: (event: string, session: unknown) => void;

const mockUnsubscribe = vi.fn();
const mockGetSession = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        authStateCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe: mockUnsubscribe,
            },
          },
        };
      },
    },
  },
}));

// Import after mocking
import { useSession } from "../use-session";

function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

describe("useSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: getSession resolves with no session
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });
  });

  it("starts with loading=true", () => {
    // Make getSession never resolve during this test
    mockGetSession.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSession());

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it("sets user and session after getSession resolves", async () => {
    const fakeUser = { id: "user-1" };
    const fakeSession = {
      user: fakeUser,
      access_token: fakeJwt({ app_metadata: { user_role: "owner", tenant_id: "t-1" } }),
    };

    mockGetSession.mockResolvedValue({
      data: { session: fakeSession },
    });

    const { result } = renderHook(() => useSession());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual(fakeUser);
    expect(result.current.session).toEqual(fakeSession);
  });

  it("extracts claims from JWT access_token", async () => {
    const fakeUser = { id: "user-1" };
    const fakeSession = {
      user: fakeUser,
      access_token: fakeJwt({
        app_metadata: { user_role: "tenant_admin", tenant_id: "t-2" },
      }),
    };

    mockGetSession.mockResolvedValue({
      data: { session: fakeSession },
    });

    const { result } = renderHook(() => useSession());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.claims).toEqual({
      user_role: "tenant_admin",
      tenant_id: "t-2",
    });
  });

  it("returns empty claims when no session", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const { result } = renderHook(() => useSession());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.claims).toEqual({});
  });

  it("subscribes to auth state changes and cleans up", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const { result, unmount } = renderHook(() => useSession());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Simulate auth state change with JWT containing claims
    const newUser = { id: "user-2" };
    const newSession = {
      user: newUser,
      access_token: fakeJwt({ app_metadata: { user_role: "owner" } }),
    };

    act(() => {
      authStateCallback("SIGNED_IN", newSession);
    });

    expect(result.current.user).toEqual(newUser);
    expect(result.current.session).toEqual(newSession);
    expect(result.current.claims).toEqual({ user_role: "owner" });

    // Cleanup on unmount
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
