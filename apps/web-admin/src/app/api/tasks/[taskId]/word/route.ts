import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_BASE, ACCESS_COOKIE } from "@/lib/api/client";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await ctx.params;
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });

  const res = await fetch(`${API_BASE}/tasks/${taskId}/document/word`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return NextResponse.json({ error: body?.message ?? "Gagal membuat dokumen Word." }, { status: res.status });
  }

  return new NextResponse(await res.arrayBuffer(), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": res.headers.get("content-disposition") ?? `attachment; filename="BAST-${taskId}.docx"`,
    },
  });
}
