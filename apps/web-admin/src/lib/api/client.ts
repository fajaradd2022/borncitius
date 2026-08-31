import "server-only";
import { cookies } from "next/headers";

/**
 * Klien API untuk komponen server.
 *
 * Access token disimpan di cookie httpOnly sehingga tidak terjangkau JavaScript
 * di browser (mitigasi XSS). Semua panggilan ke backend terjadi di server,
 * jadi token tidak pernah melintas ke klien.
 */

export const API_BASE = process.env.API_URL ?? "http://localhost:4000/api";

export const ACCESS_COOKIE = "bc_access";
export const REFRESH_COOKIE = "bc_refresh";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
  const raw = data?.message;
  if (Array.isArray(raw)) return raw.join(", ");
  return raw ?? `Permintaan gagal (HTTP ${res.status}).`;
}

/** GET terautentikasi. Data selalu segar — dashboard tidak boleh menampilkan status basi. */
export async function apiGet<T>(path: string): Promise<T> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) throw new ApiError(401, "Sesi tidak ditemukan.");

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) throw new ApiError(res.status, await readError(res));
  return (await res.json()) as T;
}

export async function isAuthenticated(): Promise<boolean> {
  return Boolean((await cookies()).get(ACCESS_COOKIE)?.value);
}

export interface ApiTemplateDetail {
  id: string;
  name: string;
  version: number;
  fields: Array<{
    id: string;
    label: string;
    fieldType: string;
    section: string;
    orderIndex: number;
    isRequired: boolean;
    options: unknown;
  }>;
}

/** Dipakai route AI untuk mengetahui field apa saja yang boleh dirujuk layout. */
export async function getTemplateDetail(id: string): Promise<ApiTemplateDetail> {
  return apiGet<ApiTemplateDetail>(`/templates/${id}`);
}
