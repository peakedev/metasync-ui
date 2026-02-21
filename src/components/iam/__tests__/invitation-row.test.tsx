import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { InvitationRow } from "../invitation-row";
import type { InvitationDetail } from "@/types/iam";

const pendingInvitation: InvitationDetail = {
  id: "inv-1",
  tenantId: "t1",
  tenantName: "Acme Corp",
  role: "tenant_admin",
  clientId: null,
  clientName: null,
  status: "pending",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  createdAt: "2024-01-15T00:00:00Z",
  updatedAt: "2024-01-15T00:00:00Z",
  invitedBy: "owner-1",
  email: "test@example.com",
};

const acceptedInvitation: InvitationDetail = {
  ...pendingInvitation,
  id: "inv-2",
  status: "accepted",
};

describe("InvitationRow", () => {
  it("shows resend and revoke buttons for pending invitations", () => {
    render(
      <InvitationRow
        invitation={pendingInvitation}
        onResend={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    expect(screen.getByText("Resend")).toBeInTheDocument();
    expect(screen.getByText("Revoke")).toBeInTheDocument();
  });

  it("hides action buttons for non-pending invitations", () => {
    render(
      <InvitationRow
        invitation={acceptedInvitation}
        onResend={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    expect(screen.queryByText("Resend")).not.toBeInTheDocument();
    expect(screen.queryByText("Revoke")).not.toBeInTheDocument();
  });

  it("shows confirmation dialog on revoke click", () => {
    render(
      <InvitationRow
        invitation={pendingInvitation}
        onResend={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Revoke"));
    expect(screen.getByText("Revoke invitation")).toBeInTheDocument();
  });

  it("calls onResend when resend is clicked", () => {
    const onResend = vi.fn();
    render(
      <InvitationRow
        invitation={pendingInvitation}
        onResend={onResend}
        onRevoke={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Resend"));
    expect(onResend).toHaveBeenCalled();
  });

  it("shows pending badge", () => {
    render(
      <InvitationRow
        invitation={pendingInvitation}
        onResend={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("shows accepted badge for accepted invitation", () => {
    render(
      <InvitationRow
        invitation={acceptedInvitation}
        onResend={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    expect(screen.getByText("accepted")).toBeInTheDocument();
  });
});
