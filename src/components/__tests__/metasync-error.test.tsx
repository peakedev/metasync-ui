import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MetaSyncError } from "../metasync-error";

// Mock next/link to render a plain anchor
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

describe("MetaSyncError", () => {
  it('renders "credentials not configured" message with link to config', () => {
    render(
      <MetaSyncError
        error="credentials_not_configured"
        tenantSlug="acme"
      />
    );

    expect(
      screen.getByText("MetaSync credentials not configured")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Please configure the backend URL and API key.")
    ).toBeInTheDocument();

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/acme/config");
    expect(screen.getByText("Go to Config")).toBeInTheDocument();
  });

  it('renders "backend unreachable" message with retry button', () => {
    const onRetry = vi.fn();

    render(
      <MetaSyncError error="backend_unreachable" onRetry={onRetry} />
    );

    expect(
      screen.getByText("MetaSync backend unreachable")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The backend server could not be reached. Please check the URL configuration."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("calls onRetry callback when retry button is clicked", () => {
    const onRetry = vi.fn();

    render(
      <MetaSyncError error="backend_unreachable" onRetry={onRetry} />
    );

    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders generic error message for unknown errors", () => {
    render(<MetaSyncError error="Something went wrong" />);

    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("no retry button shown when onRetry not provided", () => {
    render(<MetaSyncError error="backend_unreachable" />);

    expect(
      screen.getByText("MetaSync backend unreachable")
    ).toBeInTheDocument();
    expect(screen.queryByText("Retry")).not.toBeInTheDocument();
  });
});
