"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_BASE, ACCESS_COOKIE, REFRESH_COOKIE } from "./client";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; role: string };
}

export interface LoginState {
  error?: string;
}

/**
 * Login lewat Server Action.
 *
 * Token disimpan di cookie httpOnly + sameSite=lax; `secure` menyala di
 * produksi. Kredensial tidak pernah menyentuh JavaScript browser.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email dan password wajib diisi." };
  }

  let data: LoginResponse;
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, deviceId: "web-admin" }),
      cache: "no-store",
    });

    if (!res.ok) {
      // Pesan dari server sengaja tidak membedakan email salah vs password salah.
      return { error: res.status === 401 ? "Email atau password salah." : "Login gagal. Coba lagi." };
    }
    data = (await res.json()) as LoginResponse;
  } catch {
    return { error: "Tidak bisa menghubungi server. Pastikan API berjalan." };
  }

  if (data.user.role === "teknisi") {
    return { error: "Akun teknisi tidak bisa masuk ke dashboard admin." };
  }

  const store = await cookies();
  const secure = process.env.NODE_ENV === "production";

  store.set(ACCESS_COOKIE, data.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    // Selaras dengan JWT_ACCESS_TTL=30d di apps/api/.env dan REFRESH_COOKIE
    // di bawah — sengaja disamakan supaya user tidak dipaksa relogin tiap
    // 15 menit padahal refresh token 30 hari sudah ada tapi tidak dipakai.
    maxAge: 60 * 60 * 24 * 30,
  });
  store.set(REFRESH_COOKIE, data.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    // Sesi juga dicabut di server, bukan sekadar menghapus cookie di browser.
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    }).catch(() => undefined);
  }

  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
  redirect("/login");
}
