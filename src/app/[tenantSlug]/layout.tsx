import { AppShell } from "@/components/app-shell";

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
