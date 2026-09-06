import Link from "next/link";
import { FileOutput, Plus, Star } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api/client";
import { requireAdmin } from "@/lib/require-admin";

interface LayoutRow {
  id: string;
  name: string;
  isDefault: boolean;
  sourceTemplate: { id: string; name: string };
  _count: { blocks: number };
}

export default async function LayoutsPage() {
  await requireAdmin();
  const layouts = await apiGet<LayoutRow[]>("/layouts");

  return (
    <>
      <Topbar
        title="Output Layout"
        description="Desain tampilan dokumen PDF — bisa beda per klien meski template sama"
        actions={
          <Button size="sm" asChild>
            <Link href="/layouts/new"><Plus className="size-4" />Buat Layout</Link>
          </Button>
        }
      />
      <div className="grid flex-1 grid-cols-1 gap-4 p-4 sm:grid-cols-2 md:p-6 lg:grid-cols-3">
        {layouts.map((l) => (
          <Link key={l.id} href={`/layouts/${l.id}`}>
            <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/40">
              <CardHeader className="flex flex-row items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileOutput className="size-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base leading-tight">{l.name}</CardTitle>
                    {l.isDefault && (
                      <Badge variant="secondary" className="gap-1 text-xs font-normal">
                        <Star className="size-3" />Default
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sumber: {l.sourceTemplate.name}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {l._count.blocks} blok
              </CardContent>
            </Card>
          </Link>
        ))}
        {layouts.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
            Belum ada layout. Buat satu untuk menentukan tampilan dokumen PDF.
          </p>
        )}
      </div>
    </>
  );
}
