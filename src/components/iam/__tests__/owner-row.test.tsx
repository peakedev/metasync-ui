import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { OwnerRow } from "../owner-row";
import type { IAMAuthUser } from "@/types/iam";

const owner: IAMAuthUser = {
  id: "owner-1",
  email: "owner@example.com",
  provider: "email",
  createdAt: "2024-01-01T00:00:00Z",
};

describe("OwnerRow", () => {
  it("renders owner email", () => {
    render(<OwnerRow owner={owner} isSelf={false} />);
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
  });

  it("shows 'You' badge when isSelf is true", () => {
    render(<OwnerRow owner={owner} isSelf={true} />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("does not show 'You' badge when isSelf is false", () => {
    render(<OwnerRow owner={owner} isSelf={false} />);
    expect(screen.queryByText("You")).not.toBeInTheDocument();
  });

  it("has disabled remove button", () => {
    render(<OwnerRow owner={owner} isSelf={true} />);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });
});
