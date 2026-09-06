import { redirect } from "next/navigation";
import { apiGet } from "@/lib/api/client";

interface Me {
  id: string;
  email: string;
  name: string;
  role: string;
}

/**
 * Guard halaman khusus admin. SPV (dan role lain) dialihkan ke /dashboard.
 * Dipakai di halaman Form Template, Output Layout, User Management.
 */
export async function requireAdmin(): Promise<Me> {
  const me = await apiGet<Me>("/auth/me");
  if (me.role !== "admin") redirect("/dashboard");
  return me;
}
