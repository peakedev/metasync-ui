"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/owner/iam/users", label: "Users" },
  { href: "/owner/iam/invitations", label: "Invitations" },
  { href: "/owner/iam/owners", label: "Owners" },
];

export function IAMNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 border-b mb-6">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "pb-2 px-1 text-sm font-medium border-b-2 transition-colors",
            pathname.startsWith(tab.href)
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
