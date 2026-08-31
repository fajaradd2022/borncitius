import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api/client";
import { CreateFolderDialog } from "@/components/folder-detail/create-folder-dialog";

interface FolderRow {
  id: string;
  name: string;
  clientName: string;
  defaultReviewer: { id: string; name: string };
  _count: { tasks: number };
}

export default async function FoldersPage() {
  const [folders, users] = await Promise.all([
    apiGet<FolderRow[]>("/folders"),
    apiGet<Array<{ id: string; name: string; role: string; isActive: boolean }>>("/users").catch(
      // Pembuatan folder admin-only, tapi endpoint /users sendiri juga
      // admin-only — jaga-jaga kalau halaman ini pernah diakses non-admin,
      // daripada seluruh halaman gagal render.
      () => [],
    ),
  ]);
  const reviewerOptions = users
    .filter((u) => (u.role === "admin" || u.role === "spv") && u.isActive)
    .map((u) => ({ id: u.id, name: u.name }));

  return (
    <>
      <Topbar
        title="Folder & Task"
        description="Kelompok task per klien/project"
        actions={<CreateFolderDialog reviewerOptions={reviewerOptions} />}
      />
      <div className="grid flex-1 grid-cols-1 gap-4 p-4 sm:grid-cols-2 md:p-6 lg:grid-cols-3">
        {folders.map((folder) => (
          <Link key={folder.id} href={`/folders/${folder.id}`}>
            <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/40">
              <CardHeader className="flex flex-row items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FolderKanban className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-base leading-tight">{folder.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{folder.clientName}</p>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Reviewer: <span className="text-foreground">{folder.defaultReviewer.name}</span>
                </span>
                <Badge variant="secondary">{folder._count.tasks} task</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {folders.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
            Belum ada folder.
          </p>
        )}
      </div>
    </>
  );
}
