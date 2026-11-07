"use client";

import { Capacitor } from "@capacitor/core";
import { db } from "./db";

/**
 * Klien API sisi browser/APK.
 *
 * Aplikasi ini di-build sebagai static export (bisa dibungkus Capacitor), jadi
 * semua permintaan dikirim langsung dari klien ke API dengan Bearer token.
 *
 * NEXT_PUBLIC_API_URL dibakar saat build:
 * - Web (Docker): "/api" — nginx meneruskan ke container API (same-origin).
 * - APK: URL absolut server kantor, mis. "https://fse.fajarsodiq.com/api".
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "/api").replace(/\/+$/, "");

const ACCESS_KEY = "bct_access";
const REFRESH_KEY = "bct_refresh";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Sesi ────────────────────────────────────────────────────────────────────

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveTokens({ accessToken, refreshToken }: TokenPair): void {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function hasSession(): boolean {
  return Boolean(readStorage(ACCESS_KEY));
}

async function clearSession(): Promise<void> {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  // Data task milik user sebelumnya tidak boleh terbaca user berikutnya.
  await db.cache.clear().catch(() => undefined);
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

export async function login(email: string, password: string): Promise<void> {
  let res: Response;
  try {
    res = await postJson("/auth/login", {
      email,
      password,
      deviceId: Capacitor.isNativePlatform() ? "android-teknisi" : "pwa-teknisi",
    });
  } catch {
    throw new ApiError(0, "Tidak bisa menghubungi server. Periksa koneksi Anda.");
  }
  if (!res.ok) {
    throw new ApiError(res.status, res.status === 401 ? "Email atau password salah." : "Login gagal. Coba lagi.");
  }
  saveTokens((await res.json()) as TokenPair);
}

export async function logout(): Promise<void> {
  const refreshToken = readStorage(REFRESH_KEY);
  if (refreshToken) await postJson("/auth/logout", { refreshToken }).catch(() => undefined);
  await clearSession();
}

/**
 * Tukar refresh token dengan pasangan token baru. Single-flight: beberapa
 * permintaan yang kena 401 bersamaan hanya memicu satu kali refresh.
 */
let refreshing: Promise<boolean> | null = null;

function refreshTokens(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = readStorage(REFRESH_KEY);
    if (!refreshToken) return false;
    try {
      const res = await postJson("/auth/refresh", { refreshToken });
      if (res.ok) {
        saveTokens((await res.json()) as TokenPair);
        return true;
      }
      // Hanya penolakan eksplisit server yang mengakhiri sesi — gangguan
      // jaringan tidak boleh membuat teknisi ter-logout di lokasi.
      if (res.status === 401 || res.status === 403) await clearSession();
      return false;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// ── Permintaan ──────────────────────────────────────────────────────────────

/**
 * fetch ke API dengan Bearer token. Saat 401, token di-refresh sekali lalu
 * permintaan diulang. Melempar TypeError bila jaringan gagal (bukan ApiError).
 */
export async function apiFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = readStorage(ACCESS_KEY);
  if (!token) throw new ApiError(401, "Sesi berakhir. Silakan masuk kembali.");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });

  if (res.status === 401 && retry && (await refreshTokens())) return apiFetch(path, init, false);
  if (res.status === 401) throw new ApiError(401, "Sesi berakhir. Silakan masuk kembali.");
  return res;
}

/**
 * GET JSON. Respons sukses disimpan di IndexedDB; saat jaringan putus, data
 * terakhir dipakai supaya form tugas tetap bisa dibuka di lokasi tanpa sinyal.
 */
export async function apiGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const cached = await db.cache.get(path);
    if (cached) return cached.data as T;
    throw new ApiError(0, "Tidak ada koneksi dan data belum tersimpan di perangkat.");
  }

  if (!res.ok) throw new ApiError(res.status, `Permintaan gagal (HTTP ${res.status}).`);
  const data = (await res.json()) as T;
  await db.cache.put({ key: path, data, savedAt: Date.now() }).catch(() => undefined);
  return data;
}

/** Path API detail tugas — dipakai halaman tugas & prefetch (kunci cache sama). */
export function taskPath(taskId: string): string {
  return `/tasks/${encodeURIComponent(taskId)}`;
}

/** Path API untuk berkas lampiran (dipakai AuthImage & tombol buka berkas). */
export function attachmentPath(attachmentId: string): string {
  return `/tasks/attachments/${attachmentId}/file`;
}

/**
 * Ambil berkas ber-auth sebagai object URL. Hasil di-cache per path agar
 * thumbnail dan lightbox tidak mengunduh berkas yang sama dua kali.
 */
const blobUrls = new Map<string, Promise<string>>();

export function authedObjectUrl(path: string): Promise<string> {
  let pending = blobUrls.get(path);
  if (!pending) {
    pending = apiFetch(path).then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, `Berkas gagal dimuat (HTTP ${res.status}).`);
      return URL.createObjectURL(await res.blob());
    });
    pending.catch(() => blobUrls.delete(path));
    blobUrls.set(path, pending);
  }
  return pending;
}
