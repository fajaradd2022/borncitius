import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_BASE, ACCESS_COOKIE } from "@/lib/api/client";

export const runtime = "nodejs";

/**
 * Proxy tipis dari PWA ke API.
 *
 * Antrian offline berjalan di browser dan tidak bisa membaca cookie httpOnly,
 * jadi permintaannya dilewatkan ke sini; token ditambahkan di server. Dengan
 * begitu token tetap tidak pernah terekspos ke JavaScript klien.
 *
 * Hanya path di bawah /tasks yang diteruskan — proxy ini bukan pintu terbuka
 * ke seluruh API.
 */

const ALLOWED_PREFIX = "tasks";
const MAX_BODY_BYTES = 25 * 1024 * 1024;

async function forward(request: Request, path: string[]): Promise<NextResponse> {
  if (path[0] !== ALLOWED_PREFIX) {
    return NextResponse.json({ error: "Endpoint tidak diizinkan." }, { status: 403 });
  }

  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  }

  const target = `${API_BASE}/${path.join("/")}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

  let body: BodyInit | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      // FormData diteruskan apa adanya; boundary diatur ulang oleh fetch.
      body = await request.formData();
    } else {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) {
        return NextResponse.json({ error: "Payload terlalu besar." }, { status: 413 });
      }
      // DELETE sering dikirim tanpa body sama sekali — jangan paksa jadi
      // Content-Type JSON kalau memang tidak ada isinya.
      if (text.length > 0) {
        headers["Content-Type"] = "application/json";
        body = text;
      }
    }
  }

  try {
    const res = await fetch(target, { method: request.method, headers, body, cache: "no-store" });
    // arrayBuffer (bukan text()) supaya respons biner (foto/PDF lampiran)
    // tidak rusak saat diteruskan lewat proxy ini.
    const payload = await res.arrayBuffer();
    return new NextResponse(payload, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Tidak bisa menghubungi server." }, { status: 502 });
  }
}

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await ctx.params).path);
}
export async function POST(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await ctx.params).path);
}
export async function PATCH(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await ctx.params).path);
}
export async function DELETE(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await ctx.params).path);
}
