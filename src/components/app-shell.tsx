"use client";

import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession, type AppClaims } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import {
  LayoutDashboard,
  Settings,
  Users,
  Cpu,
  FileText,
  GitBranch,
  Briefcase,
  HardDrive,
  MessageSquare,
  Play,
  Building2,
  LogOut,
  User,
  Key,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function getNavItems(claims: AppClaims, tenantSlug?: string): NavItem[] {
  if (claims.user_role === "owner") {
    return [
      { href: "/owner/tenants", label: "Tenants", icon: <Building2 className="h-4 w-4" /> },
    ];
  }

  if (!tenantSlug) return [];

  const base = `/${tenantSlug}`;
  const items: NavItem[] = [
    { href: `${base}/dashboard`, label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  ];

  if (claims.user_role === "tenant_admin") {
    items.push(
      { href: `${base}/config`, label: "Config", icon: <Settings className="h-4 w-4" /> },
      { href: `${base}/clients`, label: "Clients", icon: <Key className="h-4 w-4" /> },
      { href: `${base}/models`, label: "Models", icon: <Cpu className="h-4 w-4" /> },
      { href: `${base}/users`, label: "Users", icon: <Users className="h-4 w-4" /> }
    );
  }

  if (claims.client_id || claims.user_role === "tenant_admin") {
    items.push(
      { href: `${base}/prompts`, label: "Prompts", icon: <FileText className="h-4 w-4" /> },
      { href: `${base}/prompt-flows`, label: "Flows", icon: <GitBranch className="h-4 w-4" /> },
      { href: `${base}/jobs`, label: "Jobs", icon: <Briefcase className="h-4 w-4" /> },
      { href: `${base}/workers`, label: "Workers", icon: <HardDrive className="h-4 w-4" /> },
      { href: `${base}/streams`, label: "Streams", icon: <MessageSquare className="h-4 w-4" /> },
      { href: `${base}/runs`, label: "Runs", icon: <Play className="h-4 w-4" /> }
    );
  }

  return items;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, claims, loading } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <>{children}</>;
  }

  // Extract tenant slug from path
  const pathParts = pathname.split("/").filter(Boolean);
  const tenantSlug =
    pathParts[0] !== "owner" && pathParts[0] !== "auth" && pathParts[0] !== "login" && pathParts[0] !== "invite" && pathParts[0] !== "403"
      ? pathParts[0]
      : undefined;

  const navItems = getNavItems(claims, tenantSlug);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/" className="font-semibold text-lg">
            MetaSync UI
          </Link>
        </div>
        <nav className="space-y-1 p-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${
                pathname.startsWith(item.href) ? "bg-accent font-medium" : "text-muted-foreground"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-end border-b px-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <User className="h-4 w-4" />
                {user.email}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <Separator />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
