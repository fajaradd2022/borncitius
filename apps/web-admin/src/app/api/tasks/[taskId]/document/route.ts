import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_BASE, ACCESS_COOKIE } from "@/lib/api/client";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Generate lalu unduh dokumen akhir.
 *
 * Berkas dialirkan lewat server supaya token tidak perlu diberikan ke browser
 * hanya demi mengunduh satu berkas.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await ctx.params;
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  }

  const headers = { Authorization: `Bearer ${token}` };

  const gen = await fetch(`${API_BASE}/tasks/${taskId}/document`, { method: "POST", headers, cache: "no-store" });
  if (!gen.ok) {
    const body = (await gen.json().catch(() => null)) as { message?: string } | null;
    return NextResponse.json(
      { error: body?.message ?? "Gagal membuat dokumen." },
      { status: gen.status },
    );
  }

  const pdf = await fetch(`${API_BASE}/tasks/${taskId}/document/pdf`, { headers, cache: "no-store" });
  if (!pdf.ok) {
    return NextResponse.json({ error: "Dokumen dibuat tetapi gagal diunduh." }, { status: 502 });
  }

  return new NextResponse(await pdf.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": pdf.headers.get("content-disposition") ?? `attachment; filename="BAST-${taskId}.pdf"`,
    },
  });
}
