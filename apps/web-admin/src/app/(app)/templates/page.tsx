import Link from "next/link";
import { FileStack, Plus } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api/client";

interface TemplateRow {
  id: string;
  name: string;
  description: string;
  version: number;
  isActive: boolean;
  _count: { fields: number };
}

export default async function TemplatesPage() {
  const templates = await apiGet<TemplateRow[]>("/templates");

  return (
    <>
      <Topbar
        title="Form Template"
        description="Template form job card/BAST yang dipakai untuk membuat task"
        actions={
          <Button size="sm" asChild>
            <Link href="/templates/new"><Plus className="size-4" />Buat Template</Link>
          </Button>
        }
      />
      <div className="grid flex-1 grid-cols-1 gap-4 p-4 sm:grid-cols-2 md:p-6 lg:grid-cols-3">
        {templates.map((tmpl) => (
          <Link key={tmpl.id} href={`/templates/${tmpl.id}`}>
            <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/40">
              <CardHeader className="flex flex-row items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileStack className="size-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base leading-tight">{tmpl.name}</CardTitle>
                    {!tmpl.isActive && (
                      <Badge variant="outline" className="text-xs font-normal">Nonaktif</Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tmpl.description}</p>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                <span>v{tmpl.version}</span>
                <span>{tmpl._count.fields} field</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
