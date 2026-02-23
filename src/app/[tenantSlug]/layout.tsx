import { AppShell } from "@/components/app-shell";
import { ClientProvider } from "@/contexts/client-context";

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientProvider>
      <AppShell>{children}</AppShell>
    </ClientProvider>
  );
}
