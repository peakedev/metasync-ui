import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import type { IAMAuthUser } from "@/types/iam";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  },
}));

import { OwnerRow } from "../owner-row";

const owner: IAMAuthUser = {
  id: "owner-1",
  email: "owner@example.com",
  provider: "email",
  createdAt: "2024-01-01T00:00:00Z",
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("OwnerRow", () => {
  it("renders owner email", () => {
    renderWithProviders(<OwnerRow owner={owner} isSelf={false} />);
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
  });

  it("shows 'You' badge when isSelf is true", () => {
    renderWithProviders(<OwnerRow owner={owner} isSelf={true} />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("does not show 'You' badge when isSelf is false", () => {
    renderWithProviders(<OwnerRow owner={owner} isSelf={false} />);
    expect(screen.queryByText("You")).not.toBeInTheDocument();
  });

  it("has disabled remove button", () => {
    renderWithProviders(<OwnerRow owner={owner} isSelf={true} />);
    const buttons = screen.getAllByRole("button");
    const removeButton = buttons.find((b) => b.querySelector(".lucide-trash-2"));
    expect(removeButton).toBeDisabled();
  });
});
