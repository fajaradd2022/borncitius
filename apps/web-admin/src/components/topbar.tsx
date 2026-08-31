import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export function Topbar({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <div className="flex flex-1 flex-col">
        <h1 className="text-base font-semibold leading-tight">{title}</h1>
        {description && (
          <p className="text-sm leading-tight text-muted-foreground">{description}</p>
        )}
      </div>
      {actions}
    </header>
  );
}
