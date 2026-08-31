"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_BASE, ACCESS_COOKIE, REFRESH_COOKIE } from "./client";

export interface LoginState {
  error?: string;
}

/** Login teknisi. Token disimpan di cookie httpOnly, tidak di localStorage. */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email dan password wajib diisi." };

  let data: { accessToken: string; refreshToken: string; user: { role: string; name: string } };
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, deviceId: "pwa-teknisi" }),
      cache: "no-store",
    });
    if (!res.ok) {
      return { error: res.status === 401 ? "Email atau password salah." : "Login gagal. Coba lagi." };
    }
    data = await res.json();
  } catch {
    return { error: "Tidak bisa menghubungi server. Periksa koneksi Anda." };
  }

  const store = await cookies();
  const secure = process.env.NODE_ENV === "production";
  store.set(ACCESS_COOKIE, data.accessToken, {
    // Selaras dengan JWT_ACCESS_TTL=30d di apps/api/.env dan REFRESH_COOKIE
    // di bawah — sengaja disamakan supaya teknisi tidak dipaksa relogin
    // tiap 15 menit padahal refresh token 30 hari sudah ada tapi tidak dipakai.
    httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  store.set(REFRESH_COOKIE, data.refreshToken, {
    httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  store.set("bct_name", data.user.name, {
    httpOnly: false, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    }).catch(() => undefined);
  }
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
  store.delete("bct_name");
  redirect("/masuk");
}
