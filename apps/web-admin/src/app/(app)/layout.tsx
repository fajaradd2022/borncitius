import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { apiGet } from "@/lib/api/client";

interface Me {
  id: string;
  email: string;
  name: string;
  role: string;
}

export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  // Identitas diambil dari API (bukan disimpan di klien) supaya sidebar selalu
  // mencerminkan sesi yang benar-benar valid di server.
  const me = await apiGet<Me>("/auth/me");

  return (
    <SidebarProvider>
      <AppSidebar user={{ name: me.name, role: me.role }} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
