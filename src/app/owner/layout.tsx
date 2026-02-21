import { AppShell } from "@/components/app-shell";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
