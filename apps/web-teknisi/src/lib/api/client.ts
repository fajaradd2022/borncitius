import "server-only";
import { cookies } from "next/headers";

export const API_BASE = process.env.API_URL ?? "http://localhost:4000/api";
export const ACCESS_COOKIE = "bct_access";
export const REFRESH_COOKIE = "bct_refresh";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) throw new ApiError(401, "Sesi tidak ditemukan.");

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(res.status, `Permintaan gagal (HTTP ${res.status}).`);
  return (await res.json()) as T;
}
