import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { IAMNav } from "../iam-nav";

// Mock next/navigation
const mockPathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("IAMNav", () => {
  it("renders both tabs", () => {
    mockPathname.mockReturnValue("/owner/iam/users");
    render(<IAMNav />);

    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("Owners")).toBeInTheDocument();
  });

  it("highlights Users tab on /owner/iam/users", () => {
    mockPathname.mockReturnValue("/owner/iam/users");
    render(<IAMNav />);

    const usersLink = screen.getByText("Users");
    expect(usersLink.className).toContain("border-primary");
  });

  it("highlights Owners tab on /owner/iam/owners", () => {
    mockPathname.mockReturnValue("/owner/iam/owners");
    render(<IAMNav />);

    const ownersLink = screen.getByText("Owners");
    expect(ownersLink.className).toContain("border-primary");
  });
});
