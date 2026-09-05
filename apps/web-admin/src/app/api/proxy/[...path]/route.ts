import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_BASE, ACCESS_COOKIE } from "@/lib/api/client";

export const runtime = "nodejs";

/**
 * Proxy dari komponen klien ke API.
 *
 * Token ada di cookie httpOnly yang tidak terbaca JavaScript, jadi permintaan
 * dari klien dilewatkan ke sini dan token ditambahkan di server.
 *
 * Hanya path yang benar-benar dipakai UI yang diteruskan — proxy ini bukan
 * pintu terbuka ke seluruh API.
 */
const ALLOWED = new Set(["tasks", "templates", "layouts", "users", "folders"]);

async function forward(request: Request, path: string[]): Promise<NextResponse> {
  if (!ALLOWED.has(path[0])) {
    return NextResponse.json({ message: "Endpoint tidak diizinkan." }, { status: 403 });
  }

  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ message: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: BodyInit | undefined;

  // Deteksi multipart/form-data (upload berkas: foto/dokumen). Untuk ini body
  // TIDAK boleh dibaca sebagai teks lalu dipaksa jadi JSON — teruskan stream
  // apa adanya beserta Content-Type asli (termasuk boundary) agar file utuh.
  const incomingCT = request.headers.get("content-type") ?? "";
  const isMultipart = incomingCT.startsWith("multipart/form-data");

  if (request.method !== "GET" && request.method !== "DELETE") {
    if (isMultipart) {
      body = await request.arrayBuffer();
      headers["Content-Type"] = incomingCT; // pertahankan boundary
    } else {
      body = await request.text();
      headers["Content-Type"] = "application/json";
    }
  } else if (request.method === "DELETE") {
    const text = await request.text();
    if (text) {
      body = text;
      headers["Content-Type"] = "application/json";
    }
  }

  try {
    const res = await fetch(`${API_BASE}/${path.join("/")}`, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });
    // arrayBuffer (bukan text()) supaya respons biner (foto/PDF, mis. saat
    // preview lampiran) tidak rusak saat diteruskan lewat proxy ini.
    return new NextResponse(await res.arrayBuffer(), {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ message: "Tidak bisa menghubungi server." }, { status: 502 });
  }
}

export async function GET(r: Request, c: { params: Promise<{ path: string[] }> }) {
  return forward(r, (await c.params).path);
}
export async function POST(r: Request, c: { params: Promise<{ path: string[] }> }) {
  return forward(r, (await c.params).path);
}
export async function PATCH(r: Request, c: { params: Promise<{ path: string[] }> }) {
  return forward(r, (await c.params).path);
}
export async function PUT(r: Request, c: { params: Promise<{ path: string[] }> }) {
  return forward(r, (await c.params).path);
}
export async function DELETE(r: Request, c: { params: Promise<{ path: string[] }> }) {
  return forward(r, (await c.params).path);
}
