import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, FileClock, Send } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiGet } from "@/lib/api/client";
import type { TaskStatus } from "@/lib/types";

// PRD Bagian 11 — ringkasan dihitung di database (groupBy), bukan dengan
// menarik seluruh task lalu menghitung di sini.

interface Summary {
  statusCounts: Record<TaskStatus, number>;
  perFolder: Array<Record<string, string | number>>;
  overdue: Array<{
    id: string;
    siteId: string | null;
    status: TaskStatus;
    dueDate: string;
    folder: { id: string; name: string };
    assignedTeknisi: { name: string };
  }>;
}

const CARDS: { status: TaskStatus; label: string; icon: typeof Clock }[] = [
  { status: "assigned", label: "Assigned", icon: Clock },
  { status: "in_progress", label: "In Progress", icon: FileClock },
  { status: "submitted", label: "Menunggu Review", icon: Send },
  { status: "rejected", label: "Rejected", icon: AlertTriangle },
  { status: "approved", label: "Approved", icon: CheckCircle2 },
];

const STATUSES: TaskStatus[] = ["assigned", "in_progress", "submitted", "rejected", "approved"];

export default async function DashboardPage() {
  const data = await apiGet<Summary>("/dashboard/summary");

  return (
    <>
      <Topbar title="Dashboard" description="Ringkasan status task di seluruh folder" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {CARDS.map(({ status, label, icon: Icon }) => (
            <Card key={status}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{data.statusCounts[status] ?? 0}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Ringkasan per Folder</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folder</TableHead>
                  <TableHead>Klien</TableHead>
                  {STATUSES.map((s) => (
                    <TableHead key={s} className="text-center capitalize">
                      {s.replace("_", " ")}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.perFolder.map((row) => (
                  <TableRow key={String(row.id)}>
                    <TableCell className="font-medium">
                      <Link href={`/folders/${row.id}`} className="hover:underline">{String(row.name)}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{String(row.clientName)}</TableCell>
                    {STATUSES.map((s) => (
                      <TableCell key={s} className="text-center">{Number(row[s] ?? 0)}</TableCell>
                    ))}
                  </TableRow>
                ))}
                {data.perFolder.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Belum ada task.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Task Overdue / Lama Belum Direview</CardTitle></CardHeader>
          <CardContent>
            {data.overdue.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada task overdue saat ini.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site / Task</TableHead>
                    <TableHead>Folder</TableHead>
                    <TableHead>Teknisi</TableHead>
                    <TableHead>Jatuh Tempo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.overdue.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">
                        <Link href={`/tasks/${t.id}`} className="hover:underline">
                          {t.siteId ?? t.id.slice(0, 8)}
                        </Link>
                      </TableCell>
                      <TableCell>{t.folder.name}</TableCell>
                      <TableCell>{t.assignedTeknisi.name}</TableCell>
                      <TableCell className="text-destructive">
                        {new Date(t.dueDate).toLocaleDateString("id-ID", {
                          day: "2-digit", month: "short", year: "numeric",
                        })}
                      </TableCell>
                      <TableCell><StatusBadge status={t.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
